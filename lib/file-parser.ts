// lib/file-parser.ts
import { getBaseTableName, TABLE_MAPPING } from './constants'
import { ParserFactory } from './parsers/factory'
import jschardet from 'jschardet' // 引入检测库
import iconv from 'iconv-lite'   // 引入转换库
import { extname } from 'path'   // 用于判断后缀

export interface ParsedTableData {
  tableName: string 
  originalBaseName: string 
  headers: string[]
  rows: any[]
  sourceFiles: string[] 
  totalRows: number
}

export async function parseExcelBuffer(
  buffer: Buffer,
  fileName: string,
  context: any = {}
): Promise<{ headers: string[], rows: any[] }> {
  // 1. 获取标准英文表名
  const baseName = getBaseTableName(fileName);
  console.log(`Input FileName: "${fileName}"`);
  console.log(`Parsed BaseName: "${baseName}" (Length: ${baseName.length})`);
  const tableName = TABLE_MAPPING[baseName] || `unknown_${baseName}`;
  console.log(`tableName: "${tableName}"`);

  // 2. 从工厂获取对应的解析器
  const parser = ParserFactory.getParser(tableName);

  // 注入上下文
  parser.setContext(context);

  const ext = extname(fileName).toLowerCase();
  console.log(`Processing ${fileName}, using parser: ${parser.constructor.name}`);
  // =========================================================
  // 针对 CSV 的编码自动修复逻辑(在ubuntu上打开为utf-8格式文件后，解析的内容都是乱码，需要针对解码进行处理)
  // =========================================================
  if (ext === '.csv') {
    // 1. 检测编码
    const detected = jschardet.detect(buffer);
    const encoding = detected.encoding ? detected.encoding.toLowerCase() : 'utf-8';

    console.log(`Detected CSV encoding for ${fileName}: ${encoding}`);

    // 2. 如果不是标准的 ascii/utf-8，或者虽然是 utf-8 但没有 BOM 导致可能识别错，
    // 统一手动解码成字符串，再传给 XLSX
    // 注意：GB2312, GBK, Big5, windows-1252 等都需要转换
    if (encoding !== 'ascii') {
        // 使用 iconv 解码为字符串 (这就解决了乱码问题)
        const strContent = iconv.decode(buffer, encoding);

        // 3. 将字符串重新转为 Buffer (UTF-8) 或者直接让 Parser 处理字符串
        // 为了兼容现有的 BaseParser.parse 接收 Buffer 的签名，
        // 这里把它重新编码为带 BOM 的 UTF-8 Buffer，这样 XLSX 就能识别了
        const newBuffer = Buffer.concat([
            Buffer.from('\uFEFF'), // 添加 BOM
            Buffer.from(strContent)
        ]);

        return await parser.parseWithFallback(newBuffer, fileName);
    }
  }

  // 3. 执行解析
  console.log(`Using parser for ${tableName}: ${parser.constructor.name}`);
  return await parser.parseWithFallback(buffer, fileName);
}

// 从 resident_id_document_list 的行数据中提取 Account -> Room 映射
export function buildResidentRoomMap(rows: any[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!rows || rows.length === 0) return map;

  // 找到 keys
  const firstRow = rows[0];
  if (!firstRow) return map;

  const keys = Object.keys(firstRow);
  const accountKey = keys.find(k => k.includes('账号') || k === 'account_no');
  const roomKey = keys.find(k => k.includes('房号') || k === 'room_number');

  if (accountKey && roomKey) {
    for (const row of rows) {
      const acc = String(row[accountKey]).trim();
      const room = String(row[roomKey]).trim();
      // 只有当房号有效且不是纯数字(或者是我们要的标准格式)时才存入
      if (acc && room) {
        map.set(acc, room);
      }
    }
  }
  return map;
}