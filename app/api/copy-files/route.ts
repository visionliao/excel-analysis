// app/api/copy-files/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { parseExcelBuffer, ParsedTableData, buildResidentRoomMap } from '@/lib/file-parser'
import { getBaseTableName, TABLE_MAPPING } from '@/lib/constants'

interface GroupedTableData extends ParsedTableData {
  parseErrors: string[]; // 记录该表下的解析错误
}

function getLocalTimestamp() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  // 返回格式：2025-12-01_10-30-55
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export async function POST(request: NextRequest) {
  try {
    const { files } = await request.json()
    files.sort((a: any, b: any) => {
      // 优先比较路径（如果有），再比较文件名
      const nameA = a.relativePath || a.name;
      const nameB = b.relativePath || b.name;
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    console.log('\n=== [CopyFiles] Sorted File List ===');
    files.forEach((f: any, i: number) => {
        console.log(`${i + 1}. ${f.relativePath || f.name}`);
    });
    console.log('====================================\n');

    // 预处理：优先提取 resident_id_document_list 的数据
    let residentRoomMap = new Map<string, string>();
    // 找到对应文件
    const residentFile = files.find((f: any) => getBaseTableName(f.name) === '指定日期在住客人证件号报表');
    if (residentFile) {
      try {
        const buf = Buffer.from(residentFile.data, 'base64');
        // 先解析它
        const { rows } = await parseExcelBuffer(buf, residentFile.name);
        // 构建映射
        residentRoomMap = buildResidentRoomMap(rows);
        console.log(`[Pre-process] Built Resident Map with ${residentRoomMap.size} entries.`);
      } catch (e) {
        console.warn('[Pre-process] Failed to build resident map:', e);
      }
    }

    const timestamp = getLocalTimestamp();
    const outputDir = join(process.cwd(), 'output', 'source', timestamp)
    await mkdir(outputDir, { recursive: true })

    // 聚合容器
    const groupedTables: Record<string, GroupedTableData> = {};

    await Promise.all(files.map(async (fileItem: any) => {
      let currentTableName = 'unknown'; // 默认为 unknown，防止 catch 中拿不到名字

      try {
        // 1. 确定表名
        const baseName = getBaseTableName(fileItem.name);
        currentTableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;

        // 初始化聚合对象
        if (!groupedTables[currentTableName]) {
          groupedTables[currentTableName] = {
            tableName: currentTableName,
            originalBaseName: baseName,
            headers: [],
            rows: [],
            sourceFiles: [],
            totalRows: 0,
            parseErrors: [] // 错误记录
          };
        }

        // 2. 保存文件
        let targetDir = outputDir
        if (fileItem.relativePath) {
          const dirPath = fileItem.relativePath.substring(0, fileItem.relativePath.lastIndexOf('/'))
          if (dirPath) {
            targetDir = join(outputDir, dirPath)
            await mkdir(targetDir, { recursive: true })
          }
        }
        const buffer = Buffer.from(fileItem.data, 'base64')
        await writeFile(join(targetDir, fileItem.name), buffer)

        // 3. 解析文件
        const { headers, rows } = await parseExcelBuffer(buffer, fileItem.name, {
          residentRoomMap
        });

        // 4. 合并数据
        const currentTable = groupedTables[currentTableName];
        currentTable.sourceFiles.push(fileItem.name); // 记录成功文件
        currentTable.rows.push(...rows);
        currentTable.totalRows += rows.length;

        // 更新表头 (如果还没有表头，且当前解析出的表头有效)
        if (currentTable.headers.length === 0 && headers.length > 0) {
          currentTable.headers = headers;
        }
      } catch (fileError: any) {
        console.error(`Error processing file ${fileItem.name}:`, fileError);
        // 5. 错误捕获：记录到对应的表中，而不是让 API 崩溃
        if (groupedTables[currentTableName]) {
          groupedTables[currentTableName].parseErrors.push(
            `文件 "${fileItem.name}" 解析失败: ${fileError.message}`
          );
          // 也可以选择把文件名加到 sourceFiles 里，或者单独搞一个 failedFiles 列表
        }
      }
    }));

    // 转换为数组返回
    const resultList = Object.values(groupedTables);

    // 只要没有系统级崩溃，都返回 200，在前端展示具体的错误信息
    return NextResponse.json({
      success: true,
      timestamp: timestamp,
      data: resultList
    })
  } catch (error) {
    console.error('System API Error:', error)
    return NextResponse.json({ error: 'Critical system error during processing' }, { status: 500 })
  }
}
