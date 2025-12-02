import { BaseFileParser } from '../base-parser';

// 台账报表（住客）.xls
export class ResidentLedgerParser extends BaseFileParser {
  private debugCount = 0;

  /**
   * 修复表头错位
   * 问题：表头 "账号" 在 B 列，但数据在 C 列。
   * 解决：找到 "账号" 的位置，向右移动一格。
   */
  protected adjustHeaders(headers: string[]): string[] {
    // 1. 复制并初步清洗 (去除换行符，方便匹配)
    const newHeaders = headers.map(h => 
      h ? String(h).replace(/[\r\n]+/g, ' ').trim() : undefined
    );

    // 2. 打印原始表头，确认位置 (调试用)
    console.log('========== [ResidentLedger] Raw Headers ==========');
    newHeaders.forEach((h, i) => {
      if (h) console.log(`Index [${i}]: "${h}"`);
    });

    // 3. 找到 "账号" 所在的索引
    const accIndex = newHeaders.findIndex(h => h && (h.includes('账号') || h.includes('Accnt')));

    if (accIndex !== -1) {
      console.log(`[Fix] Found "账号" at Index ${accIndex}. Moving header to Index ${accIndex + 1} to match data column.`);
      
      // 向右移位
      // 将 "账号" 赋值给下一列 (C列)
      newHeaders[accIndex + 1] = newHeaders[accIndex];
      
      // 将原来的位置 (B列) 设为 undefined，防止读取空数据
      newHeaders[accIndex] = undefined;
    }

    return newHeaders as unknown as string[];
  }

  /**
   * 验证与调试
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    // 调试日志：检查账号是否读出来了
    if (this.debugCount < 3) {
      console.log(`\n========== [ResidentLedger] Row ${this.debugCount} Check ==========`);
      
      // 找到账号的 Key
      const accKey = headers.find(h => h && (h.includes('账号') || h.includes('Accnt')));
      
      if (accKey) {
        console.log(`Target Key: "${accKey}"`);
        console.log(`Read Value: "${newRow[accKey]}"`); // 这里应该显示 2375
      }
      this.debugCount++;
    }

    return newRow;
  }
}