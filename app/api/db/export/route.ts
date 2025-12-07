import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { loadSchemaAndData } from '@/lib/schema-loader'

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
    // 1. 尝试直接转换
    let d = new Date(rawStr);
    if (!isNaN(d.getTime())) return d;

    // 2. 被截断的时间 (例如 "24/10/31 05:")
    // 动作：按空格切割，只取第一部分日期
    if (rawStr.includes(' ')) {
      const parts = rawStr.split(' ');
      // 假设第一部分是日期
      const datePart = parts[0];
      d = new Date(datePart);
      if (!isNaN(d.getTime())) {
        console.warn(`[DataSanitizer] Fixed broken date: "${rawStr}" -> "${datePart}"`);
        return d;
      }
    }

    // 3. Excel 格式可能出现的其他异常 (可在此扩展)
    // 比如 2024.01.01 转 2024-01-01
    if (rawStr.includes('.')) {
        const fixed = rawStr.replace(/\./g, '-');
        d = new Date(fixed);
        if (!isNaN(d.getTime())) return d;
    }

    return rawStr; // 实在修不好，原样返回
  }

  /**
   * 数值修复策略
   */
  private static recoverNumber(rawStr: string): string {
    // 移除千分位逗号 (例如 "1,234" -> "1234")
    if (rawStr.includes(',')) {
      return rawStr.replace(/,/g, '');
    }
    // 可以在这里扩展：移除 '$', '¥' 等符号
    return rawStr;
  }

  /**
   * 布尔值修复策略
   */
  private static recoverBoolean(rawStr: string): string {
    const lower = rawStr.toLowerCase();
    if (['yes', 'y', 'on', 'ok'].includes(lower)) return 'true';
    if (['no', 'n', 'off'].includes(lower)) return 'false';
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

// 3. 主 API 逻辑
export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, timestamp } = await req.json();
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;

    if (!targetConnectionString || !timestamp) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const tables = await loadSchemaAndData(timestamp);

    client = new Client({ connectionString: targetConnectionString, statement_timeout: 60000 });
    await client.connect();
    await client.query('BEGIN');

    for (const table of tables) {
        const tableName = table.tableName;
        const columns = table.columns;
        const rows = table.rows;

        // 重建表结构
        await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        const colDefs = columns.map(c => `"${c.name}" ${c.type}`).join(',\n');
        await client.query(`CREATE TABLE "${tableName}" (id SERIAL PRIMARY KEY, ${colDefs})`);

        // 插入数据
        if (rows.length > 0) {
            const keys = columns.map(c => `"${c.name}"`).join(', ');
            const BATCH_SIZE = 500;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const values: any[] = [];
                const placeholders: string[] = [];
                let paramIndex = 1;

                // --- 逐行处理 ---
                for (let rowIndex = 0; rowIndex < batch.length; rowIndex++) {
                    const row = batch[rowIndex];
                    const rowPlaceholders: string[] = [];

                    // --- 逐列处理 ---
                    for (const col of columns) {
                        let val = row[col.originalName]; 

                        // 1. 初次校验
                        let errorMsg = validateValue(val, col.type);

                        // 2. 如果校验失败，尝试【智能修复】
                        if (errorMsg) {
                            const originalVal = val;
                            // 调用清洗器尝试修复
                            val = DataSanitizer.tryRecover(val, col.type);

                            // 再次校验修复后的值
                            errorMsg = validateValue(val, col.type);

                            // 如果依然失败，说明这数据真没救了 -> 抛出异常
                            if (errorMsg) {
                                const errorDetail = {
                                    tableName: tableName || 'Unknown Table',
                                    rowNumber: i + rowIndex + 2,
                                    columnName: col.originalName || 'Unknown Column',
                                    targetType: col.type || 'Unknown Type',
                                    invalidValue: String(originalVal), // 记录原始错误值
                                    message: errorMsg
                                };

                                console.error('------- EXPORT VALIDATION ERROR -------');
                                console.error(JSON.stringify(errorDetail, null, 2));

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
        }
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (client) {
        try { await client.query('ROLLBACK'); } catch (e) {}
    }
    console.error('Database export error:', error);

    return NextResponse.json({ 
        success: false, 
        errorType: 'DB_ERROR',
        error: error.message || 'Unknown database error' 
    }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}