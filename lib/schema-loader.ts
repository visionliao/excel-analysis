import { join, basename } from 'path'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { parseExcelBuffer } from '@/lib/file-parser'
import { getBaseTableName, TABLE_MAPPING } from '@/lib/constants'

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

export async function loadSchemaAndData(timestamp: string): Promise<TableExportContext[]> {
  const baseDir = process.cwd();

  const schemaPath = join(baseDir, 'output', 'schema', timestamp, 'table_schema.json');
  if (!existsSync(schemaPath)) {
    throw new Error(`找不到版本 ${timestamp} 的架构定义文件`);
  }

  const sourceDir = join(baseDir, 'output', 'source', timestamp);
  if (!existsSync(sourceDir)) {
    throw new Error(`找不到版本 ${timestamp} 的源文件目录`);
  }

  // 1. 读取 Schema
  const schemaContent = await readFile(schemaPath, 'utf-8');
  const schemaJson = JSON.parse(schemaContent);
  const nodes = schemaJson.nodes || [];

  // 2. 读取并解析源文件 (严格复用 parseExcelBuffer)
  const groupedRawData: Record<string, any[]> = {}; 

  const getFiles = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
      const res = join(dir, entry.name);
      return entry.isDirectory() ? getFiles(res) : res;
    }));
    return Array.prototype.concat(...files);
  };

  const allFiles = await getFiles(sourceDir);
  // 严格过滤，只读 Excel/CSV，且排除临时文件
  const validFiles = allFiles.filter(f => {
    const name = basename(f);
    return name.match(/\.(xlsx|xls|csv)$/i) && !name.startsWith('~$') && !name.startsWith('.');
  });

  for (const filePath of validFiles) {
    const buffer = await readFile(filePath);
    const fileName = basename(filePath);

    // 这里调用的 parseExcelBuffer 和第一步上传时是同一个函数
    const { rows } = await parseExcelBuffer(buffer, fileName);

    const baseName = getBaseTableName(fileName);
    const tableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;

    if (!groupedRawData[tableName]) {
      groupedRawData[tableName] = [];
    }
    groupedRawData[tableName].push(...rows);
  }

  // 3. 组装结果 (Mapping Only, No Filtering)
  const result: TableExportContext[] = [];

  for (const node of nodes) {
    const tableDef = node.data;
    const tableName = tableDef.tableName;
    const rawRows = groupedRawData[tableName] || [];

    const activeColumns = (tableDef.columns || [])
      .filter((col: any) => col.enabled !== false)
      .map((col: any) => ({
        name: col.dbField,
        type: PG_TYPES[col.dataType] || 'VARCHAR(255)',
        originalName: col.original
      }));

    if (activeColumns.length === 0) continue;

    // 映射数据 (不做任何行删除，信任 Parser 的结果)
    const mappedRows = rawRows.map(rawRow => {
      const newRow: any = {};
      activeColumns.forEach((col: any) => {
        let val = rawRow[col.originalName];
        if (val === '' || val === undefined) val = null;
        newRow[col.originalName] = val;
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