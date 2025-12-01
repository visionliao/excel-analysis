import { BaseFileParser } from '../base-parser';

// Performance Tracking.xls表解析规则
export class PerformanceTrackingParser extends BaseFileParser {

  protected validateRow(row: any, headers: string[]): boolean {
    // 过滤掉最后的总额统计这一行
    // 遍历表头的所有列，要求这一行在每一列上都必须有有效值
    for (const header of headers) {
      if (!header || header.trim() === '') {
        continue;
      }

      const val = row[header];

      // 检查空值：null, undefined, 或 空字符串
      if (val === null || val === undefined || String(val).trim() === '') {
        return false;
      }
    }

    return true;
  }
}