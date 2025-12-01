import { BaseFileParser, ParseResult } from '../base-parser';

export class PostingSummaryTaxSepParser extends BaseFileParser {
  
  // 用于全局计数（跨文件累计）
  private static globalCount = 0;

  /**
   * 重写 parse 方法
   * 目的：在开始解析具体内容前，先打印当前文件的名称
   */
  public parse(buffer: Buffer, fileName: string): ParseResult {
    console.log('\n');
    console.log(`📁 来源：${fileName}`);

    // 调用基类的标准解析流程
    return super.parse(buffer, fileName);
  }

  /**
   * 1. 验证行数据 (过滤掉合计行)
   */
  protected validateRow(row: any, headers: string[]): boolean {
    // 先跑基类规则 (密度检查等)
    if (!super.validateRow(row, headers)) return false;

    // 额外检查：过滤掉“合计”或“Total”行
    // 通常出现在“账号”或“描述”列
    const keywords = Object.values(row).map(v => String(v).toLowerCase());
    if (keywords.some(k => k.includes('total') || k.includes('合计') || k.includes('sum:'))) {
      console.log(`[PostingAudit] 🚫 Filtered Summary Row:`, JSON.stringify(row));
      return false;
    }

    return true;
  }

  /**
   * 2. 数据转换与审计日志
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    PostingSummaryTaxSepParser.globalCount++;

    // ==================================================================================
    // 审计日志：打印每一行！
    // 格式优化：[序号] | 房号 | 消费金额 | 描述 | -> 完整JSON
    // ==================================================================================

    const room = newRow['房号'] || newRow['房号 Rmno'] || 'N/A';
    const amount = newRow['消费'] || '0';
    const desc = newRow['描述'] || 'N/A';
    const date = newRow['入账日期'] || 'N/A';

    // console.log(
    //   `[Audit #${PostingSummaryTaxSepParser.globalCount}] ` +
    //   `Room:${String(room).padEnd(6)} | ` + 
    //   `Amt:${String(amount).padEnd(10)} | ` + 
    //   `Date:${String(date).substring(0, 10)} | ` +
    //   `Desc:${desc}`
    // );

    // 完整的 JSON 对象，取消下面这行的注释
    // console.log(JSON.stringify(newRow));
    // console.log('\n');

    return newRow;
  }
}