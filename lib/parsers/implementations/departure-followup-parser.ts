import * as XLSX from 'xlsx';
import { BaseFileParser, ParseResult } from '../base-parser';

export class DepartureFollowupParser extends BaseFileParser {
  private debugCount = 0;

  // 这里的列名对应前端展示
  private readonly COL_ROOM = '房间号';
  private readonly COL_NAME = '姓名';
  private readonly COL_STA = 'STA';
  private readonly COL_SALESMAN = '销售员';
  private readonly COL_TYPE = '房型';
  private readonly COL_STATUS = '租户状态';
  private readonly COL_REMARK = '备注';
  private readonly COL_FOLLOW = '跟进日期';
  private readonly COL_AREA = '面积';
  private readonly COL_DEPOSIT = '押金';
  private readonly COL_CODE = '租户代码';
  private readonly COL_RENT = '实际租金';
  private readonly COL_START = '租赁开始时间';
  private readonly COL_END = '租赁结束时间';
  private readonly COL_MOVEOUT = '搬出时间';

  public parse(buffer: Buffer, fileName: string): ParseResult {
    console.log(`\n========== [DepartureFollowup] Precise Parsing: ${fileName} ==========`);

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 先检查 ref 是否存在
    if (!sheet['!ref']) {
      return { headers: [], rows: [] };
    }

    // 1. 确保读到 T 列 (Index 19) 以后
    // 使用 as string 断言，因为上面已经检查过非空了
    let range = XLSX.utils.decode_range(sheet['!ref'] as string);

    if (range.e.c < 20) {
      console.log(`[Range] Extending sheet range from Index ${range.e.c} to 20 (Col U).`);
      range.e.c = 20; // 强制开到 U 列
      sheet['!ref'] = XLSX.utils.encode_range(range);
    }

    // 2. 找表头行
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const headerRowIndex = this.findHeaderRowIndex(rawData);

    // 3. 定义输出顺序
    const displayHeaders = [
      this.COL_ROOM, this.COL_TYPE, this.COL_STATUS, this.COL_REMARK, 
      this.COL_FOLLOW, this.COL_AREA, this.COL_DEPOSIT, this.COL_CODE, 
      this.COL_STA, this.COL_NAME, this.COL_RENT, this.COL_START, 
      this.COL_END, this.COL_MOVEOUT, this.COL_SALESMAN
    ];

    const parsedRows: any[] = [];
    let currentRecord: any = null;

    // 更新 range 变量
    range = XLSX.utils.decode_range(sheet['!ref'] as string);

    // 4. 直接坐标遍历
    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      // 读取指定列 (Row r, Col c)
      const getVal = (colIndex: number) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: r, c: colIndex })];
        if (!cell) return '';
        if (cell.t === 'd' && cell.v instanceof Date) {
           const pad = (n: number) => n.toString().padStart(2, '0');
           return `${cell.v.getFullYear()}-${pad(cell.v.getMonth() + 1)}-${pad(cell.v.getDate())}`;
        }
        return String(cell.v || '').trim();
      };

      // -----------------------------------------------------------
      // 垃圾行过滤 (Garbage Collection)
      // 在尝试合并之前，先检查这一行是不是页脚或打印信息
      // 检查关键列 (C, D, E, F...) 是否包含 "Page", "页" 等关键字
      // -----------------------------------------------------------
      const checkCols = [2, 3, 4, 5, 11, 12, 19]; // 抽查房号、状态、STA、Salesman 列
      let isGarbage = false;
      for (const idx of checkCols) {
        const val = getVal(idx).toLowerCase();
        // 增加更多可能的页脚特征词
        if (val.includes('page') || val.includes('页码') || val.includes('打印时间')) {
          isGarbage = true;
          break;
        }
      }

      if (isGarbage) {
        // console.log(`[Skipped Garbage Row ${r+1}] Found keyword.`);
        continue; // 直接跳过，不合并，不处理
      }

      // 检查 C 列 (Index 2) 是否有房间号
      const roomVal = getVal(2);

      // 判断逻辑
      let isMainRow = false;
      if (roomVal && roomVal !== '') {
        const upper = roomVal.toUpperCase();
        if (!upper.includes('NULL') && !upper.includes('未跟进') && upper !== 'UNIT') {
          isMainRow = true;
        }
      }

      if (isMainRow) {
        // ========== 发现主行 ==========
        if (currentRecord) parsedRows.push(currentRecord);
        currentRecord = {};

        // 严格按照物理索引读取
        currentRecord[this.COL_ROOM] = roomVal;       // C (2)
        currentRecord[this.COL_TYPE] = getVal(3);     // D (3)
        currentRecord[this.COL_STATUS] = getVal(4);   // E (4)
        currentRecord[this.COL_REMARK] = getVal(5);   // F (5)
        currentRecord[this.COL_FOLLOW] = getVal(6);   // G (6)
        currentRecord[this.COL_AREA] = getVal(7);     // H (7)
        // I (8) 是空的
        currentRecord[this.COL_DEPOSIT] = getVal(9);  // J (9)
        currentRecord[this.COL_CODE] = getVal(10);    // K (10)

        // L/M (11/12) 是 STA，尝试读取 (防止没分行的情况)
        currentRecord[this.COL_STA] = getVal(11) || getVal(12);

        currentRecord[this.COL_NAME] = getVal(13);    // N (13)
        // O (14) 是空的
        currentRecord[this.COL_RENT] = getVal(15);    // P (15)
        currentRecord[this.COL_START] = getVal(16);   // Q (16)
        currentRecord[this.COL_END] = getVal(17);     // R (17)
        currentRecord[this.COL_MOVEOUT] = getVal(18); // S (18)

        // T (19) 是 Salesman，通常在下一行，先尝试读取
        currentRecord[this.COL_SALESMAN] = getVal(19);

        if (this.debugCount < 2) {
          console.log(`\n[Row ${r+1}] Main Record: ${roomVal}`);
        }
      } else if (currentRecord) {
        // 只有当前面已经有一个主记录时，才尝试合并
        // 1. 读取 STA (L列 Index 11 或 M列 Index 12)
        const staVal = getVal(11) || getVal(12);
        if (staVal) {
          currentRecord[this.COL_STA] = staVal;
          if (this.debugCount < 2) console.log(`  -> Merged STA: ${staVal}`);
        }

        // 2. 读取 Salesman (T列 Index 19)
        const salesVal = getVal(19);
        if (salesVal) {
          currentRecord[this.COL_SALESMAN] = salesVal;
          if (this.debugCount < 2) console.log(`  -> Merged Salesman: ${salesVal}`);
        }
      }
      this.debugCount++;
    }

    // 提交最后一条记录
    if (currentRecord) parsedRows.push(currentRecord);

    return {
      headers: displayHeaders,
      rows: parsedRows
    };
  }

  protected findHeaderRowIndex(data: any[][]): number {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c).trim()).join(' ');
        if (rowStr.includes('Unit') && (rowStr.includes('Follow') || rowStr.includes('Remark'))) {
          return i;
        }
      }
    }
    return 0;
  }

  // 占位方法
  protected adjustHeaders(h: string[]): string[] { return h; }
  protected validateRow(r: any, h: string[]): boolean { return true; }
  protected transformRow(r: any, h: string[]): any { return r; }
}