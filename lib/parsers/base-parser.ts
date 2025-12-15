// lib/parsers/base-parser.ts
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';

export interface ParseResult {
  headers: string[];
  rows: any[];
}

export abstract class BaseFileParser {
  // 上下文对象，用于跨表数据引用
  public context: any = {};

  public setContext(ctx: any) {
    this.context = ctx;
  }

  public parse(buffer: Buffer, fileName: string): ParseResult {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      dateNF: 'yyyy-mm-dd',
      cellText: false,
      cellFormula: false,
      sheetStubs: true,
      dense: true
    });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 1. 获取原始的二维数组
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    return this.processRawData(rawData);
  }

  protected processRawData(rawData: any[][]): ParseResult {
    if (!rawData || rawData.length === 0) return { headers: [], rows: [] };

    // 2. 找到表头所在行 (调用现有的 protected 方法)
    const headerRowIndex = this.findHeaderRowIndex(rawData);

    // 3. 提取原始表头
    let headers = this.extractHeaders(rawData[headerRowIndex]);

    // Hook，允许子类 增/删/改/重排 表头
    // 这一步非常重要，因为 sheet_to_json 依赖 headers 的长度来决定读取多少列数据
    headers = this.adjustHeaders(headers); 

    // 4. 提取数据行
    const validRows = rawData
      .slice(headerRowIndex + 1) // 跳过表头行及之前的所有行
      .map(rowArr => this.mapRowArrayToObject(rowArr, headers)) // 映射为对象
      .filter(row => this.validateRow(row, headers)) // 验证
      .map(row => this.transformRow(row, headers)); // 转换

    return {
      headers: headers.filter(h => h && h.trim() !== ''),
      rows: validRows
    };
  }

  // 将数组行映射为对象行 (模拟 sheet_to_json 的 header 模式)
  private mapRowArrayToObject(rowArr: any[], headers: string[]): any {
    const rowObj: any = {};
    headers.forEach((header, colIndex) => {
      // 只有当 header 存在时才映射
      if (header) {
        rowObj[header] = rowArr[colIndex];
      }
    });
    return rowObj;
  }

  // -------------------------------------------------------------------------
  // 专门用于处理那张坏表解释失败的表格(小程序中台导出的工单表，数据室损坏的，会抛出异常：Error: Cannot create a string longer than 0x1fffffe8 characters ，需要特殊处理)
  // -------------------------------------------------------------------------
  public async parseWithFallback(buffer: Buffer, fileName: string): Promise<ParseResult> {
    try {
      // 优先调用同步的 parse (复用子类的多态行为)
      return this.parse(buffer, fileName);
    } catch (error: any) {
      // 只有当 SheetJS 崩溃，且是 xlsx 文件时，进入 ExcelJS 流程
      if (fileName.toLowerCase().endsWith('.xlsx')) {
        console.warn(`[BaseFileParser] Standard parse failed, trying ExcelJS fallback. Error: ${error.message}`);
        try {
          // 使用 ExcelJS 读取数据，得到二维数组
          const rawData = await this.readWithExcelJS(buffer);
          // 再次复用公共处理逻辑 (这样子类的 adjustHeaders 等 Hook 依然生效)
          return this.processRawData(rawData);
        } catch (fbError) {
          console.error('[BaseFileParser] Fallback failed', fbError);
          throw error; // 抛出原始错误
        }
      }
      throw error;
    }
  }

  // ExcelJS 读取器 (Private)
  private async readWithExcelJS(buffer: Buffer): Promise<any[][]> {
    const workbook = new ExcelJS.Workbook();

    try {
      // 第一次尝试：直接加载
      await workbook.xlsx.load(buffer as any);
    } catch (error: any) {
      console.warn(`[ExcelJS] Standard load failed: ${error.message}. Attempting to sanitize file structure...`);
      // 如果报错包含 'company' 或其他元数据错误，说明 docProps 损坏
      // 启动“外科手术”模式
      try {
        const sanitizedBuffer = this.sanitizeXlsx(buffer);
        // 第二次尝试：加载修复后的 Buffer
        await workbook.xlsx.load(sanitizedBuffer as any);
      } catch (retryError: any) {
        console.error(`[ExcelJS] Sanitize and retry also failed: ${retryError.message}`);
        throw retryError; // 彻底没救了
      }
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const data: any[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cleanRow = rowValues.map((val: any) => {
        if (val && typeof val === 'object') {
           if (val instanceof Date) return val;
           if (val.richText) return val.richText.map((t: any) => t.text).join('');
           if (val.text) return val.text;
           if (val.result !== undefined) return val.result;
           return '';
        }
        return val;
      });
      data.push(cleanRow);
    });
    return data;
  }

  // XLSX 外科手术工具 (删除导致崩溃的元数据文件)
  private sanitizeXlsx(buffer: Buffer): Buffer {
    try {
      const zip = new AdmZip(buffer);

      // 1. 删除文档核心属性 (修复 'company', 'creator' 等 undefined 报错)
      zip.deleteFile('docProps/core.xml');
      zip.deleteFile('docProps/app.xml');
      zip.deleteFile('docProps/custom.xml');

      // 2. 删除计算链 (修复部分因为公式计算导致的加载卡死)
      // 如果文件很大，calcChain.xml 可能会很大且容易出错，删掉它只影响公式缓存，不影响数据值
      const entries = zip.getEntries();
      const calcChainEntry = entries.find(e => e.entryName.includes('calcChain.xml'));
      if (calcChainEntry) {
        zip.deleteFile(calcChainEntry);
      }

      // 返回修复后的 Buffer
      return zip.toBuffer();
    } catch (e) {
      console.error('Failed to sanitize XLSX zip structure', e);
      // 如果解压都失败了，就原样返回，让外层报错
      return buffer;
    }
  }

  // Hook: 允许子类修改表头结构 (默认不修改)
  protected adjustHeaders(headers: string[]): string[] {
    return headers;
  }

  protected findHeaderRowIndex(data: any[][]): number {
     let headerRowIndex = 0;
     let maxScore = -1;
     const keywords = ['房号', 'Room', '姓名', 'Name', '金额', 'Amount', '日期', 'Date', '单号', 'No.', 'Summary'];
 
     for (let i = 0; i < Math.min(20, data.length); i++) {
       const row = data[i];
       if (!Array.isArray(row) || row.length === 0) continue;
       let score = 0;
       const filledCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
       score += filledCells.length;
       filledCells.forEach(cell => {
         if (keywords.some(k => String(cell).includes(k))) score += 5;
       });
       if (score > maxScore) {
         maxScore = score;
         headerRowIndex = i;
       }
     }
     return maxScore < 2 ? 0 : headerRowIndex;
  }

  // 提取并清洗表头
  protected extractHeaders(row: any[]): string[] {
    if (!row) return [];
    return row.map(cell => cell ? String(cell).trim() : '');
  }

  // 验证行数据是否有效，增加“数据密度”检查，过滤页脚、汇总行、分页符
  protected validateRow(row: any, headers: string[]): boolean {
    if (!row || Object.keys(row).length === 0) return false;

    // 统计这一行在“表头范围内”的有效数据个数
    let validCellCount = 0;
    headers.forEach(header => {
      // 这里的 header 是在 parse 流程中确定的有效表头
      const val = row[header];
      // 判定有效值：非 null、非 undefined、非空字符串
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        validCellCount++;
      }
    });

    // 规则 1: 绝对数量底线
    // 至少要有 2 个有效值，否则大概率是垃圾数据
    if (validCellCount < 2) return false;

    // 规则 2: 相对密度底线
    // 如果一行数据的有效列数，连表头总列数的一半都不到，视为无效行
    const densityThreshold = 0.5; // 50% 阈值
    if (validCellCount < (headers.length * densityThreshold)) {
      // 可以在这里加个 debug log 看看过滤了什么
      // console.log(`Filtered low-density row: ${JSON.stringify(row)}`);
      return false;
    }

    return true;
  }

  // 转换行数据 (例如日期格式化)
  protected transformRow(row: any, headers: string[]): any {
    const newRow: any = {};
    headers.forEach(header => {
        // 如果header为空字符串，跳过
       if (!header) return; 
       let val = row[header];
       if (val instanceof Date) {
         val = this.formatDate(val);
       }
       newRow[header] = val;
    });
    return newRow;
  }

  // 工具方法：格式化日期
  protected formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    // if (hours === '00' && minutes === '00' && seconds === '00') {
    //   return `${year}-${month}-${day}`;
    // }
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}