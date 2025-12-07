// lib/schema-loader.ts
import { join } from 'path'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { parseExcelBuffer } from '@/lib/file-parser'
import { getBaseTableName, TABLE_MAPPING } from '@/lib/constants'

// 复用前端定义的类型常量
export const PG_TYPES = [
  "VARCHAR(255)", "TEXT", "INTEGER", "DECIMAL(18,2)", "BOOLEAN", 
  "DATE", "TIMESTAMP", "BIGINT", "JSONB", "SERIAL"
];

export interface TableExportContext {
  tableName: string
  columns: {
    name: string      // dbField
    type: string      // SQL type
    originalName: string // Excel header
  }[]
  rows: any[]
  totalRows: number
}

/**
 * 根据时间戳，加载 Schema 定义，并读取源文件填充数据
 */
export async function loadSchemaAndData(timestamp: string): Promise<TableExportContext[]> {
  const baseDir = process.cwd();
  const schemaPath = join(baseDir, 'output', 'schema', timestamp, 'table_schema.json');
  const sourceDir = join(baseDir, 'output', 'source', timestamp);

  // 1. 检查 Schema 文件是否存在
  if (!existsSync(schemaPath)) {
    throw new Error(`找不到版本 ${timestamp} 的架构定义文件 (table_schema.json)`);
  }

  // 2. 读取 table_schema.json
  const schemaContent = await readFile(schemaPath, 'utf-8');
  const schemaJson = JSON.parse(schemaContent);
  const nodes = schemaJson.nodes || [];

  // 3. 读取源文件并解析数据
  // 注意：这里需要把 source 目录下所有文件读出来，聚合到一起
  // 这部分逻辑复用了 api/history/load 的思路，但只关心启用的表
  const groupedRawData: Record<string, any[]> = {}; 

  // 递归获取文件列表
  const getFiles = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
      const res = join(dir, entry.name);
      return entry.isDirectory() ? getFiles(res) : res;
    }));
    return Array.prototype.concat(...files);
  };

  if (existsSync(sourceDir)) {
    const allFiles = await getFiles(sourceDir);
    const excelFiles = allFiles.filter(f => f.match(/\.(xlsx|xls|csv)$/i));

    for (const filePath of excelFiles) {
      const buffer = await readFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || '';

      // 使用现有的解析器解析原始数据
      const { rows } = await parseExcelBuffer(buffer, fileName);

      // 确定归属的表名
      const baseName = getBaseTableName(fileName);
      const tableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;

      if (!groupedRawData[tableName]) {
        groupedRawData[tableName] = [];
      }
      groupedRawData[tableName].push(...rows);
    }
  }

  // 4. 组装最终结果 (Intersection: Schema Definition + Raw Data)
  const result: TableExportContext[] = [];

  for (const node of nodes) {
    const tableDef = node.data;
    const tableName = tableDef.tableName;

    // 如果该表在原始数据里找不到，或者没有行，跳过（或者是空表）
    const rawRows = groupedRawData[tableName] || [];

    // 过滤出启用的列，并构建列定义
    const activeColumns = (tableDef.columns || [])
      .filter((col: any) => col.enabled !== false) // 过滤禁用的列
      .map((col: any) => ({
        name: col.dbField, // 数据库字段名
        type: PG_TYPES[col.dataType] || 'VARCHAR(255)', // 转换 int 类型为 SQL 类型
        originalName: col.original // 原始 Excel 列名，用于取值
      }));

    // 如果没有启用列，跳过该表
    if (activeColumns.length === 0) continue;

    // 5. 数据映射 (Mapping)
    // 根据 table_schema 定义的映射关系，从 rawRows 中提取数据
    const mappedRows = rawRows.map(rawRow => {
      const newRow: any = {};
      activeColumns.forEach((col: any) => {
        // rawRow 的 key 是中文/原始表头，col.originalName 也是
        // 我们要将其值赋给 col.name (数据库字段名)
        let val = rawRow[col.originalName];

        // 简单的数据清洗 (空字符串转 null，防止整数类型报错)
        if (val === '' || val === undefined) {
          val = null;
        }
        newRow[col.originalName] = val; // 暂时保留 key 为 originalName，方便后面 insert 逻辑取值
        // 注意：这里其实有两种策略，一种是现在这就转成 dbField key，
        // 另一种是保持 originalName key，insert 时根据 originalName 取值。
        // 为了配合之前写的 export 逻辑，我们在 API 层处理取值。
      });
      return newRow;
    });

    result.push({
      tableName: tableName,
      columns: activeColumns,
      rows: mappedRows,
      totalRows: mappedRows.length
    });
  }

  return result;
}