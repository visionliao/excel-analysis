import { BaseFileParser } from '../base-parser';

// 长租押金实时余额表.xls
export class DepositBalanceRealtimeParser extends BaseFileParser {
  private debugCount = 0;

  /**
   * 1. 查找表头行
   */
  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('账号') && rowStr.includes('应付押金')) {
          return i;
        }
      }
    }
    return 0;
  }

  /**
   * 2. 基于真实表格确认的精确物理索引映射
   * 
   * Index [1] (B): 状态
   * Index [2] (C): 账号
   * Index [3] (D): 姓名
   * Index [4] (E): 预订人
   * Index [5] (F): 房号
   * Index [6] (G): 协议公司
   * Index [12] (M): 应付押金 (37400)
   * Index [13] (N): 已付押金 (37400)
   * Index [15] (P): 结转金 (0)
   */
  protected adjustHeaders(headers: string[]): string[] {
    
    // 使用致密数组填充，确保 xlsx 遍历到所有列
    const mappedHeaders = new Array(16).fill(null);

    // [Index 0] A列: 空
    mappedHeaders[1] = '状态';
    mappedHeaders[2] = '账号';
    mappedHeaders[3] = '姓名';
    mappedHeaders[4] = '预订人';
    mappedHeaders[5] = '房号';
    mappedHeaders[6] = '协议公司';

    // 中间 H-L (Index 7-11) 跳过
    mappedHeaders[12] = '应付押金'; // M列
    mappedHeaders[13] = '已付押金'; // N列

    // Index 14 (O列) 是空的，跳过
    mappedHeaders[15] = '结转金';   // P列

    return mappedHeaders as unknown as string[];
  }

  /**
   * 3. 验证行数据
   */
  protected validateRow(row: any, headers: string[]): boolean {
    const account = row['账号'];
    const room = row['房号'];

    // 必须有账号或房号
    if (!account && !room) return false;

    return true;
  }

  /**
   * 4. 数据转换
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    // 强制填充空值，防止 Key 丢失
    headers.forEach(key => {
      if (key && newRow[key] === undefined) {
        newRow[key] = '';
      }
    });

    if (this.debugCount < 3) {
      console.log(`\n========== [DepositBalance] Row ${this.debugCount} ==========`);
      console.log(`账号(C): ${newRow['账号']}`);
      console.log(`应付(M): ${newRow['应付押金']}`);
      console.log(`已付(N): ${newRow['已付押金']}`);
      this.debugCount++;
    }

    return newRow;
  }
}