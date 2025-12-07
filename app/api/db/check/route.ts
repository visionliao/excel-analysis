// app/api/db/check/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { loadSchemaAndData } from '@/lib/schema-loader'

export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, timestamp } = await req.json();

    // 1. 优先使用前端传来的地址，如果为空，则读取服务端环境变量兜底
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;

    if (!targetConnectionString || !timestamp) {
      return NextResponse.json({ success: false, error: '缺少连接字符串或版本时间戳' }, { status: 400 });
    }

    // 2. 服务端加载数据 (Schema + Data)
    const tables = await loadSchemaAndData(timestamp);

    // 3. 连接数据库
    client = new Client({ connectionString: targetConnectionString });
    await client.connect();

    const report = [];

    // 4. 执行对比逻辑
    for (const table of tables) {
      const targetTableName = table.tableName;
      const targetColumns = table.columns;

      // 检查表是否存在
      const checkTableRes = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`,
        [targetTableName]
      );
      const tableExists = checkTableRes.rows[0].exists;

      if (!tableExists) {
        report.push({
          tableName: targetTableName,
          status: 'NEW_TABLE',
          message: '数据库中不存在此表，将新建表。',
          newRowCount: table.totalRows,
          oldRowCount: 0,
          details: targetColumns.map(c => `${c.name} (${c.type})`)
        });
      } else {
        // 检查结构变更
        const checkColsRes = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1;`,
          [targetTableName]
        );
        const dbColumnNames = checkColsRes.rows.map((r: any) => r.column_name);

        // 【关键修复】显式定义数组类型，解决 "Implicit any[]" 报错
        const changes: string[] = [];

        // 检查新增列 (沙盘有，DB没)
        targetColumns.forEach(col => {
          if (!dbColumnNames.includes(col.name)) changes.push(`新增列: ${col.name}`);
        });

        // 检查删除列 (DB有，沙盘没)
        const targetColNames = targetColumns.map(c => c.name);
        dbColumnNames.forEach((dbColName: string) => {
          // 忽略 id 字段，因为我们会自动创建 id，如果数据库里有 id 但沙盘没配，不算差异
          if (dbColName !== 'id' && !targetColNames.includes(dbColName)) {
            changes.push(`删除列: ${dbColName}`);
          }
        });

        const countRes = await client.query(`SELECT COUNT(*) FROM "${targetTableName}"`);
        const dbRowCount = parseInt(countRes.rows[0].count, 10);

        if (changes.length > 0) {
           report.push({
              tableName: targetTableName,
              status: 'SCHEMA_CHANGE',
              message: '表结构不一致，将重建表。',
              newRowCount: table.totalRows,
              oldRowCount: dbRowCount,
              diff: changes
           });
        } else {
           const diff = table.totalRows - dbRowCount;
           report.push({
              tableName: targetTableName,
              status: 'DATA_UPDATE',
              message: `结构一致。${diff > 0 ? '新增 ' + diff + ' 行' : diff < 0 ? '减少 ' + Math.abs(diff) + ' 行' : '行数一致'}`,
              newRowCount: table.totalRows,
              oldRowCount: dbRowCount
           });
        }
      }
    }
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error('Database check error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}