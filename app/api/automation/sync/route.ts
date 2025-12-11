// app/api/automation/sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { readdir, cp, mkdir, copyFile, stat } from 'fs/promises'
import { join, basename } from 'path'
import { executeDatabaseSync } from '@/lib/db/db-exporter'
import { sendErrorAlert, sendSuccessReport } from '@/lib/email-service' // 邮件服务

function getLocalTimestamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// 递归拷贝并过滤文件
async function copyFilteredFiles(source: string, target: string) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(target, { recursive: true });

  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const destPath = join(target, entry.name);

    if (entry.isDirectory()) {
      await copyFilteredFiles(srcPath, destPath);
    } else {
      // 过滤逻辑：只允许 Excel 和 CSV，排除隐藏文件
      if (entry.name.match(/\.(xlsx|xls|csv)$/i) && !entry.name.startsWith('.') && !entry.name.startsWith('~$')) {
        await copyFile(srcPath, destPath);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  let newTimestamp = '';
  try {
    const { sourcePath } = await req.json(); // 外部程序传入的绝对路径，例如 "D:/MyData/ExcelFiles"

    if (!sourcePath) {
      return NextResponse.json({ error: 'Missing sourcePath' }, { status: 400 });
    }

    // 1. 寻找最新的 Schema 版本作为规则基准
    // 自动化运行时，肯定已经有人在 UI 上配好了至少一个版本的 Schema
    const schemaBaseDir = join(process.cwd(), 'output', 'schema');
    const schemaVersions = await readdir(schemaBaseDir);
    // 简单的按名字倒序，取最新的时间戳文件夹
    const latestVersion = schemaVersions.filter(f => !f.startsWith('.')).sort().reverse()[0];

    if (!latestVersion) {
      return NextResponse.json({ error: 'No schema definition found. Please run UI setup first.' }, { status: 400 });
    }

    console.log(`[AutoSync] Using schema version: ${latestVersion}`);

    // 2. 创建本次自动运行的快照目录 (Timestamp)
    newTimestamp = getLocalTimestamp();
    const newSchemaDir = join(process.cwd(), 'output', 'schema', newTimestamp);
    const newSourceDir = join(process.cwd(), 'output', 'source', newTimestamp);

    await mkdir(newSchemaDir, { recursive: true });
    await mkdir(newSourceDir, { recursive: true });

    // 3. 复制基准 Schema 到新目录
    // 这样 schema-loader 就能在新目录里找到 table_schema.json 和 full_data.json (虽然full_data在此处没用，但保持结构一致)
    await cp(join(schemaBaseDir, latestVersion), newSchemaDir, { recursive: true });

    // 4. 从外部 sourcePath 复制最新的原始文件到新 source 目录
    // 这一步模拟了 UI 上的“文件上传”过程
    // 注意：cp 是递归的，如果 sourcePath 下有子文件夹也会拷过来，符合 schema-loader 的 getFiles 逻辑
    await copyFilteredFiles(sourcePath, newSourceDir);

    console.log(`[AutoSync] Snapshot created: ${newTimestamp}`);

    // 5. 执行核心导出逻辑
    // 此时，文件已经在 output/source/{newTimestamp} 下，schema 在 output/schema/{newTimestamp} 下
    // executeDatabaseSync 会调用 loadSchemaAndData，后者会按自然顺序读取这些新文件
    const strategy = process.env.DB_UPDATE_STRATEGY || 'incremental'; // 获取当前策略
    const result = await executeDatabaseSync(
      '', // 空字符串表示使用 .env 中的默认连接
      newTimestamp,
      strategy
    );

    if (!result.success) {
      throw new Error(result.error || 'Unknown error during DB Sync');
    }

    // 6. 发送成功邮件报告
    if (result.detailsReport) {
      await sendSuccessReport(newTimestamp, result.detailsReport, strategy);
      console.log(`[AutoSync] Success report email sent.`);
    }

    return NextResponse.json({ 
        success: true,
        message: 'Auto sync completed',
        snapshot: newTimestamp,
        details: result 
    }, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error('[AutoSync] Error:', error);
    // 7. 发送报警邮件
    // 确保有时间戳，如果没有则用当前时间
    const ts = newTimestamp || getLocalTimestamp();
    await sendErrorAlert(error.message || String(error), ts);
    console.log(`[AutoSync] Alert email sent.`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}