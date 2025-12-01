"use client"

import React, { useState } from 'react'
import { 
  Table as TableIcon, Database, FileSpreadsheet, ChevronDown, ChevronRight, 
  LayoutList, CheckCircle2, AlertCircle, AlertTriangle 
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// 更新接口定义
export interface GroupedTableData {
  tableName: string
  originalBaseName: string
  headers: string[]
  rows: any[]
  sourceFiles: string[]
  totalRows: number
  parseErrors?: string[]
}

interface SmartDataDisplayProps {
  groupedData: GroupedTableData[]
}

export function SmartDataDisplay({ groupedData }: SmartDataDisplayProps) {
  if (!groupedData || groupedData.length === 0) return null;

  const totalStructures = groupedData.length; // 最终生成的表结构数量
  const totalFiles = groupedData.reduce((acc, item) => acc + item.sourceFiles.length, 0); // 总共处理的文件数量
  const totalErrors = groupedData.reduce((acc, item) => acc + (item.parseErrors?.length || 0), 0); // 总错误数

  return (
    <div className="space-y-6 mt-8">
      <div>
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">解析结果概览</h2>
        </div>
        {/* 详细描述行 */}
        <p className="text-muted-foreground text-sm ml-9">
          总共解析 <span className="font-bold text-foreground">{totalFiles}</span> 个来源表格，
          经过自动合并处理，
          最终生成 <span className="font-bold text-foreground">{totalStructures}</span> 张表结构数据。
          {totalErrors > 0 && (
            <span className="text-destructive ml-2 font-medium">
              (包含 {totalErrors} 个解析异常)
            </span>
          )}
        </p>
      </div>
      {/* 列表区域 */}
      <div className="grid gap-4">
        {groupedData.map((table) => (
          <TableCard key={table.tableName} table={table} />
        ))}
      </div>
    </div>
  )
}

function TableCard({ table }: { table: GroupedTableData }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasErrors = table.parseErrors && table.parseErrors.length > 0;
  const isTotalFailure = table.totalRows === 0 && hasErrors;

  const previewRows = table.rows.slice(0, 5);

  return (
    <Card className={`border-l-4 shadow-sm hover:shadow-md transition-shadow ${
      isTotalFailure ? 'border-l-destructive bg-destructive/5' : 
      hasErrors ? 'border-l-yellow-500' : 'border-l-primary'
    }`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 overflow-hidden">
            <CollapsibleTrigger asChild>
              <button className="p-1 hover:bg-muted rounded-full">
                {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            </CollapsibleTrigger>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold font-mono text-primary truncate">{table.tableName}</h3>
                <Badge variant="outline" className="text-muted-foreground bg-muted/50 whitespace-nowrap">
                  {table.originalBaseName}
                </Badge>
                {hasErrors && (
                  <Badge variant={isTotalFailure ? "destructive" : "default"} className={`gap-1 ${!isTotalFailure ? "bg-yellow-500 hover:bg-yellow-600" : ""}`}>
                    <AlertTriangle size={12} />
                    {table.parseErrors?.length} 个错误
                  </Badge>
                )}
              </div>
              <div className="flex gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <LayoutList size={14} /> {table.headers.length} 个字段
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={14} className={table.totalRows > 0 ? "text-green-600" : "text-gray-400"} /> 
                  {table.totalRows} 行有效数据
                </span>
                <span className="flex items-center gap-1">
                  <FileSpreadsheet size={14} /> 来源: {table.sourceFiles.length} 个文件
                </span>
              </div>
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-6 pb-6 pt-0 space-y-4">
            {/* 错误信息展示区域 */}
            {hasErrors && (
              <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md text-sm text-destructive">
                <span className="font-semibold flex items-center gap-2 mb-2">
                  <AlertCircle size={16} /> 解析过程中发生错误：
                </span>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {table.parseErrors?.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 来源文件列表 */}
            {table.sourceFiles.length > 0 && (
               <div className="bg-muted/30 p-3 rounded-md text-sm">
                <span className="font-semibold text-muted-foreground block mb-2">合并成功文件：</span>
                <div className="flex flex-wrap gap-2">
                  {table.sourceFiles.map((f: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="font-normal text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 数据预览表格 */}
            {table.headers.length > 0 ? (
              <div className="border rounded-md overflow-hidden bg-background">
                <ScrollArea className="w-full">
                  <div className="min-w-max">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground font-medium">
                        <tr>
                          {table.headers.map((h: string, i: number) => (
                            <th key={i} className="px-4 py-2 border-b whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row: any, rIdx: number) => (
                          <tr key={rIdx} className="hover:bg-muted/50 border-b last:border-0">
                            {table.headers.map((h: string, cIdx: number) => (
                              <td key={cIdx} className="px-4 py-2 whitespace-nowrap max-w-[200px] truncate">
                                {row[h] !== undefined ? String(row[h]) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
                {table.totalRows > 5 && (
                   <div className="bg-muted/10 p-2 text-center text-xs text-muted-foreground border-t">
                     ... 还有 {table.totalRows - 5} 行数据 ...
                   </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center border border-dashed rounded-md">
                 <AlertCircle className="mb-2 h-8 w-8 opacity-50" />
                 暂无有效数据
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}