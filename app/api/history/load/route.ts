import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { parseExcelBuffer } from '@/lib/file-parser'
import { getBaseTableName, TABLE_MAPPING } from '@/lib/constants'
import { existsSync } from 'fs'

async function getFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const res = join(dir, entry.name);
    return entry.isDirectory() ? getFilesRecursively(res) : res;
  }));
  return Array.prototype.concat(...files);
}

export async function POST(request: NextRequest) {
  try {
    const { timestamp } = await request.json()
    if (!timestamp) return NextResponse.json({ error: 'Timestamp required' }, { status: 400 })

    const targetDir = join(process.cwd(), 'output', 'source', timestamp)
    
    try {
      await stat(targetDir)
    } catch {
      return NextResponse.json({ error: 'History not found' }, { status: 404 })
    }

    // 1. 读取 Excel 数据
    const allFilePaths = await getFilesRecursively(targetDir);
    const excelPaths = allFilePaths.filter(p => p.match(/\.(xlsx|xls|csv)$/i));
    const groupedTables: Record<string, any> = {};

    await Promise.all(excelPaths.map(async (filePath) => {
      const fileName = filePath.split(/[\\/]/).pop() || '';
      try {
        const buffer = await readFile(filePath);
        const { headers, rows } = await parseExcelBuffer(buffer, fileName);
        const baseName = getBaseTableName(fileName);
        const englishTableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;

        if (!groupedTables[englishTableName]) {
          groupedTables[englishTableName] = {
            tableName: englishTableName,
            originalBaseName: baseName,
            headers: [],
            rows: [],
            sourceFiles: [],
            totalRows: 0,
            parseErrors: []
          };
        }
        const currentTable = groupedTables[englishTableName];
        currentTable.sourceFiles.push(fileName);
        currentTable.rows.push(...rows);
        currentTable.totalRows += rows.length;
        if (currentTable.headers.length === 0 && headers.length > 0) {
          currentTable.headers = headers;
        }
      } catch (error: any) {
        console.error(`Error parsing ${fileName}:`, error);
      }
    }));

    // 2. 读取已保存的 Schema 配置 (用于恢复禁用/启用状态)
    let savedSchema = null;
    const schemaConfigPath = join(process.cwd(), 'output', 'schema', timestamp, 'schema_summary.json');

    if (existsSync(schemaConfigPath)) {
      try {
        const configContent = await readFile(schemaConfigPath, 'utf-8');
        savedSchema = JSON.parse(configContent);
      } catch (e) {
        console.warn('Failed to read existing schema config', e);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: timestamp,
      data: Object.values(groupedTables),
      savedSchema: savedSchema // 返回给前端
    })

  } catch (error) {
    console.error('History load error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}