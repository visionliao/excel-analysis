import { BaseFileParser, ParseResult } from '../base-parser';

export class WorkOrderParser extends BaseFileParser {
  
  // 重写处理逻辑，实现“一行变多行”
  protected processRawData(rawData: any[][]): ParseResult {
    if (!rawData || rawData.length === 0) return { headers: [], rows: [] };

    // 1. 识别表头
    const headerRowIndex = this.findHeaderRowIndex(rawData);
    // 提取并清洗表头
    const headers = this.adjustHeaders(this.extractHeaders(rawData[headerRowIndex]));

    // 2. 自动定位“房间号”字段
    // 常见的表头可能是 "房间号", "room_number", "Room" 等
    const roomHeader = headers.find(h => h && (
      h.includes('房间') || 
      h.toLowerCase().includes('room') || 
      h.includes('房号')
    ));

    if (roomHeader) {
      console.log(`[WorkOrderParser] Detected room column: "${roomHeader}"`);
    } else {
      console.warn(`[WorkOrderParser] Warning: Could not find room number column!`);
    }

    const finalRows: any[] = [];

    // 3. 遍历数据行 (跳过表头)
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const rowArr = rawData[i];

      // 3.1 手动映射数组为对象 (因为 mapRowArrayToObject 是 private 的)
      const rowObj: any = {};
      headers.forEach((h, idx) => {
        if (h) rowObj[h] = rowArr[idx];
      });

      // 3.2 基础密度校验
      if (!this.validateRow(rowObj, headers)) continue;

      // 3.3 执行基础转换 (处理日期等)
      const baseRow = this.transformRow(rowObj, headers);

      // 3.4 拆分房间号 & 转大写
      if (roomHeader && baseRow[roomHeader]) {
        // 获取原始房间号字符串
        const rawVal = String(baseRow[roomHeader]).trim();

        // 尝试分割：支持英文逗号(,)、中文逗号(，)、空格
        // "A610,A2106" -> ["A610", "A2106"]
        const rooms = rawVal.split(/[,，\s]+/).filter(r => r.trim() !== '');

        if (rooms.length > 1) {
          // --- 情况 A: 多房间，拆分 ---
          rooms.forEach(room => {
            const newRow = { ...baseRow }; // 浅拷贝整行数据
            newRow[roomHeader] = room.toUpperCase(); // 1. 转大写
            finalRows.push(newRow);
          });
        } else {
          // --- 情况 B: 单房间，仅转大写 ---
          baseRow[roomHeader] = rawVal.toUpperCase(); // 1. 转大写
          finalRows.push(baseRow);
        }
      } else {
        // 没有房间号，直接推入
        finalRows.push(baseRow);
      }
    }

    return {
      headers: headers.filter(h => h && h.trim() !== ''),
      rows: finalRows
    };
  }
}