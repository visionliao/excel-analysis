// lib/parsers/implementations/monthly-rr-parser.ts
import { BaseFileParser } from '../base-parser';

// Monthly RR Summary.xls 解析规则
export class MonthlyRRParser extends BaseFileParser {

  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        // 安全检查：先确保 c 是字符串再 trim
        const hasKeyword = row.some(c => c && String(c).trim() === 'Monthly RR Summary');
        if (hasKeyword) {
          const validCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
          if (validCells.length >= 2) return i;
        }
      }
    }
    return 0;
  }

  protected adjustHeaders(headers: string[]): string[] {
    const newHeaders = [...headers];

    // 找到 "Monthly RR Summary" 所在列
    // 增加防御性检查，防止 h 为 undefined
    const summaryIndex = newHeaders.findIndex(h => h && String(h).includes('Monthly RR Summary'));

    if (summaryIndex !== -1) {
      // 1. 将原标题改为 ID
      newHeaders[summaryIndex] = 'ID'; 

      // 2. 检查下一列是否为空（合并单元格的幽灵列）
      const nextColIndex = summaryIndex + 1;
      const nextColHeader = newHeaders[nextColIndex];

      // 如果下一列存在，且是空的或者纯空格 --> 说明它是合并单元格占位符
      if (nextColIndex < newHeaders.length && (!nextColHeader || nextColHeader.trim() === '')) {
        // 【关键修复】：直接覆盖它，利用这个空位放 Indicator
        newHeaders[nextColIndex] = 'Indicator';
      } else {
        // 如果下一列有内容（比如直接就是日期），说明没有合并，则插入新列
        newHeaders.splice(nextColIndex, 0, 'Indicator');
      }
    }

    return newHeaders;
  }

  protected validateRow(row: any, headers: string[]): boolean {
    const idVal = row['ID'];
    const indicatorVal = row['Indicator'];
    if (!idVal || !indicatorVal) return false;

    // 安全检查
    if (String(idVal).includes('Monthly')) return false;

    return true;
  }
}