import { BaseFileParser, ParseResult } from '../base-parser';

// 消费账户账龄分析报表.xls
export class AccountAgingParser extends BaseFileParser {
  private debugCount = 0;
  private parentHeaders: string[] = [];

  public parse(buffer: Buffer, fileName: string): ParseResult {
    console.log(`\n========== [AccountAging] Parsing: ${fileName} ==========`);
    return super.parse(buffer, fileName);
  }

  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('0-30天')) {
          // 保存父表头 (Row 3)
          // 使用 Array.from 确保没有空洞，全部填为字符串
          this.parentHeaders = Array.from(row).map(cell => cell ? String(cell).trim() : '');
          console.log(`[Header] Found Parent at Row ${i}. Length: ${this.parentHeaders.length}`);
          
          // 返回下一行作为子表头
          return i + 1;
        }
      }
    }
    return 0;
  }

  /**
   * 使用 for 循环遍历，杜绝稀疏数组跳过问题
   */
  protected adjustHeaders(headers: string[]): string[] {
    const combinedHeaders: string[] = [];
    let currentGroup = '';

    // 以父表头的长度为准进行遍历
    // 确保处理 Index 0, 1, 2 这些子表头为空的位置
    for (let i = 0; i < this.parentHeaders.length; i++) {

      // 1. 获取父表头
      const parentVal = this.parentHeaders[i];
      if (parentVal && parentVal !== '') {
        currentGroup = parentVal.replace(/[\r\n]+/g, '').trim();
      }

      // 2. 获取子表头 (安全获取)
      const rawSub = headers[i]; 
      const cleanSub = rawSub ? String(rawSub).replace(/[\r\n]+/g, '').trim() : '';

      // 3. 组装 Key
      let finalKey = '';

      // 逻辑：如果子表头为空，且父表头是固定列，则沿用父表头
      if (currentGroup.includes('账号') || currentGroup.includes('名称') || 
          currentGroup.includes('Account') || currentGroup.includes('Name') ||
          currentGroup.includes('合计') || currentGroup.includes('Total')) {
        finalKey = currentGroup;
      } 
      // 正常情况：父+子
      else if (cleanSub !== '') {
        finalKey = `${currentGroup}-${cleanSub}`;
      }
      // 空列
      else {
        finalKey = ''; 
      }

      combinedHeaders.push(finalKey);
    }

    // 调试日志：检查对齐情况
    console.log('========== [AccountAging] Aligned Headers ==========');
    combinedHeaders.forEach((h, i) => {
      if (h) console.log(`Index [${i}]: "${h}"`);
    });

    return combinedHeaders;
  }

  protected validateRow(row: any, headers: string[]): boolean {
    let account = row['账号'] || row['Account'];

    // 兜底查找
    if (!account) {
        const accKey = headers.find(h => h && (h.includes('账号') || h.includes('Account')));
        if (accKey) account = row[accKey];
    }

    if (!account || String(account).trim() === '') return false;

    const accStr = String(account).toLowerCase();
    if (accStr.includes('total') || accStr.includes('合计')) return false;

    return true;
  }

  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    if (this.debugCount < 1) {
      console.log(`\n========== [AccountAging] Row Check ==========`);
      console.log(`Key "账号" Val: "${newRow['账号']}"`);
      // 检查之前错位的列
      const testKey = '0-30天-微信-UPG';
      console.log(`Key "${testKey}" Val: "${newRow[testKey]}"`);
      this.debugCount++;
    }

    return newRow;
  }
}