import { BaseFileParser } from '../base-parser';

// 处理 前台入账明细表(可选费用码) 系列表格，因数据量巨大，每个住客每天都会插入一条付款信息，所以要将那些没有付款的无用数据清洗掉。
export class PostingDetailFeeCodeParser extends BaseFileParser {

  /**
   * 重写行验证逻辑
   * 目标：过滤掉无意义的流水行（即：消费和付款都为 0 的行）
   */
  protected validateRow(row: any, headers: string[]): boolean {
    // 1. 先执行基类的通用检查 (如空行、密度检查)
    if (!super.validateRow(row, headers)) {
      return false;
    }

    // 2. 获取关键字段的值
    // 根据截图，列名分别是 "消费" 和 "付款"
    const consumeVal = row['消费'];
    const payVal = row['付款'];

    // 3. 判断一个值是否“有效且非零”
    const isEffectivelyNonZero = (val: any): boolean => {
      // 空值、未定义、空字符串 -> 视为 0
      if (val === undefined || val === null || String(val).trim() === '') {
        return false;
      }
      
      // 尝试转为数字
      const num = parseFloat(String(val));
      
      // 如果转换失败(NaN)或者是 0 -> 视为 0
      if (isNaN(num) || num === 0) {
        return false;
      }

      // 只有非 0 的数字（包括负数，如退款）才算有效
      return true;
    };

    // 4. 如果“消费”和“付款”【都】是 0 或无效值，则丢弃该行
    if (!isEffectivelyNonZero(consumeVal) && !isEffectivelyNonZero(payVal)) {
      // 可以在这里打印日志查看过滤了多少数据 (可选)
      // console.log(`[Filter] Dropped zero-value row: ${JSON.stringify(row)}`);
      return false;
    }

    // 只要其中有一个不为 0 (产生费用 或 产生付款)，就保留
    return true;
  }
}