// lib/parsers/factory.ts
import { BaseFileParser } from './base-parser';
import { MonthlyRRParser } from './implementations/monthly-rr-parser';
import { DepositDetailParser } from './implementations/deposit-detail-parser';
import { PerformanceTrackingParser } from './implementations/performance-tracking-parser';

// 默认解析器 (使用基类逻辑)
class DefaultParser extends BaseFileParser {}

export class ParserFactory {
  private static parsers: Record<string, BaseFileParser> = {
    // 注册映射关系： table_name -> Parser Instance
    'monthly_rr_summary': new MonthlyRRParser(),
    'deposit_collection_detail': new DepositDetailParser(),
    'performance_tracking': new PerformanceTrackingParser(),
    
    // 在这里继续注册更多...
    // 'room_master_list': new RoomMasterParser(),
  };

  private static defaultParser = new DefaultParser();

  public static getParser(tableName: string): BaseFileParser {
    return this.parsers[tableName] || this.defaultParser;
  }
}