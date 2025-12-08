import { NextRequest, NextResponse } from 'next/server'
import { Client, types } from 'pg'

types.setTypeParser(1082, (val) => val);
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, tableName, limit, offset } = await req.json();
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;

    client = new Client({ connectionString: targetConnectionString });
    await client.connect();

    // 简单查询，带分页
    const query = `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`;
    const res = await client.query(query, [limit, offset]);

    return NextResponse.json({ success: true, rows: res.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}