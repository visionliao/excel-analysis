// app/api/save-table-schema/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(request: NextRequest) {
  try {
    const { timestamp, schemaData } = await request.json()

    if (!timestamp || !schemaData) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const schemaDir = join(process.cwd(), 'output', 'schema', timestamp)
    await mkdir(schemaDir, { recursive: true })

    const filePath = join(schemaDir, 'table_schema.json')

    // schemaData 包含了 nodes (位置、映射信息) 和 edges (外键关联)
    await writeFile(filePath, JSON.stringify(schemaData, null, 2))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save table schema error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
  }
}