import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    const sourceDir = join(process.cwd(), 'output', 'source')
    
    // 检查目录是否存在
    try {
      await stat(sourceDir)
    } catch {
      return NextResponse.json({ success: true, timestamps: [] })
    }

    const files = await readdir(sourceDir)
    
    // 过滤出文件夹，并按时间倒序排列 (最新的在前面)
    // 假设文件夹名就是时间戳 YYYY-MM-DD_HH-mm-ss，字符串排序即可
    const timestamps = files
      .filter(f => !f.startsWith('.')) // 排除隐藏文件
      .sort()
      .reverse()

    return NextResponse.json({ success: true, timestamps })
  } catch (error) {
    console.error('List history error:', error)
    return NextResponse.json({ success: false, error: 'Failed to list history' }, { status: 500 })
  }
}