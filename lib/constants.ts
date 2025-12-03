// lib/constants.ts
export const TABLE_MAPPING: Record<string, string> = {
  // 财务模块：押金与应收 (Finance - Deposits & AR)
  '长租押金实时余额表': 'deposit_balance_realtime',
  '长租押金收款明细表': 'deposit_collection_detail',
  '长租应收账龄报表（住客）': 'ar_aging_resident',
  'AR财务应收': 'ar_receivable_summary',
  'PP财务预收': 'pp_prepayment_summary',
  '消费账户账龄分析报表': 'account_aging_analysis',

  // 财务模块：账单与入账 (Finance - Billing & Posting)
  '租金账册收入确认表(住客)': 'rent_revenue_recognition',
  '公寓账单明细表（住客）': 'bill_detail_resident',
  '公寓账单津贴抵扣': 'bill_allowance_deduction',
  '公寓津贴当期期结余报表': 'allowance_balance_current',
  '前台入账明细表(可选费用码)': 'posting_detail_fee_code',
  '前台入账明细表（区间价税分离）': 'posting_detail_tax_sep',
  '前台入账账号汇总（区间价税分离）': 'posting_summary_tax_sep',
  '台账报表（住客）': 'resident_ledger_report',

  // 租赁与租客管理 (Leasing & Tenant)
  '合同创建报表': 'contract_creation_log',
  '在住未送签合同列表': 'contract_unsigned_active',
  '公寓租客续租次数报表': 'tenant_renewal_stats',
  '租客分析报表': 'tenant_analysis_report',
  '租客基础画像  年龄-性别(门店）': 'tenant_profile_demographics',
  'Resident Lease Expirations': 'lease_expiration_schedule',
  '在住客人生日报表': 'resident_birthday_list',
  '人脸登记返回日志': 'face_registration',
  
  // 前台运营与服务 (Front Desk & Operations)
  '预约带看列表': 'viewing_appointment_list',
  '未来一周内抵离客人': 'arrival_departure_weekly',
  '指定日期离店客人报表': 'daily_departure_report',
  '指定区间Departure跟进报告': 'departure_followup_log',
  '指定日期在住客人证件号报表':	'resident_id_document_list',
  
  // 房源与资产 (Property & Assets)
  '房号表': 'room_master_list',
  '当前维修房报表':	'maintenance_room_current',
  '能耗统计表':	'energy_consumption_stats',
  'APG Asset data':	'apg_asset_data',
  'Vehicle Level Data-ESG':	'vehicle_data_esg',

  // 综合统计与分析 (Statistics & Performance)
  'Monthly RR Summary':	'monthly_rr_summary',
  'Performance Tracking': 'performance_tracking',
  'Statstics': 'statistics_general',

  // other
  'spark_room_details': 'room_details'
};

// 用于从文件名提取基础名称的正则
// 匹配规则：去除结尾的日期 (24-10, 2024-11, etc.) 和扩展名
export function getBaseTableName(fileName: string): string {
  // 1. 去掉扩展名
  let name = fileName.replace(/\.(xlsx|xls|csv)$/i, '');

  // 2. 去掉常见的日期后缀模式，例如 "24-10", "2025-01", "25-2", "(1)"
  name = name.replace(/[\(\s_-]*\d{2,4}[-\.]\d{1,2}[\)\s]*$/, '');

  // 3. 去掉纯年份/数字后缀 (如 24, 25, 2024, 2025)
  name = name.replace(/[\s_-]*\d{2,4}$/, '');

  // 4. 去掉 (1) 这种副本标记
  name = name.replace(/\s*\(\d+\)$/, '');

  return name.trim();
}