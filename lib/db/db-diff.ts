// lib/db/db-diff.ts
import { Client, types } from 'pg';
import Cursor from 'pg-cursor';
import { DataMasker } from './db-exporter';

// =============================================================================
// 配置 pg 驱动：读取日期/时间时，直接返回字符串，不要转 JS Date 对象
// 彻底杜绝时区自动转换导致的 "少一天/差8小时" 问题
// =============================================================================
// OID 1082 = DATE
types.setTypeParser(1082, (val) => val);
// OID 1114 = TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1114, (val) => val);
// OID 1184 = TIMESTAMP WITH TIME ZONE
types.setTypeParser(1184, (val) => val);

// ----------------------------------------------------------------------------
// 1. 数据标准化逻辑
// ----------------------------------------------------------------------------
function normalizeValue(val: any, type: string): string {
  if (val === null || val === undefined) return ''; // 统一空值为 ''

  const typeUp = type.toUpperCase();

  // A. 数值类型
  if (typeUp.includes('INT') || typeUp.includes('DECIMAL') || typeUp.includes('NUMERIC') || typeUp.includes('FLOAT')) {
    // 移除可能存在的千分位逗号
    let cleanVal = String(val).replace(/,/g, '');
    const num = Number(cleanVal);
    if (isNaN(num)) return String(val).trim();
    return String(num); // "100.00" -> "100"
  }

  // B. 日期/时间类型 (全部改成字符串存取)
  if (typeUp.includes('DATE') || typeUp.includes('TIME')) {
    // 1. 如果已经是 Date 对象 (防御性处理)
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');

      if (typeUp.includes('DATE') && !typeUp.includes('TIME')) {
        return `${y}-${m}-${d}`;
      }
      const h = String(val.getHours()).padStart(2, '0');
      const min = String(val.getMinutes()).padStart(2, '0');
      const s = String(val.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }

    let strVal = String(val).trim();
    let d = new Date(strVal);

    // 2. 处理截断 (24/10/31 05:)
    // 如果是字符串且包含空格，尝试只取第一部分
    if (strVal.includes(' ') && isNaN(d.getTime())) {
      const parts = strVal.split(' ');
      // 如果第一部分看起来像日期 (包含 / - .)，就取第一部分
      if (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.')) {
        d = new Date(parts[0]);
      }
    }

    // 3. 如果解析失败，尝试手动解析非标准格式 YY/MM/DD
    if (isNaN(d.getTime()) && (strVal.includes('/') || strVal.includes('.'))) {
        const parts = strVal.split(/[\/\.]/);
        if (parts.length === 3) {
            let y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const day = parseInt(parts[2]);
            // 修正 2位年份
            if (y < 100) y += (y > 50 ? 1900 : 2000);

            const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            d = new Date(isoStr);
        }
    }

    // 4. 格式化输出 (用于生成签名)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');

      // 如果是 DATE 类型，只取 YYYY-MM-DD
      if (typeUp.includes('DATE') && !typeUp.includes('TIME')) {
        return `${y}-${m}-${day}`;
      }

      // 如果是 TIMESTAMP，取完整时间
      // 注意：这里的 d 是通过修复后的逻辑生成的，比如 "24/10/31 05:" 已经被修复为 "2024-10-31 00:00:00"
      // 数据库里存的也是 "2024-10-31 00:00:00" (如果不带时区)
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}:${s}`;
    }

    return strVal;
  }

  // C. 布尔值
  if (typeUp.includes('BOOL')) {
    const s = String(val).toLowerCase();
    if (['true', 't', '1', 'yes', 'y'].includes(s)) return 'true';
    if (['false', 'f', '0', 'no', 'n'].includes(s)) return 'false';
  }

  // D. 字符串：去除首尾空格，且把空字符串 "" 视为 null/undefined 的等价物
  const s = String(val).trim();
  return s === '' ? '' : s;
}

/**
 * 生成行签名及调试信息
 * @param row 数据行（可能是数据库行或Excel行）
 * @param columns 列定义
 * @param isExcelData 是否为Excel数据（如果是，需要先脱敏再对比）
 * @param tableName 表名（用于脱敏判断）
 */
function generateSignatureParts(
  row: any,
  columns: any[],
  isExcelData: boolean = false,
  tableName: string = ''
): { signature: string, parts: string[] } {
  const SEPARATOR = ' | '; // 使用竖线分隔，视觉更清晰
  const parts = columns.map(col => {
    // 兼容 DB (key=name) 和 Excel (key=originalName)
    let rawVal = row[col.name];
    if (rawVal === undefined) rawVal = row[col.originalName];

    // 🔒 如果是Excel数据，先进行脱敏处理（与数据库中的脱敏数据保持一致）
    if (isExcelData && tableName) {
      rawVal = DataMasker.maskValue(rawVal, tableName, col.name);
    }

    return normalizeValue(rawVal, col.type);
  });
  return { signature: parts.join(SEPARATOR), parts };
}

// ----------------------------------------------------------------------------
// 2. 数据比对逻辑
// ----------------------------------------------------------------------------
export async function calculateIncrementalDiff(
  client: Client,
  tableName: string,
  targetColumns: any[],
  incomingRows: any[]
) {
  // 1. 检查表是否存在
  const checkTableRes = await client.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`,
    [tableName]
  );
  if (!checkTableRes.rows[0].exists) {
    return { toInsert: incomingRows, toUpdate: [], isSchemaChanged: false, isNewTable: true, dbCount: 0 };
  }

  // 2. 检查表结构
  const checkColsRes = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1;`,
    [tableName]
  );
  const dbColumnNames = checkColsRes.rows.map((r: any) => r.column_name);
  const hasSchemaChange = targetColumns.some(col => !dbColumnNames.includes(col.name));

  if (hasSchemaChange) {
    const countRes = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
    return {
      toInsert: incomingRows,
      toUpdate: [],
      isSchemaChanged: true,
      isNewTable: false,
      dbCount: parseInt(countRes.rows[0].count, 10)
    };
  }

  // 3. 有序读取数据库 (按 ID ASC)
  const colNamesSql = targetColumns.map(c => `"${c.name}"`).join(', ');
  const queryStr = `SELECT id, ${colNamesSql} FROM "${tableName}" ORDER BY id ASC`;

  const cursor = client.query(new Cursor(queryStr));
  const toUpdate: any[] = []; // { id, data }
  let dbRowIndex = 0;
  const BATCH_SIZE = 10000;

  // --- Debug 容器 ---
  const dbDebugSamples: any[] = [];
  const incomingDebugSamples: any[] = [];

  await new Promise<void>((resolve, reject) => {
    const readNext = () => {
      cursor.read(BATCH_SIZE, (err, rows) => {
        if (err) return reject(err);
        if (rows.length === 0) return resolve();

        for (const row of rows) {
          const excelRow = incomingRows[dbRowIndex];

          // 采样调试第一行
          if (dbRowIndex === 0) {
            const { parts: p1, signature: s1 } = generateSignatureParts(row, targetColumns, false, tableName);
            dbDebugSamples.push({ raw: row, normalized: p1, sig: s1 });
            if (excelRow) {
              const { parts: p2, signature: s2 } = generateSignatureParts(excelRow, targetColumns, true, tableName);
              incomingDebugSamples.push({ raw: excelRow, normalized: p2, sig: s2 });
            }
          }

          if (!excelRow) {
            // Excel 行数比 DB 少，忽略多余的 DB 行
            dbRowIndex++;
            continue;
          }

          // 对比指纹（Excel数据先脱敏再生成签名）
          const { signature: dbSig } = generateSignatureParts(row, targetColumns, false, tableName);
          const { signature: excelSig } = generateSignatureParts(excelRow, targetColumns, true, tableName);

          if (dbSig !== excelSig) {
            // 不一致 -> 记录 Update，使用 DB 的 ID
            toUpdate.push({
              id: row.id,
              data: excelRow
            });
          }
          dbRowIndex++;
        }
        readNext();
      });
    };
    readNext();
  });

  // 4. 处理新增 (Insert)
  const toInsert: any[] = [];
  if (dbRowIndex < incomingRows.length) {
    for (let i = dbRowIndex; i < incomingRows.length; i++) {
      toInsert.push(incomingRows[i]);
    }
  }

  // =========================================================================
  // 如果发现大量新增（意味着匹配失败），打印对比详情
  // 只有当数据库有数据，但我们判定 Excel 数据全部是新增时，这通常意味着对比逻辑崩了
  // =========================================================================
  if (dbRowIndex > 0 && (toInsert.length + toUpdate.length) > (incomingRows.length * 0.8)) {
    console.log(`\n============== DIFF DEBUG: ${tableName} ==============`);
    console.log(`DB Rows: ${dbRowIndex}, Excel Rows: ${incomingRows.length}`);
    console.log(`Plan: Update ${toUpdate.length}, Insert ${toInsert.length}`);

    console.log(`--- [DB Sample Row 1] ---`);
    if (dbDebugSamples[0]) {
      // console.log('Raw:', JSON.stringify(dbDebugSamples[0].raw));
      console.log('Normalized Parts:', JSON.stringify(dbDebugSamples[0].normalized));
      console.log('Signature:', dbDebugSamples[0].sig);
    }

    console.log(`--- [Incoming Sample Row 1] ---`);
    if (incomingDebugSamples[0]) {
      // console.log('Raw:', JSON.stringify(incomingDebugSamples[0].raw));
      console.log('Normalized Parts:', JSON.stringify(incomingDebugSamples[0].normalized));
      console.log('Signature:', incomingDebugSamples[0].sig);
    }

    console.log(`========================================================\n`);
  }

  return {
    toInsert,
    toUpdate,
    isSchemaChanged: false,
    isNewTable: false,
    dbCount: dbRowIndex
  };
}