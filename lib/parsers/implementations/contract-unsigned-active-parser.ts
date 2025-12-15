import { BaseFileParser } from '../base-parser';

// 在住未送签合同列表.xls
export class ContractUnsignedParser extends BaseFileParser {

  protected transformRow(row: any, headers: string[]): any {
    // 1. 执行基类转换
    const newRow = super.transformRow(row, headers);

    // 2. 获取关键字段    
    // 动态查找包含“房号”和“账号”的列名
    const roomKey = headers.find(h => h && (h.includes('房号') || h === 'room_number'));
    const accountKey = headers.find(h => h && (h.includes('账号') || h === 'account_no'));

    if (roomKey && accountKey) {
      let roomVal = String(newRow[roomKey]).trim();
      const accountVal = String(newRow[accountKey]).trim();

      // 3. 判断是否需要修复 (纯数字，且不为空)
      // 例如 "1001" -> 需要修复; "A1001" -> 不需要
      if (/^\d+$/.test(roomVal)) {
        // 4. 从上下文获取映射表 (Account -> Room)
        const residentMap = this.context?.residentRoomMap;

        if (residentMap && residentMap.has(accountVal)) {
          const correctRoom = residentMap.get(accountVal);

          // 仅当找到的房号不是纯数字时才替换 (防止 resident 表也是坏的)
          if (correctRoom && !/^\d+$/.test(correctRoom)) {
            console.log(`[ContractFix] Fixed Room ${roomVal} -> ${correctRoom} (Account: ${accountVal})`);
            newRow[roomKey] = correctRoom;
          }
        }
      }
    }

    return newRow;
  }
}