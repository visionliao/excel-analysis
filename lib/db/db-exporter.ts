// lib/db/db-exporter.ts
import { Client, types } from 'pg'
import { loadSchemaAndData } from '@/lib/db/schema-loader'
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

// 2. 敏感数据脱敏中心
export class DataMasker {
  /**
   * 需要脱敏的表和字段配置
   * key: 表名, value: 字段配置对象
   */
  private static readonly MASKING_CONFIG: Record<string, Record<string, 'name' | 'phone' | 'id_card' | 'email'>> = {
    'contract_creation_log': {
      'resident_name': 'name',  // 合同创建报表 - 客人姓名
    },
    'resident_id_document_list': {
      'resident_name': 'name',
      'id_number': 'id_card',
      'mobile': 'phone',
    },
    'tenant_analysis_report': {
      'resident_name': 'name',
    },
    'arrival_departure_weekly': {
      'resident_name': 'name',
      'mobile': 'phone',
      'id_number': 'id_card',
    },
    'viewing_appointment_list': {
      'resident_name': 'name',
      'mobile': 'phone',
    },
  };

  /**
   * 判断某个表的某个字段是否需要脱敏，并返回脱敏类型
   */
  private static shouldMask(tableName: string, columnName: string): string | null {
    const tableConfig = this.MASKING_CONFIG[tableName];
    if (!tableConfig) return null;
    return tableConfig[columnName] || null;
  }

  /**
   * 检测字符串是否包含中文字符
   */
  private static containsChinese(str: string): boolean {
    return /[\u4e00-\u9fa5]/.test(str);
  }

  /**
   * 中文姓名脱敏
   * 规则：
   * - 2个字：张三 → 张*
   * - 3个字：张三丰 → 张*丰
   * - 4个字及以上：欧阳峰 → 欧**峰
   */
  private static maskChineseName(name: string): string {
    const trimmed = name.trim();
    const len = trimmed.length;

    if (len <= 1) return trimmed;
    if (len === 2) return trimmed[0] + '*';
    if (len === 3) return trimmed[0] + '*' + trimmed[2];
    // 4个字及以上：首尾保留，中间全用*
    return trimmed[0] + '*'.repeat(len - 2) + trimmed[len - 1];
  }

  /**
   * 英文姓名脱敏
   * 规则：
   * - 单个单词（如 "John"）：首字母保留，其余用*
   * - 两个单词（如 "John Smith"）：首字母保留，其余用*
   * - 多个单词：每个单词的首字母保留，其余用*
   */
  private static maskEnglishName(name: string): string {
    const trimmed = name.trim();
    const words = trimmed.split(/\s+/);

    const maskedWords = words.map(word => {
      if (word.length <= 1) return word;
      // 保留首字母，其余用*替代
      return word[0] + '*'.repeat(word.length - 1);
    });

    return maskedWords.join(' ');
  }

  /**
   * 姓名脱敏（自动识别中文/英文）
   */
  private static maskName(name: string): string {
    if (!name || typeof name !== 'string') return name;

    const trimmed = name.trim();

    // 如果已经包含 **，说明已经脱敏过了，直接返回
    if (trimmed.includes('**')) {
      return trimmed;
    }

    // 如果包含单个 *，可能是部分脱敏，也直接返回
    if (trimmed.includes('*')) {
      return trimmed;
    }

    // 根据是否包含中文字符选择脱敏策略
    if (this.containsChinese(trimmed)) {
      return this.maskChineseName(trimmed);
    } else {
      return this.maskEnglishName(trimmed);
    }
  }

  /**
   * 手机号脱敏
   * 规则：保留前3位和后4位，中间用*替代
   * 例如：13812345678 → 138****5678
   */
  private static maskPhone(phone: string): string {
    const trimmed = phone.trim().replace(/\s+/g, ''); // 移除空格

    // 中国大陆手机号（11位）
    if (trimmed.length === 11 && /^\d{11}$/.test(trimmed)) {
      return trimmed.substring(0, 3) + '****' + trimmed.substring(7);
    }

    // 其他格式的手机号，保留首尾各2位
    if (trimmed.length > 4) {
      const maskLen = trimmed.length - 4;
      return trimmed.substring(0, 2) + '*'.repeat(maskLen) + trimmed.substring(trimmed.length - 2);
    }

    // 长度不够，不脱敏
    return trimmed;
  }

  /**
   * 身份证号脱敏
   * 规则：保留前6位和后4位，中间用*替代
   * 例如：310101199001011234 → 310101********1234
   */
  private static maskIdCard(idCard: string): string {
    const trimmed = idCard.trim().replace(/\s+/g, ''); // 移除空格

    // 18位身份证
    if (trimmed.length === 18 && /^\d{17}[\dXx]$/.test(trimmed)) {
      return trimmed.substring(0, 6) + '********' + trimmed.substring(14);
    }

    // 15位身份证（旧版）
    if (trimmed.length === 15 && /^\d{15}$/.test(trimmed)) {
      return trimmed.substring(0, 6) + '*****' + trimmed.substring(11);
    }

    // 其他格式，保留首尾各4位
    if (trimmed.length > 8) {
      const maskLen = trimmed.length - 8;
      return trimmed.substring(0, 4) + '*'.repeat(maskLen) + trimmed.substring(trimmed.length - 4);
    }

    // 长度不够，不脱敏
    return trimmed;
  }

  /**
   * 邮箱脱敏
   * 规则：@前的用户名只保留前2位，@及域名完整保留
   * 例如：zhangsan@example.com → zh******@example.com
   */
  private static maskEmail(email: string): string {
    const trimmed = email.trim();

    // 简单的邮箱格式检查
    const emailRegex = /^([^@]+)@(.+)$/;
    const match = trimmed.match(emailRegex);

    if (!match) {
      // 不符合邮箱格式，返回原值
      return trimmed;
    }

    const [, username, domain] = match;

    if (username.length <= 1) {
        return '*' + '@' + domain;
    }
    // 用户名只保留前2位
    if (username.length <= 2) {
      return username[0] + '*' + '@' + domain;
    }

    return username.substring(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
  }

  /**
   * 对单个值进行脱敏处理
   * @param value 原始值
   * @param tableName 表名
   * @param columnName 字段名
   * @returns 脱敏后的值
   */
  static maskValue(value: any, tableName: string, columnName: string): any {
    // 如果值为空，直接返回
    if (value === null || value === undefined || value === '') {
      return value;
    }

    const maskType = this.shouldMask(tableName, columnName);

    // 如果该字段不需要脱敏，直接返回原值
    if (!maskType) {
      return value;
    }

    const strValue = String(value);
    let maskedValue: string;

    // 根据脱敏类型选择脱敏方法
    switch (maskType) {
      case 'name':
        maskedValue = this.maskName(strValue);
        break;
      case 'phone':
        maskedValue = this.maskPhone(strValue);
        break;
      case 'id_card':
        maskedValue = this.maskIdCard(strValue);
        break;
      case 'email':
        maskedValue = this.maskEmail(strValue);
        break;
      default:
        maskedValue = strValue;
    }

    // 如果值被修改了，记录日志
    if (maskedValue !== strValue) {
      console.log(`[DataMasker] 脱敏: ${tableName}.${columnName} "${strValue}" → "${maskedValue}"`);
    }

    return maskedValue;
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

// 导出详细结果接口
export interface TableSyncDetail {
    tableName: string
    insertCount: number
    updateCount: number
    insertIds: number[]
    updateIds: number[]
}

export interface ExportResult {
  success: boolean
  stats?: {
    tables: number
    rows: number
    relationships: number
    strategy: string
  }
  detailsReport?: TableSyncDetail[]
  error?: string
  errorType?: string
  details?: any
}

export async function executeDatabaseSync(
  connectionString: string, 
  timestamp: string, 
  strategy: string = 'incremental'
): Promise<ExportResult> {
  const targetConnectionString = connectionString || process.env.POSTGRES_URL;
  if (!targetConnectionString) {
    return { success: false, error: 'Database connection string is missing' };
  }

  // 1. 加载数据
  // 这里 loadSchemaAndData 会自动去 output/source/{timestamp} 找文件
  // 所以自动化 API 需要先负责把文件拷贝到那里
  let fullData;
  try {
    fullData = await loadSchemaAndData(timestamp);
  } catch (e: any) {
    return { success: false, error: `Schema/Data load failed: ${e.message}` };
  }

  const { tables, relationships } = fullData;
  const client = new Client({ connectionString: targetConnectionString, statement_timeout: 60000 });

  // 公共表的唯一约束白名单
  // 定义哪些表的哪些字段需要建立唯一索引 (用于支持外键指向)
  const SPECIAL_UNIQUE_KEYS: Record<string, string[]> = {
      'dim_room_type': ['room_code'],
      'dim_status_map': ['status', 'status_desc'],
      'dim_work_order_items': ['item_code', 'item_desc'],
      'dim_work_locations': ['location_code', 'location_desc'],
      'room_details': ['room_number'] // 加上这一行
  };

  try {
    await client.connect();
    await client.query('BEGIN');

    let totalTablesProcessed = 0;
    let totalRowsInserted = 0;
    let totalRowsUpdated = 0;

    // 收集每张表的详细变更
    const reportList: TableSyncDetail[] = [];

    for (const table of tables) {
      const { tableName, columns, rows } = table;
      let rowsToInsert = rows;
      let rowsToUpdate: any[] = [];

      // 本表的统计容器
      const currentTableStats: TableSyncDetail = {
        tableName,
        insertCount: 0,
        updateCount: 0,
        insertIds: [],
        updateIds: []
      };

      let needCreateTable = false;
      const diff = await calculateIncrementalDiff(client, tableName, columns, rows);

      if (diff.isNewTable) {
        needCreateTable = true;
      } else if (diff.isSchemaChanged) {
        console.log(`[Export] Schema changed for ${tableName}, rebuilding...`);
        await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        needCreateTable = true;
      } else {
        if (strategy === 'overwrite') {
          await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
          needCreateTable = true;
        } else {
          rowsToInsert = diff.toInsert;
          rowsToUpdate = diff.toUpdate || [];
          // 即使没有数据变化，也要确保唯一索引存在！
          if (SPECIAL_UNIQUE_KEYS[tableName]) {
            const targetCols = SPECIAL_UNIQUE_KEYS[tableName];
            for (const colName of targetCols) {
              const colExists = columns.find((c: any) => c.name === colName);
              if (colExists) {
                try {
                  const idxName = `idx_unique_${tableName}_${colName}`;
                  // 1. 先检查索引是否存在
                  const checkIdx = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [idxName]);
                  // 2. 不存在才创建
                  if (checkIdx.rowCount === 0) {
                    await client.query(`CREATE UNIQUE INDEX "${idxName}" ON "${tableName}" ("${colName}")`);
                    console.log(`  + [Config] Ensured UNIQUE index for ${tableName}.${colName}`);
                  }
                } catch (e: any) {
                  // 忽略 "relation already exists" 错误
                }
              }
            }
          }
          if (rowsToInsert.length === 0 && rowsToUpdate.length === 0) {
            // 不要返回，让流程继续，可以动态修改表备注、字段备注
            // console.log(`[Export] ${tableName}: No changes.`);
            // reportList.push(currentTableStats);
            // continue;
          }
          console.log(`[Export] ${tableName}: Insert ${rowsToInsert.length}, Update ${rowsToUpdate.length}`);
        }
      }

      // 2. 建表
      if (needCreateTable) {
        const colDefs = columns.map((c: any) => `"${c.name}" ${c.type}`).join(',\n');
        await client.query(`CREATE TABLE "${tableName}" (id SERIAL PRIMARY KEY, ${colDefs})`);

        // 公共表增加唯一约束
        if (SPECIAL_UNIQUE_KEYS[tableName]) {
          const targetCols = SPECIAL_UNIQUE_KEYS[tableName];
          for (const colName of targetCols) {
            // 确保该表真的有这个字段
            const colExists = columns.find((c: any) => c.name === colName);

            if (colExists) {
              try {
                const idxName = `idx_unique_${tableName}_${colName}`;
                const checkIdx = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [idxName]);
                if (checkIdx.rowCount === 0) {
                  await client.query(`CREATE UNIQUE INDEX "${idxName}" ON "${tableName}" ("${colName}")`);
                  console.log(`  + [Config] Created UNIQUE index for ${tableName}.${colName}`);
                }
              } catch (e: any) {
                console.warn(`  - Failed to create unique index for ${tableName}.${colName}: ${e.message}`);
              }
            }
          }
        }
        rowsToInsert = rows; 
      }

      // 表备注写入(每次导出数据都重写，确保备的注实时性)
      const finalTableComment = table.tableRemarks || table.originalName;
      console.log(`=================原始备注: ${finalTableComment}`);
      if (finalTableComment) {
        const safeComment = finalTableComment.replace(/'/g, "''");
        console.log(`Table name: ${tableName}, 备注: ${safeComment}`);
        await client.query(`COMMENT ON TABLE "${tableName}" IS '${safeComment}'`);
      }

      // 列字段备注写入(每次导出数据都重写，确保备的注实时性)
      for (const col of columns) {
        if (col.comment) {
          const safeComment = col.comment.replace(/'/g, "''");
          console.log(`Table name: ${tableName}, 字段名：${col.name}, 备注: ${safeComment}`);
          await client.query(`COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${safeComment}'`);
        }
      }

      // 3. 插入
      if (rowsToInsert.length > 0) {
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
              if (val instanceof Date) val = forceDateToString(val, col.type);

              // 1️⃣ 数据验证（基于原始数据）
              let errorMsg = validateValue(val, col.type);
              if (errorMsg) {
                const originalVal = val;
                // 2️⃣ 数据清洗（如果验证失败）
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
                  await client.query('ROLLBACK');
                  // 抛出异常，或返回错误对象
                  return { success: false, errorType: 'VALIDATION_ERROR', details: errorDetail, error: `Data validation failed for ${tableName}` };
                }
              }
              if (val === undefined || val === '') val = null;

              // 3️⃣ 数据脱敏（在验证和清洗之后、写入数据库之前）
              val = DataMasker.maskValue(val, tableName, col.name);

              values.push(val);
              rowPlaceholders.push(`$${paramIndex++}`);
            }
            placeholders.push(`(${rowPlaceholders.join(',')})`);
          }
          const insertSql = `INSERT INTO "${tableName}" (${keys}) VALUES ${placeholders.join(',')} RETURNING id`;
          const res = await client.query(insertSql, values);
          // 收集 ID
          res.rows.forEach(r => currentTableStats.insertIds.push(r.id));
        }
        currentTableStats.insertCount = currentTableStats.insertIds.length;
        totalRowsInserted += rowsToInsert.length;
      }

      // 4. 更新
      if (rowsToUpdate.length > 0) {
        if (rowsToInsert.length === 0) totalTablesProcessed++;
        for (const item of rowsToUpdate) {
          const targetId = item.id;
          const rowData = item.data;

          const setParts: string[] = [];
          const values: any[] = [];
          let paramIdx = 1;

          for (const col of columns) {
            let val = rowData[col.originalName];
            if (val instanceof Date) val = forceDateToString(val, col.type);

            // 1️⃣ 数据验证（基于原始数据）
            let err = validateValue(val, col.type);
            // 2️⃣ 数据清洗（如果验证失败）
            if (err) val = DataSanitizer.tryRecover(val, col.type);
            if (val === undefined || val === '') val = null;

            // 3️⃣ 数据脱敏（在验证和清洗之后、写入数据库之前）
            val = DataMasker.maskValue(val, tableName, col.name);

            setParts.push(`"${col.name}" = $${paramIdx++}`);
            values.push(val);
          }

          values.push(targetId);
          const updateSql = `UPDATE "${tableName}" SET ${setParts.join(', ')} WHERE id = $${paramIdx}`;
          await client.query(updateSql, values);
          // 收集 ID
          currentTableStats.updateIds.push(targetId);
        }
        currentTableStats.updateCount = currentTableStats.updateIds.length;
        totalRowsUpdated += rowsToUpdate.length;
      }
      // 将本表统计推入总报告
      reportList.push(currentTableStats);
    }

    await client.query('COMMIT');
    console.log(`✅ [DB Export] Committed. Tables: ${totalTablesProcessed}, Rows: ${totalRowsInserted + totalRowsUpdated}`);

    // 外键 (独立操作)
    if (relationships && relationships.length > 0) {
      for (const rel of relationships) {
        const constraintName = `fk_${rel.sourceTable}_${rel.sourceDbField}`;
        try {
          const checkRes = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [constraintName]);
          if (checkRes.rowCount === 0) {
            const sql = `ALTER TABLE "${rel.sourceTable}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${rel.sourceDbField}") REFERENCES "${rel.targetTable}" ("${rel.targetDbField}");`;
            await client.query(sql);
          }
        } catch (fkError: any) {
          console.warn(`  [FK Warning] ${fkError.message}`);
        }
      }
    }

    return {
      success: true,
      stats: {
        tables: totalTablesProcessed,
        rows: totalRowsInserted + totalRowsUpdated,
        relationships: relationships?.length || 0,
        strategy: strategy
      },
      detailsReport: reportList
    };
  } catch (error: any) {
    if (client) { try { await client.query('ROLLBACK'); } catch (e) {} }
    console.error('Database export error:', error);
    return { success: false, errorType: 'DB_ERROR', error: error.message };
  } finally {
    if (client) await client.end();
  }
}
