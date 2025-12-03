import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(request: NextRequest) {
  try {
    const { timestamp, tables } = await request.json()
    
    if (!timestamp || !tables) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    // 目标目录: output/schema/{timestamp}/
    const schemaDir = join(process.cwd(), 'output', 'schema', timestamp)
    await mkdir(schemaDir, { recursive: true })

    // 1. 保存完整的 JSON (包含数据)
    // const fullDataPath = join(schemaDir, 'full_data.json')
    // await writeFile(fullDataPath, JSON.stringify(tables, null, 2))

    // 2. 仅保存 Schema 定义 (SQL 风格或简要风格)
    const schemaSummary = tables.map((t: any) => ({
      tableName: t.tableName,
      originalBaseName: t.originalBaseName,
      headers: t.headers,
      totalRows: t.totalRows,
      sourceFiles: t.sourceFiles,
    }));
    const schemaPath = join(schemaDir, 'schema_summary.json')
    await writeFile(schemaPath, JSON.stringify(schemaSummary, null, 2))

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Save schema error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
  }
}