// app/api/config/get-db-url/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  // 读取环境变量
  const dbUrl = process.env.POSTGRES_URL || '';

  // 返回给前端
  return NextResponse.json({
    success: true,
    url: dbUrl
  });
}