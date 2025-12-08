import { NextRequest, NextResponse } from 'next/server'
import { Client, types } from 'pg'
import { loadSchemaAndData } from '@/lib/schema-loader'

// 强制日期转字符串，保证与导出逻辑一致
types.setTypeParser(1082, (val) => val);
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, timestamp } = await req.json();
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;

    if (!targetConnectionString || !timestamp) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    // 1. 加载 Schema (我们需要知道有哪些表，以及它们的字段定义)
    // 这里借用 loadSchemaAndData 主要是为了获取表名列表
    const fullData = await loadSchemaAndData(timestamp);
    const schemaTables = fullData.tables;

    client = new Client({ connectionString: targetConnectionString });
    await client.connect();

    const result = [];

    for (const schemaTable of schemaTables) {
      const tableName = schemaTable.tableName;

      // 2. 检查数据库中是否存在该表
      const checkRes = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`,
        [tableName]
      );

      if (!checkRes.rows[0].exists) {
        result.push({
          tableName,
          originalName: schemaTable.originalName,
          exists: false,
          rows: [],
          totalInDB: 0,
          columns: schemaTable.columns.map(c => c.name) // 依然返回预期的列名
        });
        continue;
      }

      // 3. 获取列名 (以数据库实际为准，防止 schema 不一致报错)
      // 但为了展示友好，我们尽量结合 schema 的定义

      // 4. 查询前 50 条数据
      // 我们显式查询 id + 业务字段
      const dataRes = await client.query(`SELECT * FROM "${tableName}" LIMIT 50`);
      
      // 5. 获取总行数 (用于判断是否显示"加载更多")
      const countRes = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
      const totalInDB = parseInt(countRes.rows[0].count, 10);

      result.push({
        tableName,
        originalName: schemaTable.originalName,
        exists: true,
        rows: dataRes.rows,
        totalInDB,
        columns: dataRes.fields.map(f => f.name) // 使用 DB 实际列名
      });
    }

    return NextResponse.json({ success: true, tables: result });
  } catch (error: any) {
    console.error('DB Query List Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}