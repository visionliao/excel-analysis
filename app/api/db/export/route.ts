// app/api/db/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { executeDatabaseSync } from '@/lib/db/db-exporter'

export async function POST(req: NextRequest) {
  try {
    const { connectionString, timestamp } = await req.json();

    // 调用核心逻辑
    const result = await executeDatabaseSync(
      connectionString,
      timestamp,
      process.env.DB_UPDATE_STRATEGY
    );

    // 根据返回结果决定 HTTP 状态码
    if (!result.success) {
      const status = result.errorType === 'VALIDATION_ERROR' ? 400 : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    // 兜底捕获
    return NextResponse.json({ success: false, errorType: 'DB_ERROR', error: error.message }, { status: 500 });
  }
}