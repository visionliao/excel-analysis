"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { 
  Database, FileSpreadsheet, ChevronDown, ChevronRight, 
  LayoutList, CheckCircle2, AlertTriangle, Save, FolderClock, Ban, CheckCircle, Loader2, AlertCircle
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useToast } from "@/hooks/use-toast"
import { cn } from '@/lib/utils'

export interface GroupedTableData {
  tableName: string
  originalBaseName: string
  headers: string[]
  rows: any[]
  sourceFiles: string[]
  totalRows: number
  parseErrors?: string[]
}

export interface SavedSchemaItem {
  tableName: string
  enabled: boolean
  // ...其他字段
}

export interface SmartDataDisplayProps {
  groupedData: GroupedTableData[]
  currentTimestamp?: string 
  savedSchemaConfig?: SavedSchemaItem[] | null
  onDataReload?: (data: GroupedTableData[], timestamp: string, savedConfig: any) => void
}

interface TableCardProps {
  table: GroupedTableData
  isDisabled: boolean
  onToggle: (status: 'enabled' | 'disabled') => void
}

// --- 主组件 ---
export function SmartDataDisplay({ 
  groupedData, 
  currentTimestamp: initialTimestamp, 
  savedSchemaConfig, 
  onDataReload 
}: SmartDataDisplayProps) {
  const { toast } = useToast()
  
  // 状态管理
  const [disabledTables, setDisabledTables] = useState<Set<string>>(new Set())
  const [lastSavedSchema, setLastSavedSchema] = useState<SavedSchemaItem[] | null>(null)
  const [historyList, setHistoryList] = useState<string[]>([])
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>(initialTimestamp || '')
  
  // UI 交互状态
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  
  // 弹窗状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveDialogContent, setSaveDialogContent] = useState<{title: string, desc: React.ReactNode}>({ title: '', desc: '' })

  // 1. 初始化/恢复状态
  // 根据 savedSchemaConfig 中的 enabled 字段来恢复禁用状态
  useEffect(() => {
    setLastSavedSchema(savedSchemaConfig || null);

    if (savedSchemaConfig && savedSchemaConfig.length > 0) {
      const newDisabledSet = new Set<string>();
      
      savedSchemaConfig.forEach(t => {
        // 如果配置文件里明确写了 enabled: false，则加入禁用列表
        if (t.enabled === false) {
          newDisabledSet.add(t.tableName);
        }
      });
      setDisabledTables(newDisabledSet);
    } else {
      // 如果没有配置(新数据)，或者配置为空，默认全启用
      setDisabledTables(new Set());
    }
  }, [groupedData, savedSchemaConfig]);

  // 2. 加载历史版本列表
  useEffect(() => {
    fetch('/api/history/list')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setHistoryList(data.timestamps)
          if (!selectedTimestamp && initialTimestamp) {
            setSelectedTimestamp(initialTimestamp)
          }
        }
      })
      .catch(err => console.error("Failed to fetch history", err))
  }, [initialTimestamp, selectedTimestamp])

  // 3. 切换表格启用状态
  const toggleTableStatus = (tableName: string, status: 'enabled' | 'disabled') => {
    const newSet = new Set(disabledTables)
    if (status === 'disabled') newSet.add(tableName);
    else newSet.delete(tableName);
    setDisabledTables(newSet)
  }

  // 4. 切换历史数据版本
  const handleHistoryChange = async (timestamp: string) => {
    if (!timestamp) return
    setIsLoadingHistory(true)
    try {
      const res = await fetch('/api/history/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp })
      })
      const result = await res.json()
      
      if (result.success) {
        setSelectedTimestamp(timestamp)
        if (onDataReload) {
          onDataReload(result.data, timestamp, result.savedSchema)
        }
        toast({ title: "加载成功", description: `已加载 ${timestamp} 的数据版本` })
      } else {
        toast({ title: "加载失败", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "错误", description: "加载历史记录出错", variant: "destructive" })
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // 5. 点击保存前的预检查 (Diff 逻辑修复)
  const handlePreSave = () => {
    if (!selectedTimestamp) return;

    // A. 如果从未保存过
    if (!lastSavedSchema) {
      executeSave();
      return;
    }

    // B. 构建两个禁用集合进行对比
    // 当前用户的禁用集合
    const currentDisabledSet = disabledTables;

    // 上次保存的禁用集合 (从 lastSavedSchema 反推)
    const savedDisabledSet = new Set<string>();
    lastSavedSchema.forEach(t => {
      if (t.enabled === false) savedDisabledSet.add(t.tableName);
    });

    // C. 计算差异
    // "新增启用" = 以前禁用了，现在没禁用 (在 savedDisabled 里，不在 currentDisabled 里)
    const newlyEnabled = Array.from(savedDisabledSet).filter(x => !currentDisabledSet.has(x));

    // "新增禁用" = 以前没禁用，现在禁用了 (在 currentDisabled 里，不在 savedDisabled 里)
    const newlyDisabled = Array.from(currentDisabledSet).filter(x => !savedDisabledSet.has(x));

    // D. 判断是否有变化
    if (newlyEnabled.length === 0 && newlyDisabled.length === 0) {
      setSaveDialogContent({
        title: "配置未发生变化",
        desc: "当前启用的表格结构与上次保存的完全一致。是否确定要覆盖保存？"
      });
      setSaveDialogOpen(true);
      return;
    }

    // E. 提示差异
    setSaveDialogContent({
      title: "配置发生变更",
      desc: (
        <div className="space-y-2 text-sm">
          <p>当前配置与上次保存的版本不一致，已为您列出差异：</p>
          <div className="bg-muted p-3 rounded-md space-y-2">
            {newlyEnabled.length > 0 && (
              <div className="text-green-600 break-words">
                <span className="font-bold">[+ 重新启用]:</span> {newlyEnabled.join(', ')}
              </div>
            )}
            {newlyDisabled.length > 0 && (
              <div className="text-destructive break-words">
                <span className="font-bold">[- 新增禁用]:</span> {newlyDisabled.join(', ')}
              </div>
            )}
          </div>
          <p className="pt-2">是否覆盖保存？</p>
        </div>
      )
    });
    setSaveDialogOpen(true);
  }

  // 6. 执行保存请求
  const executeSave = async () => {
    setSaveDialogOpen(false);
    setIsSaving(true);
    
    // 全量发送数据，附带 enabled 标记
    const tablesToSave = groupedData.map(t => ({
      ...t,
      enabled: !disabledTables.has(t.tableName) // 显式标记
    }));

    try {
      const res = await fetch('/api/save-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          timestamp: selectedTimestamp,
          tables: tablesToSave // 发送全量带状态的数据
        })
      })
      const result = await res.json()
      
      if (result.success) {
        toast({ 
          title: "保存成功", 
          description: `表结构已更新`,
          className: "bg-green-100 border-green-200"
        })
        
        // 更新本地缓存，用于下次 Diff (不需要刷新页面)
        // 构造符合 SavedSchemaItem 接口的数据
        const newSavedSchema = tablesToSave.map(t => ({
          tableName: t.tableName,
          enabled: t.enabled
        }));
        setLastSavedSchema(newSavedSchema);

      } else {
        toast({ title: "保存失败", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "错误", description: "请求失败", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  // 7. 统计数据
  const rawStats = useMemo(() => {
    const totalStructures = groupedData.length;
    const totalFiles = groupedData.reduce((acc, item) => acc + item.sourceFiles.length, 0);
    const totalRawRows = groupedData.reduce((acc, item) => acc + item.totalRows, 0);
    const totalErrors = groupedData.reduce((acc, item) => acc + (item.parseErrors?.length || 0), 0);
    return { totalStructures, totalFiles, totalRawRows, totalErrors };
  }, [groupedData]);

  const filteredStats = useMemo(() => {
    const validTables = groupedData.filter(t => !disabledTables.has(t.tableName));
    const validRows = validTables.reduce((acc, t) => acc + t.totalRows, 0);
    return { validTableCount: validTables.length, validRows };
  }, [groupedData, disabledTables]);

  if (!groupedData || groupedData.length === 0) return null;

  return (
    <div className="space-y-8 mt-8 pb-20">
      
      <AlertDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{saveDialogContent.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {saveDialogContent.desc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={executeSave}>确认覆盖保存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- Top: 解析结果概览 --- */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">解析结果概览</h2>
        </div>
        <p className="text-muted-foreground text-sm ml-9">
          总共解析 <span className="font-bold text-foreground">{rawStats.totalFiles}</span> 个来源表格，
          经过自动合并处理，
          最终生成 <span className="font-bold text-foreground">{rawStats.totalStructures}</span> 张表结构数据，
          有效数据总共 <span className="font-bold text-foreground">{rawStats.totalRawRows.toLocaleString()}</span> 行。
          {rawStats.totalErrors > 0 && (
            <span className="text-destructive ml-2 font-medium">
              (包含 {rawStats.totalErrors} 个解析异常)
            </span>
          )}
        </p>
      </div>
      
      {/* --- Middle: 表格卡片列表 --- */}
      <div className="grid gap-4">
        {groupedData.map((table) => (
          <TableCard 
            key={table.tableName} 
            table={table} 
            isDisabled={disabledTables.has(table.tableName)}
            onToggle={(status) => toggleTableStatus(table.tableName, status)}
          />
        ))}
      </div>

      {/* --- Bottom: 表结构存储区域 --- */}
      <div className="border-t-2 border-dashed pt-8 mt-12">
        <div className="flex items-center gap-3 mb-4">
          <FolderClock className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">表结构存储</h2>
        </div>

        {/* 3.1 详细描述 */}
        <div className="bg-muted/30 p-4 rounded-lg mb-6 border">
          <p className="text-sm">
            总共筛选出 <span className="text-lg font-bold text-primary">{filteredStats.validTableCount}</span> 张启用表，
            共有 <span className="text-lg font-bold text-primary">{filteredStats.validRows.toLocaleString()}</span> 行有效数据。
          </p>
          
          <div className="mt-4 flex flex-wrap gap-2">
            {groupedData.map(t => {
              const isDis = disabledTables.has(t.tableName);
              return (
                <Badge 
                  key={t.tableName} 
                  variant={isDis ? "outline" : "default"}
                  className={cn(
                    "flex items-center gap-1 transition-all",
                    isDis 
                      ? "text-muted-foreground border-dashed bg-transparent" 
                      : "hover:bg-primary/90"
                  )}
                >
                  {isDis ? <Ban size={12} /> : <CheckCircle size={12} />}
                  {t.tableName} 
                  <span className="opacity-70 ml-1">({t.totalRows})</span>
                </Badge>
              )
            })}
          </div>
        </div>

        {/* 3.2 操作栏 */}
        <div className="flex items-end gap-4 bg-card border p-6 rounded-lg shadow-sm">
          
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-muted-foreground">选择数据版本 (Output Source)</label>
            <Select 
              value={selectedTimestamp} 
              onValueChange={handleHistoryChange}
              disabled={isLoadingHistory}
            >
              <SelectTrigger className="w-full font-mono">
                <SelectValue placeholder="选择历史时间戳..." />
              </SelectTrigger>
              <SelectContent>
                {historyList.map(ts => (
                  <SelectItem key={ts} value={ts}>
                    {ts} {ts === initialTimestamp ? '(当前)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            size="lg" 
            onClick={handlePreSave} 
            disabled={isSaving || !selectedTimestamp || isLoadingHistory}
            className="gap-2 min-w-[180px]"
          >
            {isLoadingHistory ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                加载数据中...
              </>
            ) : isSaving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save size={18} />
                保存表结构
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TableCard({ table, isDisabled, onToggle }: TableCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasErrors = table.parseErrors && table.parseErrors.length > 0;
  const previewRows = table.rows.slice(0, 5);

  return (
    <Card className={cn(
      "border-l-4 shadow-sm transition-all duration-300",
      isDisabled 
        ? "border-l-gray-300 bg-gray-50/50 opacity-60" 
        : hasErrors ? "border-l-yellow-500 hover:shadow-md" : "border-l-primary hover:shadow-md"
    )}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <CollapsibleTrigger asChild>
              <button className="p-1 hover:bg-muted rounded-full">
                {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            </CollapsibleTrigger>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn("text-lg font-bold font-mono truncate", isDisabled ? "text-muted-foreground" : "text-primary")}>
                  {table.tableName}
                </h3>
                <Badge variant="outline" className="text-muted-foreground bg-muted/50 whitespace-nowrap">
                  {table.originalBaseName}
                </Badge>
                {hasErrors && (
                  <Badge variant="default" className="bg-yellow-500 gap-1">
                    <AlertTriangle size={12} /> {table.parseErrors?.length} 错误
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

          <div className="flex-shrink-0 ml-4">
            <Select 
              value={isDisabled ? 'disabled' : 'enabled'} 
              onValueChange={(val: any) => onToggle(val)}
            >
              <SelectTrigger className={cn("w-[100px] h-8 text-xs transition-colors", isDisabled ? "text-muted-foreground bg-transparent" : "text-green-600 border-green-200 bg-green-50")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled" className="text-green-600">
                  <div className="flex items-center gap-2"><CheckCircle size={14}/> 启用</div>
                </SelectItem>
                <SelectItem value="disabled" className="text-muted-foreground">
                  <div className="flex items-center gap-2"><Ban size={14}/> 禁用</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <CollapsibleContent>
          <div className={cn("px-6 pb-6 pt-0 space-y-4 transition-opacity", isDisabled && "opacity-50 pointer-events-none select-none grayscale")}>
            {hasErrors && (
              <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md text-sm text-destructive">
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {table.parseErrors?.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
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
              <div className="p-8 text-center text-muted-foreground border border-dashed rounded-md flex flex-col items-center">
                 <AlertCircle className="mb-2 opacity-50" />
                 暂无有效表头结构
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}