import * as XLSX from 'xlsx';
import { BaseFileParser, ParseResult } from '../base-parser';

// Resident Lease Expirations.xls (居民租约到期统计表)
export class LeaseExpirationParser extends BaseFileParser {

  // 定义常量，防止手抖写错 Key
  private readonly COL_ROOM = '房间号';
  private readonly COL_SALESMAN = '销售员';

  /**
   * 重写 parse 方法
   * 目的：
   * 1. 强制扩展读取范围 (防止 P 列被截断)
   * 2. 实现【多行合并逻辑】：销售员数据在有效数据行的下一行
   */
  public parse(buffer: Buffer, fileName: string): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 1. 【强制扩展范围】
    // 确保 P 列 (Index 15) 在读取范围内
    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      if (range.e.c < 20) {
        range.e.c = 20;
        sheet['!ref'] = XLSX.utils.encode_range(range);
      }
    }

    // 2. 获取原始数据
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (rawData.length === 0) return { headers: [], rows: [] };

    // 3. 找表头
    const headerRowIndex = this.findHeaderRowIndex(rawData);

    // 4. 获取映射表头
    const headers = this.adjustHeaders(rawData[headerRowIndex] as string[]);

    // 5. 读取所有数据行
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      range: headerRowIndex + 1,
      header: headers
    }) as any[];

    // ============================================================
    // 多行合并状态机
    // ============================================================
    const mergedRows: any[] = [];
    let currentRecord: any = null;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const roomVal = row[this.COL_ROOM];

      // 判断是否为有效的主数据行
      // 排除 "NULL 未填写" 或 "Unit" 这种分组头
      let isMainRow = false;
      if (roomVal && String(roomVal).trim() !== '') {
        const roomStr = String(roomVal).toUpperCase();
        if (!roomStr.includes('NULL') && !roomStr.includes('未填写') && roomStr !== 'UNIT') {
          isMainRow = true;
        }
      }

      if (isMainRow) {
        // --- 发现新记录 ---
        // 1. 保存上一条
        if (currentRecord) {
          mergedRows.push(currentRecord);
        }
        // 2. 创建新记录 (并做基础清洗)
        currentRecord = this.transformRow(row, headers);

      } else if (currentRecord) {
        // --- 发现补充行 (没有房间号，但在记录周期内) ---
        // 检查这一行有没有销售员数据
        const salesmanVal = row[this.COL_SALESMAN];
        
        if (salesmanVal && String(salesmanVal).trim() !== '') {
          // console.log(`[Merge] Found Salesman "${salesmanVal}" for Room ${currentRecord[this.COL_ROOM]}`);
          currentRecord[this.COL_SALESMAN] = String(salesmanVal).trim();
        }
      }
    }

    // 保存最后一条
    if (currentRecord) {
      mergedRows.push(currentRecord);
    }

    return {
      headers: headers.filter(h => h && h.trim() !== ''),
      rows: mergedRows
    };
  }

  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('Unit') && rowStr.includes('Resident')) {
          return i;
        }
      }
    }
    return 0;
  }

  /**
   * 硬编码映射 (基于 Turn 14 截图)
   * 0,1 空
   * 2=房间号 ... 15=销售员
   */
  protected adjustHeaders(headers: string[]): string[] {
    const mappedHeaders: string[] = [];

    // [Index 0, 1] A, B 列为空，跳过
    mappedHeaders[2] = this.COL_ROOM;
    mappedHeaders[3] = '房型代码';
    mappedHeaders[4] = '租户状态';
    mappedHeaders[5] = '提议过期日';
    mappedHeaders[6] = '市场租金';
    mappedHeaders[7] = '面积';
    mappedHeaders[8] = '参考租金';
    mappedHeaders[9] = '租户代码';
    mappedHeaders[10] = '姓名';
    mappedHeaders[11] = '实际租金';
    mappedHeaders[12] = '租赁开始时间';
    mappedHeaders[13] = '租赁结束时间';
    mappedHeaders[14] = '搬出时间';
    // [Index 15] P列: 销售员
    mappedHeaders[15] = this.COL_SALESMAN;

    return mappedHeaders as unknown as string[];
  }

  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    // 强制填充空值，防止 key 丢失
    headers.forEach(key => {
      if (key && newRow[key] === undefined) {
        newRow[key] = '';
      }
    });

    return newRow;
  }

  // validateRow 在 parse 内部逻辑中被替代了
  protected validateRow(row: any, headers: string[]): boolean { return true; }
}