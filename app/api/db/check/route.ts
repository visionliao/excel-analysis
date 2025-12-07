// app/api/db/check/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { loadSchemaAndData } from '@/lib/schema-loader'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

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
    console.time('LoadData');
    const fullData = await loadSchemaAndData(timestamp);
    console.timeEnd('LoadData');

    // 3. 将解析好、准备导出的数据缓存到磁盘
    // 这样下一步“导出”时就不用再解析了，直接读这个文件，既快又保证数据绝对一致
    const cacheDir = join(process.cwd(), 'output', 'cache');
    await mkdir(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, `ready_to_export_${timestamp}.json`);
    await writeFile(cachePath, JSON.stringify(fullData));
    console.log(`[DB Check] Data cached to ${cachePath}`);

    const tables = fullData.tables;

    // 4. 连接数据库进行比对
    client = new Client({ connectionString: targetConnectionString });
    await client.connect();

    const report = [];

    // 5. 执行对比逻辑
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
        // 检查结构变更 (列名是否存在)
        const checkColsRes = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1;`,
          [targetTableName]
        );
        const dbColumnNames = checkColsRes.rows.map((r: any) => r.column_name);
        const changes: string[] = [];

        targetColumns.forEach(col => {
          if (!dbColumnNames.includes(col.name)) changes.push(`新增列: ${col.name}`);
        });
        const targetColNames = targetColumns.map(c => c.name);
        dbColumnNames.forEach((dbColName: string) => {
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
              message: '表结构变更，将重建表。',
              newRowCount: table.totalRows,
              oldRowCount: dbRowCount,
              diff: changes
           });
        } else {
           const diff = table.totalRows - dbRowCount;
           // 如果行数一样，且没有结构变化，理论上不需要操作，但为了保证数据一致性，通常还是全量覆盖
           // 这里仅作提示
           report.push({
              tableName: targetTableName,
              status: 'DATA_UPDATE',
              message: `结构一致。数据库现有 ${dbRowCount} 行，本次将写入 ${table.totalRows} 行。`,
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