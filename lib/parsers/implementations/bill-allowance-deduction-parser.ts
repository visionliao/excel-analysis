import { BaseFileParser } from '../base-parser';

// 公寓账单津贴抵扣.xls
export class BillAllowanceDeductionParser extends BaseFileParser {

  protected transformRow(row: any, headers: string[]): any {
    // 1. 执行基类通用转换
    const newRow = super.transformRow(row, headers);

    // 2. 定位关键列
    const orderKey = headers.find(h => h && (h.includes('订单') || h.includes('NO.') || h === 'order_no'));
    const roomKey = headers.find(h => h && (h.includes('房号') || h.includes('Rmno') || h === 'room_number'));

    // 3. 执行补全逻辑
    if (orderKey && roomKey) {
      const orderVal = String(newRow[orderKey] || '').trim();
      let roomVal = newRow[roomKey];

      // 如果房号为空 (null, undefined, '', 'null')
      if (!roomVal || String(roomVal).trim() === '' || String(roomVal).toLowerCase() === 'null') {
        
        // 从上下文获取映射表 (Context 已经在 schema-loader/copy-files 中注入)
        const residentMap = this.context?.residentRoomMap;

        if (residentMap && orderVal) {
          // 尝试查找 (订单号 对应 账号)
          const foundRoom = residentMap.get(orderVal);

          if (foundRoom) {
            // console.log(`[BillAllowanceFix] Filled missing room for Order ${orderVal}: ${foundRoom}`);
            newRow[roomKey] = foundRoom;
          }
        }
      } 
      // 如果房号不为空，也可以顺手清洗一下格式 (去掉 A0201 中的 0)
      else {
         newRow[roomKey] = String(roomVal).replace(/^([A-Za-z]+)0(\d+)$/, '$1$2');
      }
    }

    return newRow;
  }
}