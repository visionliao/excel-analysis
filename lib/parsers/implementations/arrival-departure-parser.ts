import { BaseFileParser } from '../base-parser';

// 未来一周内抵离客人.xls
export class ArrivalDepartureParser extends BaseFileParser {
  private debugCount = 0;

  /**
   * 只要有【账号】或【房号】，就是有效行。
   */
  protected validateRow(row: any, headers: string[]): boolean {
    // 1. 动态查找关键列名 (防止 Excel 里的列名有空格或微小变动)
    const accountKey = headers.find(h => h && h.includes('账号'));
    const roomKey = headers.find(h => h && h.includes('房号'));

    // 2. 获取对应的值
    const account = accountKey ? row[accountKey] : undefined;
    const room = roomKey ? row[roomKey] : undefined;

    // 3. 只要账号或房号存在，且不是表头重复行，就是有效数据
    const hasAccount = account && String(account).trim() !== '';
    const hasRoom = room && String(room).trim() !== '';

    // 排除表头重复行 (即账号列的值就是 "账号")
    if (hasAccount && String(account).includes('账号')) {
      return false; 
    }

    // 只要命中一个，就通过
    if (hasAccount || hasRoom) {
      return true;
    }

    // 4. 调试日志
    const hasAnyContent = Object.values(row).some(v => v);
    if (!hasAccount && !hasRoom && hasAnyContent && this.debugCount < 5) {
      console.log(`[ArrivalDeparture] Row Rejected (No Account/Room):`, JSON.stringify(row));
      this.debugCount++;
    }

    return false;
  }
  
  // 表头清洗
  protected adjustHeaders(headers: string[]): string[] {
    return headers.map(h => h ? String(h).replace(/[\r\n]+/g, ' ').trim() : '');
  }
}