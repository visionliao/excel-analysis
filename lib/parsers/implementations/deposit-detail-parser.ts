import { BaseFileParser } from '../base-parser';

// 长租押金收款明细表解析规则
export class DepositDetailParser extends BaseFileParser {

  protected validateRow(row: any, headers: string[]): boolean {
    // 1. 查找单号列
    const orderKey = headers.find(h => 
      h && (h.includes('单号') || h.includes('订单号') || h.toLowerCase().includes('order'))
    );

    // 规则：必须有单号
    if (orderKey) {
      const orderVal = row[orderKey];
      if (!orderVal || String(orderVal).trim() === '') return false;
    }

    // 2. 查找房号列
    const roomKey = headers.find(h => 
      h && (h.includes('房号') || h.toLowerCase().includes('room'))
    );

    // 规则：必须有房号
    if (roomKey) {
      const roomVal = row[roomKey];
      if (!roomVal || String(roomVal).trim() === '') return false;
    }

    return true;
  }
}