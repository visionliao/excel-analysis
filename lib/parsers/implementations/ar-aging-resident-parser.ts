import * as XLSX from 'xlsx';
import { BaseFileParser, ParseResult } from '../base-parser';

// 长租应收账龄报表（住客）.xls
export class ArAgingResidentParser extends BaseFileParser {

  public parse(buffer: Buffer, fileName: string): ParseResult {
    console.log(`\n========== [AR Aging] STATEFUL PARSE: ${fileName} ==========`);

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rawData.length === 0) return { headers: [], rows: [] };

    // 1. 找表头行
    const headerRowIndex = this.findHeaderRowIndex(rawData);
    console.log(`[Header] Found at Row Index: ${headerRowIndex}`);
    const headerRow = rawData[headerRowIndex];

    // 2. 确定最大列索引 (Max Column Index)
    // 表头行可能比数据行短（因为末尾的合计表头可能是空的），所以要扫描数据行来确定边界
    let maxColIndex = headerRow.length;
    for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 10, rawData.length); i++) {
      if (rawData[i] && rawData[i].length > maxColIndex) {
        maxColIndex = rawData[i].length;
      }
    }
    console.log(`[Config] Detected Max Column Index: ${maxColIndex - 1}`);

    // 3. 构建动态表头
    const finalHeaders = ['房号', '姓名', '销售员'];
    const dynamicCols: { name: string, index: number }[] = [];

    // 从 Index 4 开始提取
    // 我们遍历到 maxColIndex，防止漏掉最后一列
    for (let i = 4; i < maxColIndex; i++) {
      let h = headerRow[i];
      let colName = '';

      if (h) {
        colName = String(h).replace(/[\r\n]+/g, '').trim();
      } 
      
      // 补全最后一列 "账龄合计"
      // 如果名字为空，且是最后一列（或者倒数第二列），判定为合计
      if (!colName && i === maxColIndex - 1) {
        colName = '账龄合计';
        console.log(`[Header Fix] Auto-filled missing header at Index ${i} as "${colName}"`);
      }

      if (colName) {
        dynamicCols.push({ name: colName, index: i });
        finalHeaders.push(colName);
      }
    }

    // 4. 提取数据 (带记忆功能)
    const parsedRows: any[] = [];
    let lastRoom = ''; // 记忆上一行的房号

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const rowArray = rawData[i];
      if (!rowArray || rowArray.length === 0) continue;

      // 读取 Index 1 (B列) 作为房号
      let roomVal = this.safeVal(rowArray[1]);
      // 清洗房号：去掉字母后紧跟的 0 (如 A0201 -> A201)
      if (roomVal) {
        roomVal = roomVal.replace(/^([A-Za-z]+)0(\d+)$/, '$1$2');
      }
      const nameVal = this.safeVal(rowArray[2]); // Index 2 姓名

      // 处理合并行
      if (roomVal && roomVal !== '') {
        // 如果当前行有房号，更新记忆，且排除 Total 行
        if (roomVal.includes('合计') || roomVal.includes('Total')) continue;
        lastRoom = roomVal;
      } else {
        // 如果当前行没房号，检查是否是有效的数据行
        // 判据：如果没房号，但是有姓名 (Index 2)，说明是同住人/合并行
        if (lastRoom !== '' && nameVal && nameVal !== '') {
          // 继承上一行的房号
          roomVal = lastRoom;
        } else {
          // 既没房号，也没姓名，那是真的空行或垃圾数据，跳过
          continue;
        }
      }

      const record: any = {};

      // 硬编码读取前三列
      record['房号'] = roomVal;                    
      record['姓名'] = nameVal;
      record['销售员'] = this.safeVal(rowArray[3]); // Index 3

      // 动态读取费用列
      dynamicCols.forEach(col => {
        const val = this.safeVal(rowArray[col.index]);
        // 费用为空时默认为 0
        record[col.name] = val === '' ? '0' : val;
      });

      parsedRows.push(record);
    }

    return {
      headers: finalHeaders,
      rows: parsedRows
    };
  }

  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('停车费') && rowStr.includes('物业费')) {
          return i;
        }
      }
    }
    return 0;
  }

  private safeVal(val: any): string {
    return (val !== undefined && val !== null) ? String(val).trim() : '';
  }

  // 占位
  protected adjustHeaders(h: string[]): string[] { return h; }
  protected validateRow(r: any, h: string[]): boolean { return true; }
  protected transformRow(r: any, h: string[]): any { return r; }
}