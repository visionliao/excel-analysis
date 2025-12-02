import { BaseFileParser } from '../base-parser';

// 能耗统计表.xls
export class EnergyConsumptionStatsParser extends BaseFileParser {
  private debugCount = 0;

  /**
   * 基于用户提供的精确列结构进行硬编码映射。
   * 结构：A空, B=项目, D=数量, F=单价, H=金额
   */
  protected adjustHeaders(headers: string[]): string[] {
    // 调试日志：确认原始索引
    console.log('========== [EnergyStats] Index Mapping Check ==========');
    headers.forEach((h, i) => {
      if (h) console.log(`Raw Index [${i}]: "${h}"`);
    });

    // 创建一个新的稀疏数组，精准对应数据所在的列
    const mappedHeaders: string[] = [];

    // Column B (Index 1) -> 项目
    mappedHeaders[1] = '项目';

    // Column D (Index 3) -> 数量
    mappedHeaders[3] = '数量';

    // Column F (Index 5) -> 单价
    mappedHeaders[5] = '单价';

    // Column H (Index 7) -> 金额
    mappedHeaders[7] = '金额';

    // 使用类型断言返回，告诉 TS 这是一个字符串数组（实际包含 undefined，让 xlsx 跳过无关列）
    return mappedHeaders as unknown as string[];
  }

  /**
   * 验证行数据
   */
  protected validateRow(row: any, headers: string[]): boolean {
    const item = row['项目'];
    const amount = row['金额'];

    // 调试日志 (只打前3行)
    if (this.debugCount < 3) {
      console.log(`[EnergyStats] Row Check -> Item: "${item}", Amount: "${amount}"`);
      this.debugCount++;
    }

    // 只要有项目名称和金额，就是有效行
    if (!item || !amount) {
      return false;
    }

    return true;
  }

  /**
   * 数据转换
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);
    // 这里不需要额外逻辑，基类已经处理好了
    return newRow;
  }
}