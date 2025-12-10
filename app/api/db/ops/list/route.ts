// app/api/db/ops/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Client, types } from 'pg'
import { loadSchemaAndData } from '@/lib/db/schema-loader'

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
          tableComment: null,
          originalName: schemaTable.originalName,
          exists: false,
          rows: [],
          totalInDB: 0,
          columns: schemaTable.columns.map(c => ({
             name: c.name,
             comment: null // 还没建表，暂无 DB 备注
          }))
        });
        continue;
      }

      // 3. 获取数据库中的表备注
      const tblCommentRes = await client.query(
        `SELECT obj_description($1::regclass, 'pg_class') as comment`,
        [tableName]
      );
      const tableComment = tblCommentRes.rows[0]?.comment || null;

      // 4. 获取数据库中的列备注
      // 使用 information_schema 结合 col_description 函数
      const colCommentRes = await client.query(`
        SELECT
            column_name,
            pg_catalog.col_description(format('%s.%s', table_schema, table_name)::regclass::oid, ordinal_position) as comment
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      // 转成 Map 方便查找
      const colCommentMap = new Map<string, string>();
      colCommentRes.rows.forEach((row: any) => {
          if (row.comment) colCommentMap.set(row.column_name, row.comment);
      });

      // 5. 查询前 50 条数据
      // 我们显式查询 id + 业务字段
      const dataRes = await client.query(`SELECT * FROM "${tableName}" LIMIT 50`);
      
      // 6. 获取总行数 (用于判断是否显示"加载更多")
      const countRes = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
      const totalInDB = parseInt(countRes.rows[0].count, 10);

      // 7. 组装列信息 (包含 DB 中的备注)
      const columnsWithComment = dataRes.fields.map(f => ({
          name: f.name,
          comment: colCommentMap.get(f.name) || null
      }));

      result.push({
        tableName,
        tableComment,
        originalName: schemaTable.originalName,
        exists: true,
        rows: dataRes.rows,
        totalInDB,
        columns: columnsWithComment // 包含备注的列对象数组
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