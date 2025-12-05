// app/api/history/load-summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(request: NextRequest) {
  try {
    const { timestamp } = await request.json()
    if (!timestamp) return NextResponse.json({ error: 'Timestamp required' }, { status: 400 })

    const schemaDir = join(process.cwd(), 'output', 'schema', timestamp)
    const summaryPath = join(schemaDir, 'schema_summary.json')

    // 检查是否存在
    if (!existsSync(summaryPath)) {
      return NextResponse.json({ error: 'Schema summary not found' }, { status: 404 })
    }

    // 读取 schema_summary.json
    const content = await readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(content);

    // 尝试读取已存在的 table_schema.json (如果有，说明用户之前保存过沙盘，需要恢复位置和连线)
    let existingLayout = null;
    const layoutPath = join(schemaDir, 'table_schema.json');
    if (existsSync(layoutPath)) {
      const layoutContent = await readFile(layoutPath, 'utf-8');
      existingLayout = JSON.parse(layoutContent);
    }

    return NextResponse.json({
      success: true,
      summary: summary,
      existingLayout: existingLayout
    })
  } catch (error) {
    console.error('Load summary error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}