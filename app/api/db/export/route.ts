import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

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
      return this.recoverDate(strVal);
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
  private static recoverDate(rawStr: string): any {
    let cleanStr = rawStr;
    if (cleanStr.includes(' ')) {
        const parts = cleanStr.split(' ');
        // 尝试取第一部分，如果看起来像日期
        if (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.')) {
            cleanStr = parts[0];
        }
    }

    let d = new Date(cleanStr);
    if (!isNaN(d.getTime())) return d;

    // 手动解析非标准格式 YY/MM/DD
    if (cleanStr.includes('/') || cleanStr.includes('.')) {
        const parts = cleanStr.split(/[\/\.]/);
        if (parts.length === 3) {
            let y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const day = parseInt(parts[2]);
            if (y < 100) y += (y > 50 ? 1900 : 2000);
            const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            d = new Date(isoStr);
            if (!isNaN(d.getTime())) {
                console.log(`[DataSanitizer] Fixed date: "${rawStr}" -> "${isoStr}"`);
                return d;
            }
        }
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
    await client.query('BEGIN');

    // 统计数据
    let totalTablesProcessed = 0;
    let totalRowsInserted = 0;

    for (const table of tables) {
        const tableName = table.tableName;
        const columns = table.columns;
        const rows = table.rows;

        // 重建表结构
        await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        const colDefs = columns.map((c: any) => `"${c.name}" ${c.type}`).join(',\n');
        await client.query(`CREATE TABLE "${tableName}" (id SERIAL PRIMARY KEY, ${colDefs})`);

        // 计数
        totalTablesProcessed++;

        // 插入数据
        if (rows.length > 0) {
            const keys = columns.map((c: any) => `"${c.name}"`).join(', ');
            const BATCH_SIZE = 500;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const values: any[] = [];
                const placeholders: string[] = [];
                let paramIndex = 1;

                // 逐行处理
                for (let rowIndex = 0; rowIndex < batch.length; rowIndex++) {
                    const row = batch[rowIndex];
                    const rowPlaceholders: string[] = [];

                    // 逐行处理
                    for (const col of columns) {
                        let val = row[col.originalName];

                        // 1. 初次校验
                        let errorMsg = validateValue(val, col.type);
                        if (errorMsg) {
                            const originalVal = val;
                            // 尝试修复
                            val = DataSanitizer.tryRecover(val, col.type);
                            // 再次校验
                            errorMsg = validateValue(val, col.type);

                            // 如果依然失败，说明这数据真没救了 -> 抛出异常
                            if (errorMsg) {
                                // 构造详细错误，包含整行数据
                                const errorDetail = {
                                    tableName: tableName,
                                    rowNumber: i + rowIndex + 1,
                                    columnName: col.originalName,
                                    targetType: col.type,
                                    invalidValue: String(originalVal),
                                    message: errorMsg,
                                    // 打印整行数据，方便排查
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

                        // 处理空值写入
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
            totalRowsInserted += rows.length;
        }
    }

    // 建立外键关联
    if (relationships && relationships.length > 0) {
        console.log(`[DB Export] Processing ${relationships.length} foreign keys...`);

        for (const rel of relationships) {
            // 确保源表和目标表都在本次导出的列表中（防止引用了被禁用的表导致报错）
            const sourceExists = tables.find((t: any) => t.tableName === rel.sourceTable);
            const targetExists = tables.find((t: any) => t.tableName === rel.targetTable);

            if (sourceExists && targetExists) {
                const constraintName = `fk_${rel.sourceTable}_${rel.sourceDbField}`;

                // 构造 ALTER TABLE 语句
                // 注意：这里假设 targetDbField 也是唯一的或者是主键。
                // 如果 targetDbField 不是 id，Postgres 要求它必须有 UNIQUE 约束。
                // 在沙盘模式下，如果用户连接了非 ID 字段，可能会在这里报错，这是预期的（提示用户设计错误）。
                const sql = `
                    ALTER TABLE "${rel.sourceTable}"
                    ADD CONSTRAINT "${constraintName}"
                    FOREIGN KEY ("${rel.sourceDbField}")
                    REFERENCES "${rel.targetTable}" ("${rel.targetDbField}");
                `;

                try {
                    await client.query(sql);
                    console.log(`  Added FK: ${rel.sourceTable}.${rel.sourceDbField} -> ${rel.targetTable}.${rel.targetDbField}`);
                } catch (fkError: any) {
                    // 外键建立失败（例如数据不一致，或者目标字段不是唯一索引）
                    // 我们可以选择报错回滚，或者仅打印警告继续。
                    // 为了保证数据能进去，这里建议先只打印警告，不回滚数据。
                    console.warn(`  [FK Warning] Failed to add foreign key ${constraintName}: ${fkError.message}`);
                }
            }
        }
    }

    await client.query('COMMIT');
    console.log(`✅ [DB Export] Successfully committed ${tables.length} tables.`);
    return NextResponse.json({
        success: true,
        stats: {
            tables: totalTablesProcessed,
            rows: totalRowsInserted,
            relationships: relationships?.length || 0
        }
    });
  } catch (error: any) {
    if (client) { try { await client.query('ROLLBACK'); } catch (e) {} }
    console.error('Database export error:', error);
    return NextResponse.json({ success: false, errorType: 'DB_ERROR', error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}