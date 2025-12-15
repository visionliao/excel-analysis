// lib/parsers/factory.ts
import { BaseFileParser } from './base-parser';
import { MonthlyRRParser } from './implementations/monthly-rr-parser';
import { DepositDetailParser } from './implementations/deposit-detail-parser';
import { PerformanceTrackingParser } from './implementations/performance-tracking-parser';
import { FaceRegistrationParser } from './implementations/face-registration-parser';
import { VehicleDataESGParser } from './implementations/vehicle-data-esg-parser';
import { PostingSummaryTaxSepParser } from './implementations/posting-summary-tax-sep-parser';
import { DailyDepartureParser } from './implementations/daily-departure-parser';
import { EnergyConsumptionStatsParser } from './implementations/energy-consumption-parser';
import { ArrivalDepartureParser } from './implementations/arrival-departure-parser';
import { AllowanceBalanceParser } from './implementations/allowance-balance-parser';
import { TenantDemographicsParser } from './implementations/tenant-demographics-parser';
import { ResidentIdDocumentParser } from './implementations/resident-id-document-parser';
import { StatisticsGeneralParser } from './implementations/statistics-general-parser';
import { LeaseExpirationParser } from './implementations/lease-expiration-parser';
import { ResidentLedgerParser } from './implementations/resident-ledger-parser';
import { AccountAgingParser } from './implementations/account-aging-parser';
import { DepartureFollowupParser } from './implementations/departure-followup-parser';
import { DepositBalanceRealtimeParser } from './implementations/deposit-balance-parser';
import { APGAssetDataParser } from './implementations/apg-asset-data-parser';
import { ArAgingResidentParser } from './implementations/ar-aging-resident-parser';
import { PostingDetailFeeCodeParser } from './implementations/posting-detail-fee-code-parser';
import { PostingDetailTaxSepParser } from './implementations/posting-detail-tax-sep-parser';
import { WorkOrderParser } from './implementations/work-order-parser';
import { ContractUnsignedParser } from './implementations/contract-unsigned-active-parser';
import { BillDetailResidentParser } from './implementations/bill-detail-resident-parser';
import { BillAllowanceDeductionParser } from './implementations/bill-allowance-deduction-parser';

// 默认解析器 (使用基类逻辑)
class DefaultParser extends BaseFileParser {}

export class ParserFactory {
  private static parsers: Record<string, BaseFileParser> = {
    // 注册映射关系： table_name -> Parser Instance
    'monthly_rr_summary': new MonthlyRRParser(),
    'deposit_collection_detail': new DepositDetailParser(),
    'performance_tracking': new PerformanceTrackingParser(),
    'face_registration': new FaceRegistrationParser(),
    'vehicle_data_esg': new VehicleDataESGParser(),
    'posting_summary_tax_sep': new PostingSummaryTaxSepParser(),
    'daily_departure_report': new DailyDepartureParser(),
    'energy_consumption_stats': new EnergyConsumptionStatsParser(),
    'arrival_departure_weekly': new ArrivalDepartureParser(),
    'allowance_balance_current': new AllowanceBalanceParser(),
    'tenant_profile_demographics': new TenantDemographicsParser(),
    'resident_id_document_list': new ResidentIdDocumentParser(),
    'statistics_general': new StatisticsGeneralParser(),
    'lease_expiration_schedule': new LeaseExpirationParser(),
    'resident_ledger_report': new ResidentLedgerParser(),
    'account_aging_analysis': new AccountAgingParser(),
    'departure_followup_log': new DepartureFollowupParser(),
    'deposit_balance_realtime': new DepositBalanceRealtimeParser(),
    'apg_asset_data': new APGAssetDataParser(),
    'ar_aging_resident': new ArAgingResidentParser(),
    'posting_detail_fee_code': new PostingDetailFeeCodeParser(),
    'posting_detail_tax_sep': new PostingDetailTaxSepParser(),
    'work_orders': new WorkOrderParser(),
    'contract_unsigned_active': new ContractUnsignedParser(),
    'bill_detail_resident': new BillDetailResidentParser(),
    'bill_allowance_deduction': new BillAllowanceDeductionParser(),

    // 在这里继续注册更多...
    // 'room_master_list': new RoomMasterParser(),
  };

  private static defaultParser = new DefaultParser();

  public static getParser(tableName: string): BaseFileParser {
    return this.parsers[tableName] || this.defaultParser;
  }
}