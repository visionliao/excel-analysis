import { BaseFileParser, ParseResult } from '../base-parser';

export class TenantDemographicsParser extends BaseFileParser {

  /**
   * 重写 parse 方法
   * 目的：在基类解析完成后，从文件名提取年份，并注入到每一行数据中
   */
  public parse(buffer: Buffer, fileName: string): ParseResult {
    // 1. 先调用基类的通用解析逻辑
    const result = super.parse(buffer, fileName);

    // 2. 从文件名提取年份
    const year = this.extractYearFromFileName(fileName);

    if (year) {
      console.log(`[TenantDemographics] Extracted Year: ${year} from "${fileName}"`);

      // 3. 修改表头：在第一列插入 "统计年份"
      if (!result.headers.includes('统计年份')) {
        result.headers.unshift('统计年份');
      }

      // 4. 修改数据行：给每一行注入年份数据
      result.rows.forEach(row => {
        row['统计年份'] = year;
      });
    } else {
      console.warn(`[TenantDemographics] Could not extract year from "${fileName}"`);
    }

    return result;
  }

  /**
   * 辅助函数：利用正则从文件名提取年份
   * 支持格式：...24.xls, ...2024.xlsx, ...25.xls
   */
  private extractYearFromFileName(fileName: string): string {
    // 正则逻辑：
    // 1. (\d{2,4})  匹配 2到4位数字
    // 2. \.         匹配点号
    // 3. (xls|...)  匹配扩展名
    // 4. $          匹配结尾
    const match = fileName.match(/(\d{2,4})\.(xlsx|xls|csv)$/i);
    
    if (match) {
      let digits = match[1];
      
      // 如果是两位数 (24, 25)，补全为 2024, 2025
      if (digits.length === 2) {
        return '20' + digits;
      }
      return digits;
    }

    return '';
  }
}