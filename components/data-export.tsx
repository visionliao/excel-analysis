"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileText } from "lucide-react"
import type { FileItem } from "@/components/excel-data-analysis"

interface TableExportPanelProps {
  files: FileItem[]
}

export function TableExportPanel({ files }: TableExportPanelProps) {
  const [postgresUrl, setPostgresUrl] = useState(process.env.NEXT_PUBLIC_POSTGRES_URL || "")

  const handleExportData = useCallback(() => {
    console.log("导出数据", { postgresUrl, files })
  }, [postgresUrl, files])

  return (
    <div className="w-full max-w-none xl:max-w-7xl 2xl:max-w-[90rem] mx-auto">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-foreground">导出数据</h2>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">将已选择的表格数据根据沙盘规则导出到数据库</p>
      </div>

      {/* Show selected files summary */}
      {files.length > 0 ? (
        <div className="mb-6">
          <h3 className="text-base font-medium text-foreground mb-3">当前已选择 {files.length} 个文件</h3>
          <div className="border border-border rounded-lg divide-y divide-border max-h-40 overflow-auto">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
                <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-foreground truncate min-w-0">{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-6 sm:p-8 text-center mb-6">
          <p className="text-muted-foreground text-sm sm:text-base">请先在「表格处理」中选择文件</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <Input
          value={postgresUrl}
          onChange={(e) => setPostgresUrl(e.target.value)}
          placeholder="请输入 PostgreSQL 数据库连接地址"
          className="flex-1 w-full"
        />
        <Button onClick={handleExportData} disabled={files.length === 0} className="w-full sm:w-auto shrink-0">
          导出数据
        </Button>
      </div>
    </div>
  )
}
