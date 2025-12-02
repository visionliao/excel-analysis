import * as XLSX from 'xlsx';
import { BaseFileParser, ParseResult } from '../base-parser';

// APG Asset data系列表格
export class APGAssetDataParser extends BaseFileParser {

  public parse(buffer: Buffer, fileName: string): ParseResult {
    console.log(`\n========== [APGAssetData] FINAL PARSE: ${fileName} ==========`);

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 1. 强制扩展范围 (日志显示数据到了 Index 41/AP列)
    // 为了保险，我们开到 AZ 列
    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      if (range.e.c < 50) {
        range.e.c = 50;
        sheet['!ref'] = XLSX.utils.encode_range(range);
      }
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (rawData.length === 0) return { headers: [], rows: [] };

    // 2. 找表头 (日志确认在 Row 3)
    const headerRowIndex = this.findHeaderRowIndex(rawData);
    const headerRow = rawData[headerRowIndex];

    // 3. 构建表头定义
    const fixedHeaders = ['序号', 'Vehicle/fund name', 'Ownership share (%)'];

    // 存储动态表头的名称和物理索引
    const dynamicCols: { name: string, index: number }[] = [];

    // 从 Index 6 开始，一直往后读，只要有字就算一列
    // 日志显示一直到了 Index 41
    for (let i = 6; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (h) {
        const cleanName = String(h).replace(/[\r\n]+/g, ' ').trim();
        dynamicCols.push({ name: cleanName, index: i });
      }
    }

    // 最终输出给前端的 Headers 数组
    const finalHeaders = [...fixedHeaders, ...dynamicCols.map(d => d.name)];
    console.log(`[Config] Total Output Columns: ${finalHeaders.length} (Expected: 39)`);

    // 4. 遍历数据并合并
    const parsedRows: any[] = [];
    let pendingDataRow: any[] | null = null; 

    // 硬编码关键索引 (基于日志)
    const IDX_SEQ = 1;     // 序号
    const IDX_VEH = 2;     // Vehicle
    const IDX_OWN = 4;     // Ownership

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const rowArray = rawData[i];
      if (!rowArray || rowArray.length === 0) continue;

      const vehicleVal = this.safeVal(rowArray[IDX_VEH]);
      const ownerVal = this.safeVal(rowArray[IDX_OWN]);

      // --- 状态机逻辑 ---

      // 情况 A: 数据行 (有 Ownership, 无 Vehicle)
      // 日志显示 Index 4 有 "100%", Index 2 为空
      if (ownerVal !== '' && vehicleVal === '') {
        pendingDataRow = rowArray; // 存入缓存
        continue;
      }

      // 情况 B: ID行 (有 Vehicle)
      // 日志显示 Index 2 有 "GCMVI"
      if (vehicleVal !== '') {

        // 如果缓存里有数据行，立即合并
        if (pendingDataRow) {
          const record: any = {};

          // 1. 取 ID 信息
          record['序号'] = this.safeVal(rowArray[IDX_SEQ]);
          record['Vehicle/fund name'] = vehicleVal;

          // 2. 取 Ownership (从数据行)
          let finalOwner = this.safeVal(pendingDataRow[IDX_OWN]);
          if (finalOwner === '1') finalOwner = '100%';
          record['Ownership share (%)'] = finalOwner;

          // 3. 取所有动态列 (从数据行)
          dynamicCols.forEach(col => {
            // 使用保存好的 index 去数据行里取值
            record[col.name] = this.formatVal(pendingDataRow![col.index]);
          });

          parsedRows.push(record);
          pendingDataRow = null; // 消费完毕，清空
        }
      }
    }

    return {
      headers: finalHeaders,
      rows: parsedRows
    };
  }

  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('Vehicle') && rowStr.includes('Ownership')) return i;
      }
    }
    return 0;
  }

  private safeVal(val: any): string {
    return (val !== undefined && val !== null) ? String(val).trim() : '';
  }

  private formatVal(val: any): string {
    if (val instanceof Date) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}`;
    }
    return this.safeVal(val);
  }

  // 占位
  protected adjustHeaders(h: string[]): string[] { return h; }
  protected validateRow(r: any, h: string[]): boolean { return true; }
  protected transformRow(r: any, h: string[]): any { return r; }
}