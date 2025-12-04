"use client"

export function TableSandboxPanel() {

  return (
    <div className="space-y-6">
      {/* 标题区域 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">表格沙盘</h1>
          <p className="text-muted-foreground">
            编辑每一张表格的字段、备注，并建立表格字段之间的外键关联
          </p>
        </div>
      </div>
    </div>
  )
}