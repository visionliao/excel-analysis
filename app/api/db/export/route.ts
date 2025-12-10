// app/api/db/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Client, types } from 'pg'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { calculateIncrementalDiff } from '@/lib/db/db-diff'

// =============================================================================
// 配置 pg 驱动：读取日期、时间时保持字符串
// =============================================================================
types.setTypeParser(1082, (val) => val);
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

// 1. 数据清洗与恢复中心
class DataSanitizer {
  /**
   * 尝试修复异常数据
   * @param value 原始值
   * @param sqlType 目标数据库类型
   * @returns 修复后的值 (如果无法修复，返回原始值，交给后续流程报错)
   */
  static tryRecover(value: any, sqlType: string): any {
    if (value === null || value === undefined || value === '') return null;
    const typeUpper = sqlType.toUpperCase();
    const strVal = String(value).trim();

    // 策略 A: 针对日期时间类型的修复
    if (typeUpper.includes('DATE') || typeUpper.includes('TIME') || typeUpper.includes('TIMESTAMP')) {
      return this.recoverDate(strVal, typeUpper);
    }

    // 策略 B: 针对数值类型的修复 (比如带逗号的金额 "1,234.56" 或带货币符号)
    if (typeUpper.includes('INT') || typeUpper.includes('DECIMAL') || typeUpper.includes('NUMERIC')) {
      return this.recoverNumber(strVal);
    }

    // 策略 C: 针对布尔值的修复
    if (typeUpper.includes('BOOL')) {
      return this.recoverBoolean(strVal);
    }

    // 默认返回原始值
    return value;
  }

  /**
   * 日期修复策略
   * 能够处理被截断的时间、非标准分隔符等
   */
  private static recoverDate(rawStr: string, targetType: string): any {
    let cleanStr = rawStr;
    // 1. 处理截断 (24/10/31 05:)
    if (cleanStr.includes(' ')) {
      const parts = cleanStr.split(' ');
      // 尝试取第一部分，如果看起来像日期
      if (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.')) {
        cleanStr = parts[0];
      }
    }

    let d = new Date(cleanStr);

    // 2. 尝试解析非标准格式 YY/MM/DD
    if (isNaN(d.getTime()) && (cleanStr.includes('/') || cleanStr.includes('.'))) {
      const parts = cleanStr.split(/[\/\.]/);
      if (parts.length === 3) {
        let y = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        if (y < 100) y += (y > 50 ? 1900 : 2000);
        const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        d = new Date(isoStr);
      }
    }

    // 3. 返回字符串，而不是 Date 对象，防止数据库时区转换导致日期相差8个小时
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');

      if (targetType.includes('DATE')) {
        return `${y}-${m}-${day}`;
      }
      // TIMESTAMP
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}:${s}`;
    }

    return rawStr;
  }

  /**
   * 数值修复策略
   */
  private static recoverNumber(rawStr: string): string {
    if (rawStr.includes(',')) return rawStr.replace(/,/g, '');
    if (rawStr.startsWith('¥') || rawStr.startsWith('$')) return rawStr.substring(1);
    // 处理 (100) -> -100
    if (rawStr.startsWith('(') && rawStr.endsWith(')')) return '-' + rawStr.slice(1, -1);
    return rawStr;
  }

  /**
   * 布尔值修复策略
   */
  private static recoverBoolean(rawStr: string): string {
    const lower = rawStr.toLowerCase();
    if (['yes', 'y', 'on', 'ok', '1'].includes(lower)) return 'true';
    if (['no', 'n', 'off', '0'].includes(lower)) return 'false';
    return rawStr;
  }
}

// 强制将 Date 对象转换为本地时间字符串
function forceDateToString(d: Date, type: string): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    // 如果是 DATE 类型，只返回 YYYY-MM-DD
    if (type.toUpperCase().includes('DATE')) {
        return `${y}-${m}-${day}`;
    }
    // TIMESTAMP 返回 YYYY-MM-DD HH:mm:ss (本地时间)
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

// 2. 基础校验逻辑
function validateValue(value: any, sqlType: string): string | null {
  if (value === null || value === undefined || value === '') return null;

  // 如果value已经是Date对象（被Sanitizer修复过），直接通过
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '无效的日期对象';
    return null;
  }

  const strVal = String(value).trim();
  const typeUpper = sqlType.toUpperCase();

  // 整数
  if (typeUpper.includes('INT') || typeUpper.includes('SERIAL')) {
    if (!/^-?\d+$/.test(strVal)) return `"${strVal}" 不是有效的整数`;
  }

  // 小数/金额
  if (typeUpper.includes('DECIMAL') || typeUpper.includes('NUMERIC') || typeUpper.includes('FLOAT')) {
    if (isNaN(Number(strVal))) return `"${strVal}" 不是有效的数字`;
  }

  // 布尔
  if (typeUpper.includes('BOOL')) {
    const validBools = ['true', 'false', '1', '0', 't', 'f'];
    if (!validBools.includes(strVal.toLowerCase())) return `"${strVal}" 不是有效的布尔值`;
  }

  // 日期 (字符串形式)
  if (typeUpper.includes('DATE') || typeUpper.includes('TIME')) {
    const date = new Date(strVal);
    if (isNaN(date.getTime())) return `"${strVal}" 不是有效的日期格式`;
  }

  return null;
}

// 3. 导出主逻辑
export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, timestamp } = await req.json();
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;
    const strategy = process.env.DB_UPDATE_STRATEGY || 'incremental';

    if (!targetConnectionString || !timestamp) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    // 读取缓存
    const cachePath = join(process.cwd(), 'output', 'cache', `ready_to_export_${timestamp}.json`);
    if (!existsSync(cachePath)) {
      return NextResponse.json({ success: false, error: '缓存不存在，请重新检查数据' }, { status: 400 });
    }
    const cacheContent = await readFile(cachePath, 'utf-8');
    const { tables, relationships } = JSON.parse(cacheContent);

    client = new Client({ connectionString: targetConnectionString, statement_timeout: 60000 });
    await client.connect();

    // 使用事务保护
    await client.query('BEGIN');

    // 统计数据
    let totalTablesProcessed = 0;
    let totalRowsInserted = 0;
    let totalRowsUpdated = 0;

    for (const table of tables) {
      const { tableName, columns, rows } = table;
      let rowsToInsert = rows;
      let rowsToUpdate: any[] = [];

      // 1. 判断操作模式
      let needCreateTable = false;

      // 利用 Diff 逻辑判断表状态
      const diff = await calculateIncrementalDiff(client, tableName, columns, rows);

      if (diff.isNewTable) {
        // 数据库不存在该表
        needCreateTable = true;
      } else if (diff.isSchemaChanged) {
        // 数据库存在该表，但是表结构变化了，必须清理和重建
        console.log(`[Export] Schema changed for ${tableName}, rebuilding...`);
        await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        needCreateTable = true;
      } else {
        // 表存在且结构一致
        if (strategy === 'overwrite') {
          // 全量模式
          await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
          needCreateTable = true;
        } else {
          // 增量模式
          rowsToInsert = diff.toInsert;
          rowsToUpdate = diff.toUpdate || [];
          if (rowsToInsert.length === 0 && rowsToUpdate.length === 0) {
            console.log(`[Export] ${tableName}: No changes.`);
            continue;
          }
          console.log(`[Export] ${tableName}: Insert ${rowsToInsert.length}, Update ${rowsToUpdate.length}`);
        }
      }

      // 2. 建表 (如果需要)
      if (needCreateTable) {
        const colDefs = columns.map((c: any) => `"${c.name}" ${c.type}`).join(',\n');
        await client.query(`CREATE TABLE "${tableName}" (id SERIAL PRIMARY KEY, ${colDefs})`);
        rowsToInsert = rows; // 新表全量插入
      }

      // 3. 插入
      if (rowsToInsert.length > 0) {
        // 计数
        totalTablesProcessed++;
        const keys = columns.map((c: any) => `"${c.name}"`).join(', ');
        const BATCH_SIZE = 500;

        for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
          const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
          const values: any[] = [];
          const placeholders: string[] = [];
          let paramIndex = 1;

          for (let rowIndex = 0; rowIndex < batch.length; rowIndex++) {
            const row = batch[rowIndex];
            const rowPlaceholders: string[] = [];

            for (const col of columns) {
              let val = row[col.originalName];

              // val 是标准的 JS Date 对象 (parseExcelBuffer 产生)
              if (val instanceof Date) {
                val = forceDateToString(val, col.type);
              }

              let errorMsg = validateValue(val, col.type);
              if (errorMsg) {
                const originalVal = val;
                val = DataSanitizer.tryRecover(val, col.type);
                errorMsg = validateValue(val, col.type);
                if (errorMsg) {
                  const errorDetail = {
                    tableName: tableName,
                    rowNumber: i + rowIndex + 1,
                    columnName: col.originalName,
                    targetType: col.type,
                    invalidValue: String(originalVal),
                    message: errorMsg,
                    rowData: row
                  };
                  console.error('\n================ EXPORT VALIDATION ERROR ================');
                  console.error(JSON.stringify(errorDetail, null, 2));
                  console.error('=========================================================\n');

                  await client.query('ROLLBACK');
                  return NextResponse.json({
                    success: false,
                    errorType: 'VALIDATION_ERROR',
                    error: `数据校验失败: ${errorMsg}`,
                    details: errorDetail
                  }, { status: 400 });
                }
              }
              if (val === undefined || val === '') val = null;
              values.push(val);
              rowPlaceholders.push(`$${paramIndex++}`);
            }
            placeholders.push(`(${rowPlaceholders.join(',')})`);
          }
          const insertSql = `INSERT INTO "${tableName}" (${keys}) VALUES ${placeholders.join(',')}`;
          await client.query(insertSql, values);
        }
        // 累加行数
        totalRowsInserted += rowsToInsert.length;
      }

      // 4. 更新 (基于 ID)
      if (rowsToUpdate.length > 0) {
        if (rowsToInsert.length === 0) totalTablesProcessed++; // 如果只更新不插入，也算处理了

        for (const item of rowsToUpdate) {
          const targetId = item.id; // DB ID
          const rowData = item.data; // Excel Row

          const setParts: string[] = [];
          const values: any[] = [];
          let paramIdx = 1;

          for (const col of columns) {
            let val = rowData[col.originalName];

            // 日期转字符串
            if (val instanceof Date) val = forceDateToString(val, col.type);

            // 容错处理
            let err = validateValue(val, col.type);
            if (err) val = DataSanitizer.tryRecover(val, col.type);
            if (val === undefined || val === '') val = null;

            setParts.push(`"${col.name}" = $${paramIdx++}`);
            values.push(val);
          }

          values.push(targetId);
          const updateSql = `UPDATE "${tableName}" SET ${setParts.join(', ')} WHERE id = $${paramIdx}`;
          await client.query(updateSql, values);
        }
        totalRowsUpdated += rowsToUpdate.length;
      }
    }

    // 提交数据事务 (确保数据安全落地)
    await client.query('COMMIT');
    console.log(`✅ [DB Export] Data transaction committed.`);

    // 建立外键关联
    // 移出 Transaction，避免因为外键约束失败导致整个数据导入回滚
    if (relationships && relationships.length > 0) {
      console.log(`[DB Export] Processing ${relationships.length} foreign keys...`);
      for (const rel of relationships) {
        const constraintName = `fk_${rel.sourceTable}_${rel.sourceDbField}`;
        // 检查约束是否存在
        try {
          const checkRes = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [constraintName]);
          if (checkRes.rowCount === 0) {
            const sql = `ALTER TABLE "${rel.sourceTable}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${rel.sourceDbField}") REFERENCES "${rel.targetTable}" ("${rel.targetDbField}");`;
            await client.query(sql);
            console.log(`  + Added FK: ${constraintName}`);
          }
        } catch (fkError: any) {
          // 这里是关键：Catch 住错误，打印警告，但程序继续执行
          console.warn(`  [FK Warning] Failed to add foreign key ${constraintName}: ${fkError.message}`);
        }
      }
    }

    console.log(`✅ [DB Export] All done. Tables: ${totalTablesProcessed}, Rows: ${totalRowsInserted}`);
    return NextResponse.json({
      success: true,
      stats: {
        tables: totalTablesProcessed,
        rows: totalRowsInserted + totalRowsUpdated,
        relationships: relationships?.length || 0,
        strategy: strategy
      }
    });
  } catch (error: any) {
    // 只有数据阶段的错误会触发回滚
    // 外键阶段因为已经 COMMIT 了，不会触发这里的 ROLLBACK，符合预期
    if (client) { try { await client.query('ROLLBACK'); } catch (e) {} }
    console.error('Database export error:', error);
    return NextResponse.json({ success: false, errorType: 'DB_ERROR', error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}