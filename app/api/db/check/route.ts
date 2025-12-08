// app/api/db/check/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Client, types } from 'pg'
import { loadSchemaAndData } from '@/lib/schema-loader'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { calculateIncrementalDiff } from '@/lib/db-diff'

// =============================================================================
// 配置 pg 驱动：读取日期、时间时保持字符串
// =============================================================================
types.setTypeParser(1082, (val) => val);
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

export async function POST(req: NextRequest) {
  let client: Client | null = null;
  try {
    const { connectionString, timestamp } = await req.json();
    // 1. 优先使用前端传来的地址，如果为空，则读取服务端环境变量兜底
    const targetConnectionString = connectionString || process.env.POSTGRES_URL;
    // 获取策略，默认为 incremental
    const strategy = process.env.DB_UPDATE_STRATEGY || 'incremental';

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
    console.log(`[DB Check] Strategy: ${strategy}`);

    // 5. 执行对比逻辑
    for (const table of tables) {
      const { tableName, columns, rows } = table;

      // 使用通用 Diff 逻辑
      const diffResult = await calculateIncrementalDiff(client, tableName, columns, rows);
      const { isNewTable, isSchemaChanged, toInsert, dbCount } = diffResult;

      // 根据策略生成报告文案
      if (isNewTable) {
        report.push({
          tableName,
          status: 'NEW_TABLE',
          message: '数据库不存在此表，将新建。',
          newRowCount: rows.length,
          oldRowCount: 0,
          insertCount: rows.length,
          priority: 1 // 排序优先级
        });
      } else if (isSchemaChanged) {
        report.push({
          tableName,
          status: 'SCHEMA_CHANGE',
          message: '表结构变更，将 DROP 并重建（全量覆盖）。',
          newRowCount: rows.length,
          oldRowCount: dbCount,
          insertCount: rows.length,
          priority: 0 // 最高优先级，红色警告
        });
      } else {
        // 结构一致
        if (strategy === 'overwrite') {
           // 全量模式
           const diff = rows.length - dbCount;
           report.push({
              tableName,
              status: 'DATA_OVERWRITE',
              message: `[全量模式] 将清空旧数据并插入新数据。`,
              newRowCount: rows.length,
              oldRowCount: dbCount,
              insertCount: rows.length,
              priority: diff !== 0 ? 2 : 10 // 如果行数不同，稍微提前
           });
        } else {
          // 增量模式
          const insertCount = toInsert.length;
          if (insertCount > 0) {
            report.push({
              tableName,
              status: 'DATA_INCREMENTAL',
              message: `[增量模式] 检测到 ${insertCount} 条新数据，将执行插入。`,
              newRowCount: dbCount + insertCount,
              oldRowCount: dbCount,
              insertCount: insertCount,
              priority: 2 // 有新增，排前面
            });
          } else {
            report.push({
              tableName,
              status: 'NO_CHANGE',
              message: `[增量模式] 数据完全一致，无需操作。`,
              newRowCount: dbCount,
              oldRowCount: dbCount,
              insertCount: 0,
              priority: 99 // 沉底
            });
          }
        }
      }
    }
    // 排序：结构变更 > 新表 > 有数据更新 > 无变化
    report.sort((a, b) => a.priority - b.priority);

    return NextResponse.json({ success: true, report, strategy });
  } catch (error: any) {
    console.error('Database check error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}