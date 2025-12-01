import { BaseFileParser } from '../base-parser';

// 人脸登记返回日志.xls 
export class FaceRegistrationParser extends BaseFileParser {
  private debugCount = 0;
  /**
   * 这个表是非规则的表，只能基于明确的列结构进行硬编码映射
   * 
   * 根据用户分析的物理结构 (12列)：
   * Index 0 (A): 空
   * Index 1 (B): 表头起始，但数据为空
   * Index 2 (C): 【账号数据】在此 ('2507)
   * Index 3 (D): 【房号数据】在此
   * Index 4 (E): 【名称数据】在此
   * Index 5 (F): 【操作类型】在此
   * Index 6 (G): 【绿云发送】在此
   * Index 7 (H): 【备注数据】在此 (H, I, J 合并，数据通常在 H)
   * Index 8 (I): 备注占位
   * Index 9 (J): 备注占位
   * Index 10 (K): 【创建人】在此
   * Index 11 (L): 【创建时间】在此
   */
  protected adjustHeaders(headers: string[]): string[] {
    // 1. 清洗原始表头
    // 使用 Array.from 消除数组空洞（把 <empty> 变成 undefined），防止 map 跳过
    const rawHeaders = Array.from(headers).map(h => 
      h ? String(h).replace(/[\r\n]+/g, ' ').trim() : ''
    );

    // 增加 h && 判断，防止 crash
    const findHeader = (keyword: string) => {
      return rawHeaders.find(h => h && h.includes(keyword)) || keyword;
    };

    // 2. 创建一个稀疏数组，精准对齐数据所在的列索引
    const mappedHeaders: string[] = [];

    // [Index 2] 账号 (数据在 C 列)
    mappedHeaders[2] = findHeader('账号');

    // [Index 3] 房号 (数据在 D 列)
    mappedHeaders[3] = findHeader('房号');

    // [Index 4] 名称
    mappedHeaders[4] = findHeader('名称');

    // [Index 5] 操作类型
    mappedHeaders[5] = findHeader('操作类型');

    // [Index 6] 绿云发送
    mappedHeaders[6] = findHeader('绿云发送');

    // [Index 7] 备注 (数据在 H 列)
    mappedHeaders[7] = findHeader('备注');

    // [Index 10] 创建人 (数据在 K 列)
    mappedHeaders[10] = findHeader('创建人');

    // [Index 11] 创建时间 (数据在 L 列)
    mappedHeaders[11] = findHeader('创建时间');

    // 调试打印，确认位置
    console.log('========== [FaceRegistration] Hardcoded Mapping ==========');
    mappedHeaders.forEach((h, i) => {
      if (h) console.log(`Index [${i}] -> "${h}"`);
    });

    // 使用类型断言返回
    return mappedHeaders as unknown as string[];
  }

  protected transformRow(row: any, headers: string[]): any {
    const newRow = super.transformRow(row, headers);

    // 调试日志：检查账号是否读取成功
    if (this.debugCount < 1) {
      console.log('\n========== [FaceRegistration] Row 0 Check ==========');
      // 获取 Index 2 的表头
      const accountKey = headers[2]; 
      if (accountKey) {
        console.log(`Target Key (Index 2): "${accountKey}"`);
        console.log(`Read Value: "${newRow[accountKey]}"`);
      }
      this.debugCount++;
    }

    // 数据清洗
    headers.forEach(header => {
      if (!header) return;

      let val = newRow[header];
      if (typeof val === 'string') {
        // 去除 Excel 强制文本的前置单引号
        if (val.startsWith("'")) {
          val = val.substring(1);
        }
        val = val.trim();
        newRow[header] = val;
      }
    });

    return newRow;
  }
}