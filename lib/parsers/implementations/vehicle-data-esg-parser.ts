import { BaseFileParser } from '../base-parser';

// Vehicle Level Data-ESG 系列表格解析规则
export class VehicleDataESGParser extends BaseFileParser {

  /**
   * 重写行验证逻辑
   * 该表的最后两行 (24.23, 24.24) 的 "Data" 列为空，
   * 导致有效列数太少，被基类的“50%密度阈值”误杀。
   */
  protected validateRow(row: any, headers: string[]): boolean {
    // 1. 查找关键列：KPI 描述列
    // 也就是截图中间那一长串文字 "ESG Vehicle - KPI requested..."
    const kpiKey = headers.find(h => 
      h && (h.includes('KPI') || h.includes('requested') || h.includes('calculated'))
    );

    // 2. 特殊放行规则：
    // 只要 KPI 描述列有内容，且序号列有内容，我们就认为是有效行。
    // 不管 Data 列是不是空的。
    if (kpiKey) {
      const kpiVal = row[kpiKey];
      // 如果 KPI 描述存在
      if (kpiVal && String(kpiVal).trim() !== '') {
        // 再检查一下有没有序号 (防止读到表头重复行)
        // 假设序号在第一列或包含点号 (如 24.01)
        const hasValues = Object.values(row).filter(v => v).length;
        
        // 只要有至少 2 个有效值 (序号 + KPI)，就直接通过，无视密度检查
        if (hasValues >= 2) {
          return true; 
        }
      }
    }

    // 3. 如果没匹配到上述规则，再走基类的通用逻辑
    return super.validateRow(row, headers);
  }
}