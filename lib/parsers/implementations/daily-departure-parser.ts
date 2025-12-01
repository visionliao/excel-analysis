import { BaseFileParser } from '../base-parser';

// 处理 指定日期离店客人报表.xls ，这个表有很多空行，且隐藏看不到
export class DailyDepartureParser extends BaseFileParser {

  private debugCount = 0;

  /**
   * 1. 精确查找表头行
   * 必须包含 "账号" 和 "离开日期" (或者 "离店日期")
   */
  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('账号') && (rowStr.includes('离开日期') || rowStr.includes('离店日期'))) {
          return i;
        }
      }
    }
    return 0;
  }

  /**
   * 2. 处理列偏移
   * 将空表头设为 undefined，让 xlsx 自动跳过前面的空列，对齐后面的数据。
   */
  protected adjustHeaders(headers: string[]): string[] {
    console.log('========== [DailyDeparture] Raw Headers ==========');
    headers.forEach((h, i) => {
      if (h) console.log(`Index [${i}]: "${h}"`);
    });

    return headers.map(h => {
      // 如果表头是空的，返回 undefined (跳过该列读取)
      if (!h || h.trim() === '') return undefined;

      // 清洗：去换行符、去空格
      return String(h).replace(/[\r\n]+/g, ' ').trim();
    }) as unknown as string[];
  }

  /**
   * 3. 数据转换与调试
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);
    if (this.debugCount < 1) {
      console.log('\n========== [DailyDeparture] Row Debug ==========');
      // 找到有效的账号表头 Key
      const accountKey = headers.find(h => h && h.includes('账号'));

      if (accountKey) {
        console.log(`Target Key: "${accountKey}"`);
        console.log(`Read Value: "${newRow[accountKey]}"`);

        // 如果读不到，打印整行看看是不是还在错位
        if (!newRow[accountKey]) {
          console.log('Full Row:', JSON.stringify(newRow));
        }
      }
      this.debugCount++;
    }

    // console.log(JSON.stringify(newRow));
    return newRow;
  }

  /**
   * 4. 放宽行验证
   * 因为前面有空列，且中间可能有空行，防止密度检查误杀
   */
  protected validateRow(row: any, headers: string[]): boolean {
    // 必须有 "账号"
    const accountKey = headers.find(h => h && h.includes('账号'));
    if (accountKey && row[accountKey]) {
      return true; // 只要有账号，就认为是有效行
    }
    
    // 必须有 "房号"
    const roomKey = headers.find(h => h && h.includes('房号'));
    if (roomKey && row[roomKey]) {
      return true;
    }

    return super.validateRow(row, headers);
  }
}