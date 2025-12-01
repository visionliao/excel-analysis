// lib/file-parser.ts
import { getBaseTableName, TABLE_MAPPING } from './constants'
import { ParserFactory } from './parsers/factory'

export interface ParsedTableData {
  tableName: string 
  originalBaseName: string 
  headers: string[]
  rows: any[]
  sourceFiles: string[] 
  totalRows: number
}

export async function parseExcelBuffer(buffer: Buffer, fileName: string): Promise<{ headers: string[], rows: any[] }> {
  // 1. 获取标准英文表名
  const baseName = getBaseTableName(fileName);
  const tableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;

  // 2. 从工厂获取对应的解析器
  const parser = ParserFactory.getParser(tableName);

  // 3. 执行解析
  console.log(`Using parser for ${tableName}: ${parser.constructor.name}`);
  return parser.parse(buffer, fileName);
}