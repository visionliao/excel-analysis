import { BaseFileParser } from '../base-parser';

// 指定日期在住客人证件号报表.xls
export class ResidentIdDocumentParser extends BaseFileParser {
  private debugCount = 0;

  /**
   * 修复表头错位：
   * 问题：表头 "房号" 在 E 列 (Index 4)，但数据在 F 列 (Index 5)。
   * 解决：找到 "房号" 所在位置，将其向右移动一格。
   */
  protected adjustHeaders(headers: string[]): string[] {
    const newHeaders = [...headers];

    // 1. 打印原始表头，确认索引位置
    console.log('========== [ResidentIdDoc] Raw Headers ==========');
    newHeaders.forEach((h, i) => {
      if (h) console.log(`Index [${i}]: "${h}"`);
    });

    // 2. 找到 "房号" 所在的索引
    const roomHeaderIndex = newHeaders.findIndex(h => h && h.includes('房号'));

    if (roomHeaderIndex !== -1) {
      console.log(`[Fix] Found "房号" at Index ${roomHeaderIndex}. Moving it to Index ${roomHeaderIndex + 1} to align with data.`);
      
      // 3. 【核心操作】向右移位
      // 将 "房号" 赋值给下一列 (F列)
      newHeaders[roomHeaderIndex + 1] = newHeaders[roomHeaderIndex];
      
      // 将原来的位置 (E列) 设为 undefined，避免重复读取或读取空数据
      newHeaders[roomHeaderIndex] = undefined as unknown as string;
    }

    // 4. 顺便处理一下第一列可能是空的情况 (Column A)
    // 如果 "账号" 在 Index 1 (B列)，说明 A 列是空的，我们把 Index 0 显式设为 undefined
    const accountIndex = newHeaders.findIndex(h => h && h.includes('账号'));
    if (accountIndex === 1) {
       newHeaders[0] = undefined as unknown as string;
    }

    return newHeaders;
  }

  /**
   * 验证与调试
   */
  protected transformRow(row: any, headers: string[]): any {
    // 1. 先执行基类的通用转换 (比如日期格式化等)
    const newRow = super.transformRow(row, headers);

    // 2. 找到房号的 Key (因为 adjustHeaders 修改过，key 应该是 "房号" 或包含 "房号" 的字符串)
    const roomKey = headers.find(h => h && h.includes('房号'));

    // 3. 清洗房号中的多余前导 0，比如A0922-A922，B0307-B307，否则这些房号和 room_details 中的房号对不上
    if (roomKey && newRow[roomKey]) {
      const originalRoom = String(newRow[roomKey]).trim();

      // 正则逻辑：
      // ^([A-Za-z]+) -> 捕获开头的字母 (Group $1)
      // 0            -> 匹配字母后面紧跟的 0 (不捕获，就是要删掉它)
      // (\d+)$       -> 捕获剩余的数字 (Group $2)
      // 替换为：$1$2 (字母+剩余数字)
      const cleanRoom = originalRoom.replace(/^([A-Za-z]+)0(\d+)$/, '$1$2');

      if (cleanRoom !== originalRoom) {
        // console.log(`[Room Clean] ${originalRoom} -> ${cleanRoom}`); // 调试用
        newRow[roomKey] = cleanRoom;
      }
    }

    // 调试日志：检查前几行的房号是否读出来了
    if (this.debugCount < 3) {
      console.log(`\n========== [ResidentIdDoc] Row ${this.debugCount} Check ==========`);
      
      // 找到房号的 Key
      const roomKey = headers.find(h => h && h.includes('房号'));
      
      if (roomKey) {
        console.log(`Target Key: "${roomKey}"`);
        console.log(`Read Value: "${newRow[roomKey]}"`); // 这里应该显示 A0201 等
      }
      this.debugCount++;
    }

    return newRow;
  }
}