// lib/db/data-masker.ts
/**
 * 数据脱敏工具类
 * 负责在数据写入数据库和diff对比时对敏感字段进行脱敏处理
 */

/**
 * 数据脱敏中心
 * 支持多种数据类型的脱敏：姓名、手机号、身份证号、邮箱地址
 */
export class DataMasker {
  /**
   * 需要脱敏的表和字段配置
   * key: 表名
   * value: 字段配置对象 { 字段名: 脱敏类型 }
   *
   * 脱敏类型说明：
   * - 'name': 姓名（自动识别中文/英文）
   * - 'phone': 手机号（保留前3后4位）
   * - 'id_card': 身份证号（保留前6后4位）
   * - 'email': 邮箱地址（保留前2位+域名）
   */
  private static readonly MASKING_CONFIG: Record<string, Record<string, 'name' | 'phone' | 'id_card' | 'email'>> = {
    'contract_creation_log': {
      'resident_name': 'name',  // 合同创建报表 - 客人姓名
    },
    'resident_id_document_list': {
      'resident_name': 'name',
      'id_number': 'id_card',
      'mobile': 'phone',
    },
    'tenant_analysis_report': {
      'resident_name': 'name',
    },
    'arrival_departure_weekly': {
      'resident_name': 'name',
      'mobile': 'phone',
      'id_number': 'id_card',
    },
    'viewing_appointment_list': {
      'resident_name': 'name',
      'mobile': 'phone',
    },
  };

  /**
   * 判断某个表的某个字段是否需要脱敏，并返回脱敏类型
   * @param tableName 表名
   * @param columnName 字段名
   * @returns 脱敏类型 ('name' | 'phone' | 'id_card' | 'email') 或 null（不需要脱敏）
   */
  private static shouldMask(tableName: string, columnName: string): string | null {
    const tableConfig = this.MASKING_CONFIG[tableName];
    if (!tableConfig) return null;
    return tableConfig[columnName] || null;
  }

  /**
   * 检测字符串是否包含中文字符
   * @param str 待检测字符串
   * @returns 是否包含中文字符
   */
  private static containsChinese(str: string): boolean {
    return /[\u4e00-\u9fa5]/.test(str);
  }

  /**
   * 中文姓名脱敏
   * 规则：
   * - 2个字：首字+*（张三 → 张*）
   * - 3个字：首字+*+尾字（张三丰 → 张*丰）
   * - 4+个字：首字+**+尾字（诸葛孔明 → 诸**明）
   * @param name 中文姓名
   * @returns 脱敏后的姓名
   */
  private static maskChineseName(name: string): string {
    const trimmed = name.trim();
    const len = trimmed.length;

    if (len <= 1) return trimmed;
    if (len === 2) return trimmed[0] + '*';
    if (len === 3) return trimmed[0] + '*' + trimmed[2];
    // 4个字及以上：首尾保留，中间全用*
    return trimmed[0] + '*'.repeat(len - 2) + trimmed[len - 1];
  }

  /**
   * 英文姓名脱敏
   * 规则：每个词保留首字母，其余用*替代
   * 例如：John → J***, John Smith → J*** S****
   * @param name 英文姓名
   * @returns 脱敏后的姓名
   */
  private static maskEnglishName(name: string): string {
    const trimmed = name.trim();
    const words = trimmed.split(/\s+/);

    const maskedWords = words.map(word => {
      if (word.length <= 1) return word;
      // 保留首字母，其余用*替代
      return word[0] + '*'.repeat(word.length - 1);
    });

    return maskedWords.join(' ');
  }

  /**
   * 姓名脱敏（自动识别中文/英文）
   * @param name 姓名
   * @returns 脱敏后的姓名
   */
  private static maskName(name: string): string {
    if (!name || typeof name !== 'string') return name;

    const trimmed = name.trim();

    // 如果已经包含 **，说明已经脱敏过了，直接返回
    if (trimmed.includes('**')) {
      return trimmed;
    }

    // 如果包含单个 *，可能是部分脱敏，也直接返回
    if (trimmed.includes('*')) {
      return trimmed;
    }

    // 根据是否包含中文字符选择脱敏策略
    if (this.containsChinese(trimmed)) {
      return this.maskChineseName(trimmed);
    } else {
      return this.maskEnglishName(trimmed);
    }
  }

  /**
   * 手机号脱敏
   * 规则：保留前3位和后4位，中间4位用*替代
   * 例如：13812345678 → 138****5678
   * @param phone 手机号
   * @returns 脱敏后的手机号
   */
  private static maskPhone(phone: string): string {
    const trimmed = phone.trim().replace(/\s+/g, ''); // 移除空格

    // 中国大陆手机号（11位）
    if (trimmed.length === 11 && /^\d{11}$/.test(trimmed)) {
      return trimmed.substring(0, 3) + '****' + trimmed.substring(7);
    }

    // 其他格式的手机号，保留首尾各2位
    if (trimmed.length > 4) {
      const maskLen = trimmed.length - 4;
      return trimmed.substring(0, 2) + '*'.repeat(maskLen) + trimmed.substring(trimmed.length - 2);
    }

    // 长度不够，不脱敏
    return trimmed;
  }

  /**
   * 身份证号脱敏
   * 规则：保留前6位（地区码）和后4位（校验码），中间8位用*替代
   * 例如：310101199001011234 → 310101********1234
   * @param idCard 身份证号
   * @returns 脱敏后的身份证号
   */
  private static maskIdCard(idCard: string): string {
    const trimmed = idCard.trim().replace(/\s+/g, ''); // 移除空格

    // 18位身份证
    if (trimmed.length === 18 && /^\d{17}[\dXx]$/.test(trimmed)) {
      return trimmed.substring(0, 6) + '********' + trimmed.substring(14);
    }

    // 15位身份证（旧版）
    if (trimmed.length === 15 && /^\d{15}$/.test(trimmed)) {
      return trimmed.substring(0, 6) + '*****' + trimmed.substring(11);
    }

    // 其他格式，保留首尾各4位
    if (trimmed.length > 8) {
      const maskLen = trimmed.length - 8;
      return trimmed.substring(0, 4) + '*'.repeat(maskLen) + trimmed.substring(trimmed.length - 4);
    }

    // 长度不够，不脱敏
    return trimmed;
  }

  /**
   * 邮箱脱敏
   * 规则：@前的用户名只保留前2位，@及域名完整保留
   * 例如：zhangsan@example.com → zh******@example.com
   * @param email 邮箱地址
   * @returns 脱敏后的邮箱
   */
  private static maskEmail(email: string): string {
    const trimmed = email.trim();

    // 简单的邮箱格式检查
    const emailRegex = /^([^@]+)@(.+)$/;
    const match = trimmed.match(emailRegex);

    if (!match) {
      // 不符合邮箱格式，返回原值
      return trimmed;
    }

    const [, username, domain] = match;

    if (username.length <= 1) {
        return '*' + '@' + domain;
    }
    // 用户名只保留前2位
    if (username.length <= 2) {
      return username[0] + '*' + '@' + domain;
    }

    return username.substring(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
  }

  /**
   * 对单个值进行脱敏处理（根据字段配置）
   * @param value 原始值
   * @param tableName 表名
   * @param columnName 字段名
   * @returns 脱敏后的值
   */
  static maskValue(value: any, tableName: string, columnName: string): any {
    // 如果值为空，直接返回
    if (value === null || value === undefined || value === '') {
      return value;
    }

    const maskType = this.shouldMask(tableName, columnName);

    // 如果该字段不需要脱敏，直接返回原值
    if (!maskType) {
      return value;
    }

    const strValue = String(value);
    let maskedValue: string;

    // 根据脱敏类型选择脱敏方法
    switch (maskType) {
      case 'name':
        maskedValue = this.maskName(strValue);
        break;
      case 'phone':
        maskedValue = this.maskPhone(strValue);
        break;
      case 'id_card':
        maskedValue = this.maskIdCard(strValue);
        break;
      case 'email':
        maskedValue = this.maskEmail(strValue);
        break;
      default:
        maskedValue = strValue;
    }

    // 如果值被修改了，记录日志
    if (maskedValue !== strValue) {
      console.log(`[DataMasker] 脱敏: ${tableName}.${columnName} "${strValue}" → "${maskedValue}"`);
    }

    return maskedValue;
  }
}
