import * as XLSX from 'xlsx';
import { BaseFileParser, ParseResult } from '../base-parser';

// Statstics
export class StatisticsGeneralParser extends BaseFileParser {
  private extractedMonth: string = '';
  private debugCount = 0;

  /**
   * 重写 parse 方法
   * 1. 提取月份
   * 2. 执行解析
   * 3. 注入月份字段
   */
  public parse(buffer: Buffer, fileName: string): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rawData.length === 0) return { headers: [], rows: [] };

    // 1. 提取月份 (逻辑保持不变)
    this.extractedMonth = this.findMonthInMetadata(rawData);

    // 2. 调用基类解析
    const result = super.parse(buffer, fileName);

    // 3. 注入月份
    if (this.extractedMonth) {
      result.headers.unshift('统计月份');
      result.rows.forEach(row => {
        row['统计月份'] = this.extractedMonth;
      });
    }

    return result;
  }

  /**
   * 重写表头查找逻辑
   * 基类找不到 "Statstics" 这种拼写错误的单词，必须手动指定
   */
  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        // 将行内容拼接成字符串查找
        const rowStr = row.map(c => String(c).trim()).join(' ');
        
        // 匹配 Excel 截图中的表头关键字
        // 注意：Excel 里拼写是 "Statstics" (少了个 i)，我们要兼容它
        if (rowStr.includes('Statstics') || rowStr.includes('Statistics') || rowStr.includes('数值')) {
          return i;
        }
      }
    }
    return 0;
  }

  /**
   * 修复表头：映射索引
   * 结构：A=空, B=ID, C=统计项, D=空, E=数值
   */
  protected adjustHeaders(headers: string[]): string[] {
    const newHeaders: string[] = [];

    // 调试日志：确认原始表头位置
    // 只有第一个文件打印，避免刷屏
    // if (this.extractedMonth && !this['loggedHeaders']) {
    //   console.log('========== [Statistics] Raw Headers ==========');
    //   headers.forEach((h, i) => {
    //     if (h) console.log(`Index [${i}]: "${h}"`);
    //   });
    //   this['loggedHeaders'] = true;
    // }

    // Index 1 (Column B) -> ID
    newHeaders[1] = 'ID';
    
    // Index 2 (Column C) -> 统计项
    newHeaders[2] = '统计项';

    // Index 4 (Column E) -> 数值
    // 注意：C列是统计项，D列看起来是空的（或者是合并单元格的右半部分），E列是数值
    newHeaders[4] = '数值';

    return newHeaders as unknown as string[];
  }

  /**
   * 验证行数据
   */
  protected validateRow(row: any, headers: string[]): boolean {
    const id = row['ID'];
    // const name = row['统计项']; // 名字可能包含换行，不做强校验
    // const value = row['数值']; // 数值可能是 0，不能简单的 !value

    // 只要 ID 存在且是数字 (10, 11, ... 21)，就是有效行
    if (id && !isNaN(Number(id))) {
      return true;
    }
    
    // 调试：打印被丢弃的行，看看是不是误杀
    // const hasContent = Object.values(row).some(v => v);
    // if (hasContent && this.debugCount < 5) {
    //    console.log(`[Statistics] Row Rejected: ID=${id}, Data=${JSON.stringify(row)}`);
    //    this.debugCount++;
    // }

    return false;
  }

  // 辅助方法：提取月份
  private findMonthInMetadata(data: any[][]): string {
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell) continue;
        if (typeof cell === 'string') {
          const match = cell.trim().match(/^(\d{4})[\/\-](\d{2})$/);
          if (match) return `${match[1]}/${match[2]}`;
        }
        if (cell instanceof Date) {
          const y = cell.getFullYear();
          if (y >= 2020 && y <= 2030) {
             const m = String(cell.getMonth() + 1).padStart(2, '0');
             return `${y}/${m}`;
          }
        }
      }
    }
    return '';
  }
}