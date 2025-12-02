import * as XLSX from 'xlsx';
import { BaseFileParser, ParseResult } from '../base-parser';

// 公寓津贴当期期结余报表.xls ，这个表剧恶心，一行数据分几行显示
export class AllowanceBalanceParser extends BaseFileParser {
  // 定义最终想要输出的列名常量，确保各处拼写一致
  private readonly COL_ORDER = '订单号 NO.';
  private readonly COL_ROOM = '房号 Rmno';
  private readonly COL_NAME = '名称 Name';
  private readonly COL_TOTAL = '津贴总额 Allowance';
  private readonly COL_USE = '津贴使用额 Allowance Use';
  private readonly COL_BAL = '津贴当期余额 Allowance Balance';
  private readonly COL_CYCLE = '账期 Billing Cycle';
  private readonly COL_DATE = '津贴生效时间 Allowance Datetime';

  public parse(buffer: Buffer, fileName: string): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (rawData.length === 0) return { headers: [], rows: [] };

    const headerRowIndex = this.findHeaderRowIndex(rawData);
    const headers = this.adjustHeaders(rawData[headerRowIndex] as string[]);

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      range: headerRowIndex + 1,
      header: headers
    }) as any[];

    // --- 状态机合并 ---
    const mergedRows: any[] = [];
    let currentRecord: any = null;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const orderNo = row[this.COL_ORDER];

      if (orderNo && String(orderNo).trim() !== '') {
        // 新记录
        if (currentRecord) mergedRows.push(currentRecord);
        currentRecord = this.transformRow(row, headers);
      } else if (currentRecord) {
        // 补充行：合并数据
        const supplement = this.transformRow(row, headers);

        if (supplement[this.COL_NAME]) currentRecord[this.COL_NAME] = supplement[this.COL_NAME];
        if (supplement[this.COL_CYCLE]) currentRecord[this.COL_CYCLE] = supplement[this.COL_CYCLE];
        if (supplement[this.COL_DATE]) currentRecord[this.COL_DATE] = supplement[this.COL_DATE];

        // 余额合并：优先取非空值
        const supBal = supplement[this.COL_BAL];
        if (supBal && supBal !== '0.00' && supBal !== 0) {
          currentRecord[this.COL_BAL] = supBal;
        }
      }
    }
    if (currentRecord) mergedRows.push(currentRecord);

    // 不再依赖 filter，而是直接定义一个符合视觉要求的数组
    const finalHeaders = [
      this.COL_ORDER,
      this.COL_ROOM,
      this.COL_NAME,
      this.COL_TOTAL,
      this.COL_USE,
      this.COL_BAL,   // 余额在前
      this.COL_CYCLE, // 账期在后
      this.COL_DATE
    ];

    return {
      headers: finalHeaders,
      rows: mergedRows
    };
  }

  /**
   * 1. 物理映射：Index -> Key
   * 策略：不确定的列全部映射为 TEMP，防止覆盖，最后统一清洗
   */
  protected adjustHeaders(headers: string[]): string[] {
    const mappedHeaders: string[] = [];

    // 固定列 (C, E, F, G, H)
    mappedHeaders[2] = this.COL_ORDER;
    mappedHeaders[4] = this.COL_ROOM;
    mappedHeaders[5] = this.COL_NAME;
    mappedHeaders[6] = this.COL_TOTAL;
    mappedHeaders[7] = this.COL_USE;

    // 宽网捕获 (I, J, K) -> 余额
    mappedHeaders[8] = 'TEMP_BAL_1';
    mappedHeaders[9] = 'TEMP_BAL_2';
    mappedHeaders[10] = 'TEMP_BAL_3';

    // 账期 (L) -> 为了统一处理，也映射为 TEMP
    mappedHeaders[11] = 'TEMP_CYCLE';

    // 生效时间 (N) -> 为了统一处理，也映射为 TEMP
    mappedHeaders[13] = 'TEMP_DATE';

    return mappedHeaders as unknown as string[];
  }

  /**
   * 2. 数据转换：清洗 TEMP -> 正式字段
   */
  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    // 1. 合并余额
    const bal = newRow['TEMP_BAL_1'] || newRow['TEMP_BAL_2'] || newRow['TEMP_BAL_3'];
    newRow[this.COL_BAL] = bal !== undefined ? bal : '';

    // 2. 处理账期
    newRow[this.COL_CYCLE] = newRow['TEMP_CYCLE'] || '';

    // 3. 处理生效时间 (格式化)
    const rawDate = row['TEMP_DATE']; // 从原始 row 读，保留对象类型
    if (rawDate instanceof Date) {
      newRow[this.COL_DATE] = this.formatDateTimeSpecific(rawDate);
    } else {
      newRow[this.COL_DATE] = newRow['TEMP_DATE'] || '';
    }

    // 4. 清理 TEMP 垃圾
    delete newRow['TEMP_BAL_1']; delete newRow['TEMP_BAL_2']; delete newRow['TEMP_BAL_3'];
    delete newRow['TEMP_CYCLE'];
    delete newRow['TEMP_DATE'];

    return newRow;
  }

  // parse 内部已处理逻辑，此处返回 true 即可
  protected validateRow(row: any, headers: string[]): boolean {
    return true;
  }

  private formatDateTimeSpecific(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  }
}