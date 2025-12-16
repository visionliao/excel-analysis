// lib/db/schema-loader.ts
import { join, basename } from 'path'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { parseExcelBuffer, buildResidentRoomMap } from '@/lib/file-parser'
import { getBaseTableName, TABLE_MAPPING } from '@/lib/constants'

export const PG_TYPES = [
  "VARCHAR(255)", "TEXT", "INTEGER", "DECIMAL(18,2)", "BOOLEAN", 
  "DATE", "TIMESTAMP", "BIGINT", "JSONB", "SERIAL"
];

export interface TableExportContext {
  tableName: string
  originalName?: string
  tableRemarks?: string
  columns: {
    name: string      // dbField
    type: string      // SQL type
    originalName: string // Excel header
    comment?: string
  }[]
  rows: any[]
  totalRows: number
}

export interface SchemaRelationship {
  sourceTable: string
  sourceDbField: string
  targetTable: string
  targetDbField: string
}

export async function loadSchemaAndData(timestamp: string): Promise<{
  tables: TableExportContext[],
  relationships: SchemaRelationship[]
}> {
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
  const relationships: SchemaRelationship[] = schemaJson.relationships || [];

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
  }).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  console.log(`\n=== [SchemaLoader] Sorted Valid Files in ${timestamp} ===`);
  validFiles.forEach((f, i) => {
      // 打印完整路径或相对路径，方便确认顺序
      console.log(`${i + 1}. ${basename(f)}`);
  });
  console.log('=========================================================\n');

  // 预处理：优先读取并解析 resident_id_document_list
  let residentRoomMap = new Map<string, string>();
  const residentFilePath = validFiles.find(f => getBaseTableName(basename(f)) === '指定日期在住客人证件号报表');
  if (residentFilePath) {
    try {
      const buf = await readFile(residentFilePath);
      const { rows } = await parseExcelBuffer(buf, basename(residentFilePath));
      residentRoomMap = buildResidentRoomMap(rows);
      console.log(`[SchemaLoader] Pre-loaded Resident Map: ${residentRoomMap.size} entries.`);
    } catch (e) {
      console.warn('[SchemaLoader] Failed to pre-load resident map:', e);
    }
  }

  for (const filePath of validFiles) {
    const buffer = await readFile(filePath);
    const fileName = basename(filePath);

    // 复用 parseExcelBuffer 解析函数
    const { rows } = await parseExcelBuffer(buffer, fileName, { residentRoomMap });

    const baseName = getBaseTableName(fileName);
    const tableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;

    if (!groupedRawData[tableName]) {
      groupedRawData[tableName] = [];
    }
    groupedRawData[tableName].push(...rows);
  }

  // 3. 组装结果 (Mapping Only, No Filtering)
  const tables: TableExportContext[] = [];

  for (const node of nodes) {
    const tableDef = node.data;
    const tableName = tableDef.tableName;
    const rawRows = groupedRawData[tableName] || [];

    const activeColumns = (tableDef.columns || [])
      .filter((col: any) => col.enabled !== false)
      .map((col: any) => ({
        name: col.dbField,
        type: PG_TYPES[col.dataType] || 'VARCHAR(255)',
        originalName: col.original,
        comment: col.comment || col.original
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

    tables.push({
      tableName: tableName,
      originalName: tableDef.originalName || tableDef.originalBaseName || '',
      tableRemarks: tableDef.tableRemarks || '',
      columns: activeColumns,
      rows: mappedRows,
      totalRows: mappedRows.length
    });
  }

  return { tables, relationships };
}