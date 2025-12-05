// app/api/schema/list/route.ts
import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    // 专门读取 schema 目录
    const targetDir = join(process.cwd(), 'output', 'schema')

    // 检查目录是否存在
    try {
      await stat(targetDir)
    } catch {
      return NextResponse.json({ success: true, timestamps: [] })
    }

    const files = await readdir(targetDir)

    // 过滤并排序
    const timestamps = files
      .filter(f => !f.startsWith('.'))
      .sort()
      .reverse()

    return NextResponse.json({ success: true, timestamps })
  } catch (error) {
    console.error('List schema history error:', error)
    return NextResponse.json({ success: false, error: 'Failed to list schemas' }, { status: 500 })
  }
}