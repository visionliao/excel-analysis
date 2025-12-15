import { BaseFileParser } from '../base-parser';

// 公寓账单明细表（住客）.xls
export class BillDetailResidentParser extends BaseFileParser {
  /**
   * 验证与调试
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    // 清洗房号：去掉字母后紧跟的 0 (如 B0602 -> B602)
    // 动态查找包含 "房号" 或 "Rmno" 的列名
    const roomKey = headers.find(h => h && (h.includes('房号') || h.toLowerCase().includes('rmno')));
    if (roomKey && newRow[roomKey]) {
      const originalRoom = String(newRow[roomKey]).trim();
      // 正则替换：字母+0+数字 -> 字母+数字
      newRow[roomKey] = originalRoom.replace(/^([A-Za-z]+)0(\d+)$/, '$1$2');
    }

    return newRow;
  }
}