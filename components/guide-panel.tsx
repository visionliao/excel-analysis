"use client"

export function GuidePanel() {
  return (
    <div className="w-full max-w-none xl:max-w-7xl 2xl:max-w-[90rem] mx-auto">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-foreground">使用说明</h2>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">了解如何使用本工具</p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <section className="border border-border rounded-lg p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-medium text-foreground mb-3">1. 表格处理</h3>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            在「表格处理」页面，您可以通过拖拽或点击选择按钮上传 Excel (.xlsx, .xls) 或 CSV 文件。
            支持批量选择多个文件或整个文件夹。
          </p>
        </section>

        <section className="border border-border rounded-lg p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-medium text-foreground mb-3">2. 表格分析</h3>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            在「表格分析」页面，您可以查看已选择的文件，并配置 PostgreSQL 数据库连接地址，
            将处理后的数据导出到数据库中。
          </p>
        </section>

        <section className="border border-border rounded-lg p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-medium text-foreground mb-3">3. 支持的文件格式</h3>
          <ul className="text-muted-foreground list-disc list-inside space-y-1 text-sm sm:text-base">
            <li>.xlsx - Excel 2007+ 格式</li>
            <li>.xls - Excel 97-2003 格式</li>
            <li>.csv - 逗号分隔值格式</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
