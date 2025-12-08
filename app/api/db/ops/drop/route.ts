import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, tableNames } = await req.json();
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;

    if (!Array.isArray(tableNames) || tableNames.length === 0) {
      return NextResponse.json({ error: 'No tables specified' }, { status: 400 });
    }

    client = new Client({ connectionString: targetConnectionString });
    await client.connect();
    await client.query('BEGIN');

    for (const tableName of tableNames) {
      // 使用 CASCADE 级联删除，自动处理外键依赖
      await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (client) await client.query('ROLLBACK');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}