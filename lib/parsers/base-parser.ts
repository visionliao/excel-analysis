// lib/parsers/base-parser.ts
import * as XLSX from 'xlsx';

export interface ParseResult {
  headers: string[];
  rows: any[];
}

export abstract class BaseFileParser {

  public parse(buffer: Buffer, fileName: string): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 1. 获取原始的二维数组
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (rawData.length === 0) return { headers: [], rows: [] };

    // 2. 找到表头所在行
    const headerRowIndex = this.findHeaderRowIndex(rawData);

    // 3. 提取原始表头
    let headers = this.extractHeaders(rawData[headerRowIndex]);

    // Hook，允许子类 增/删/改/重排 表头
    // 这一步非常重要，因为 sheet_to_json 依赖 headers 的长度来决定读取多少列数据
    headers = this.adjustHeaders(headers); 

    // 4. 提取数据行
    // 注意：这里传入修改后的 headers。
    // 如果 Excel 这一行有 5 格数据，但 headers 只有 4 个，第 5 格数据会被丢弃。
    // 如果 headers 变成了 5 个，第 5 格数据就会被正确读取。
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      range: headerRowIndex + 1,
      header: headers 
    }) as any[];

    // 5. 清洗与转换
    const validRows = rawRows
      .filter(row => this.validateRow(row, headers))
      .map(row => this.transformRow(row, headers));

    return {
      headers: headers.filter(h => h && h.trim() !== ''),
      rows: validRows
    };
  }

  // Hook: 允许子类修改表头结构 (默认不修改)
  protected adjustHeaders(headers: string[]): string[] {
    return headers;
  }

  protected findHeaderRowIndex(data: any[][]): number {
     let headerRowIndex = 0;
     let maxScore = -1;
     const keywords = ['房号', 'Room', '姓名', 'Name', '金额', 'Amount', '日期', 'Date', '单号', 'No.', 'Summary'];
 
     for (let i = 0; i < Math.min(20, data.length); i++) {
       const row = data[i];
       if (!Array.isArray(row) || row.length === 0) continue;
       let score = 0;
       const filledCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
       score += filledCells.length;
       filledCells.forEach(cell => {
         if (keywords.some(k => String(cell).includes(k))) score += 5;
       });
       if (score > maxScore) {
         maxScore = score;
         headerRowIndex = i;
       }
     }
     return maxScore < 2 ? 0 : headerRowIndex;
  }

  // 提取并清洗表头
  protected extractHeaders(row: any[]): string[] {
    if (!row) return [];
    return row.map(cell => cell ? String(cell).trim() : '');
  }

  // 验证行数据是否有效，默认逻辑：至少有2个有效值
  protected validateRow(row: any, headers: string[]): boolean {
    if (!row || Object.keys(row).length === 0) return false;
    const values = Object.values(row).filter(v => v !== null && v !== '' && v !== undefined);
    return values.length >= 2;
  }

  // 转换行数据 (例如日期格式化)
  protected transformRow(row: any, headers: string[]): any {
    const newRow: any = {};
    headers.forEach(header => {
        // 如果header为空字符串，跳过
       if (!header) return; 
       let val = row[header];
       if (val instanceof Date) {
         val = this.formatDate(val);
       }
       newRow[header] = val;
    });
    return newRow;
  }

  // 工具方法：格式化日期
  protected formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    if (hours === '00' && minutes === '00' && seconds === '00') {
      return `${year}-${month}-${day}`;
    }
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}