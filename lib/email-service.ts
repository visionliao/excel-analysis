import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * 发送错误报警邮件
 */
export async function sendErrorAlert(errorMsg: string, timestamp: string) {
  const subject = `[ETL 报警] 数据同步失败 - ${timestamp}`;
  const html = `
    <h2 style="color: #dc2626;">❌ 数据同步流程异常中止</h2>
    <p><strong>时间戳:</strong> ${timestamp}</p>
    <div style="background-color: #fef2f2; padding: 15px; border: 1px solid #f87171; border-radius: 5px; color: #991b1b;">
      <h3>错误详情:</h3>
      <pre style="white-space: pre-wrap; font-family: monospace;">${errorMsg}</pre>
    </div>
    <p style="margin-top: 20px;">请立即检查服务器日志或源文件格式。</p>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject,
    html,
  });
}

/**
 * 发送成功报告邮件 (包含策略说明)
 */
export async function sendSuccessReport(timestamp: string, details: any[], strategy: string) {
  const subject = `[ETL 通知] 数据同步完成 - ${timestamp}`;
  
  // 策略显示文案配置
  const isIncremental = strategy === 'incremental';
  const strategyLabel = isIncremental ? '增量更新 (智能比对)' : '全量覆盖 (DROP重建)';
  const strategyColor = isIncremental ? '#2563eb' : '#d97706'; // 蓝 vs 橙
  const strategyBg = isIncremental ? '#eff6ff' : '#fffbeb';

  // 生成表格行的 HTML
  const rowsHtml = details.map((item: any) => {
    const formatIds = (ids: number[]) => {
      if (!ids || ids.length === 0) return '-';
      if (ids.length > 10) return `${ids.slice(0, 10).join(', ')} ... (共${ids.length}条)`;
      return ids.join(', ');
    };

    const insertInfo = item.insertCount > 0 
        ? `<div style="color: #16a34a; font-weight: bold;">新增 ${item.insertCount} 行</div><div style="font-size:11px;color:#666;word-break:break-all;">IDs: ${formatIds(item.insertIds)}</div>` 
        : '<span style="color:#9ca3af;">-</span>';
    
    const updateInfo = item.updateCount > 0 
        ? `<div style="color: #2563eb; font-weight: bold;">更新 ${item.updateCount} 行</div><div style="font-size:11px;color:#666;word-break:break-all;">IDs: ${formatIds(item.updateIds)}</div>` 
        : '<span style="color:#9ca3af;">-</span>';

    // 有变动的行高亮显示
    const hasChange = item.insertCount > 0 || item.updateCount > 0;
    const rowBg = hasChange ? 'background-color: #f9fafb;' : '';
    const rowBorder = 'border-bottom: 1px solid #e5e7eb;';

    return `
      <tr style="${rowBg} ${rowBorder}">
        <td style="padding: 10px; color: #1f2937;"><strong>${item.tableName}</strong></td>
        <td style="padding: 10px;">${insertInfo}</td>
        <td style="padding: 10px;">${updateInfo}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h2 style="color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 10px;">✅ 数据同步成功</h2>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 5px 0;"><strong>快照版本:</strong> ${timestamp}</p>
        <p style="margin: 5px 0;">
           <strong>同步策略:</strong> 
           <span style="display:inline-block; background-color:${strategyBg}; color:${strategyColor}; padding: 2px 8px; border-radius: 4px; font-weight: bold; border: 1px solid ${strategyColor};">
             ${strategyLabel}
           </span>
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background-color: #e5e7eb;">
            <th style="padding: 10px; text-align: left; width: 30%;">表名</th>
            <th style="padding: 10px; text-align: left; width: 35%;">新增详情</th>
            <th style="padding: 10px; text-align: left; width: 35%;">更新详情</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      
      <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
        此邮件由 ETL 自动化机器人发送，请勿直接回复。
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject,
    html,
  });
}