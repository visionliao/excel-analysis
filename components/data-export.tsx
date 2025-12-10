"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Database, AlertCircle, ArrowRight, CheckCircle2, CheckCircle,
  PlusCircle, RefreshCcw, AlertTriangle, Loader2, History, TableProperties, XCircle
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface DiffReportItem {
  tableName: string
  status: 'NEW_TABLE' | 'SCHEMA_CHANGE' | 'DATA_UPDATE' | 'DATA_INCREMENTAL' | 'DATA_OVERWRITE' | 'NO_CHANGE'
  message: string
  newRowCount: number
  oldRowCount: number
  insertCount: number
  diff?: string[]
  detailIds?: {
    updates: number[]
    inserts: number[]
  }
}

interface SchemaTablePreview {
  tableName: string
  originalName: string
}

// 定义后端返回的错误详情结构
interface ValidationErrorDetail {
  tableName: string
  rowNumber: number
  columnName: string
  targetType: string
  invalidValue: string
  message: string
}

// 成功统计接口
interface SuccessStats {
  tables: number
  rows: number
  relationships: number
}

export function TableExportPanel() {
  const { toast } = useToast()

  const [postgresUrl, setPostgresUrl] = useState("")

  // 版本控制状态
  const [historyList, setHistoryList] = useState<string[]>([])
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>('')

  // 预览列表状态
  const [schemaTables, setSchemaTables] = useState<SchemaTablePreview[]>([])
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)

  // 操作状态
  const [isChecking, setIsChecking] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [report, setReport] = useState<DiffReportItem[] | null>(null)

  // 错误弹窗状态
  const [validationError, setValidationError] = useState<ValidationErrorDetail | null>(null)
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false)

  // 成功弹窗状态
  const [successStats, setSuccessStats] = useState<SuccessStats | null>(null)
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false)

  // 1. 初始化
  useEffect(() => {
    const fetchDefaultConfig = async () => {
      try {
        const res = await fetch('/api/config/get-db-url');
        const data = await res.json();
        if (data.success && data.url) {
          setPostgresUrl(data.url);
        }
      } catch (error) {
        console.error("无法获取默认数据库配置", error);
      }
    };
    fetchDefaultConfig();

    fetch('/api/schema/list')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.timestamps.length > 0) {
          setHistoryList(data.timestamps)
          setSelectedTimestamp(data.timestamps[0])
        }
      })
      .catch(err => console.error("Failed to fetch schema list", err))
  }, [])

  // 2. 加载 Schema 预览
  useEffect(() => {
    if (!selectedTimestamp) return;

    const loadSchemaPreview = async () => {
      setIsLoadingSchema(true);
      setSchemaTables([]);
      setReport(null);

      try {
        const res = await fetch('/api/history/load-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp: selectedTimestamp })
        });
        const data = await res.json();

        if (data.success && data.existingLayout && data.existingLayout.nodes) {
          const tables: SchemaTablePreview[] = data.existingLayout.nodes.map((node: any) => ({
            tableName: node.data.tableName,
            originalName: node.data.originalName || node.data.tableName
          }));
          setSchemaTables(tables);
        } else {
          setSchemaTables([]);
        }
      } catch (error) {
        console.error("Failed to load schema preview", error);
        toast({ title: "预览加载失败", description: "无法读取该版本的表结构定义", variant: "destructive" });
      } finally {
        setIsLoadingSchema(false);
      }
    };

    loadSchemaPreview();
  }, [selectedTimestamp, toast]);

  // 3. 检查数据
  const handleCheckData = useCallback(async () => {
    if (!postgresUrl) {
      toast({ title: "错误", description: "请输入数据库连接地址", variant: "destructive" })
      return
    }
    if (!selectedTimestamp) {
      toast({ title: "错误", description: "请选择一个数据版本", variant: "destructive" })
      return
    }

    setIsChecking(true)
    setReport(null)

    try {
      const res = await fetch('/api/db/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            connectionString: postgresUrl,
            timestamp: selectedTimestamp
        })
      })

      const result = await res.json()
      if (result.success) {
        setReport(result.report)
        toast({ title: "检查完成", description: "已基于 table_schema.json 对比差异" })
      } else {
        toast({ title: "检查失败", description: result.error, variant: "destructive" })
      }
    } catch (e: any) {
        toast({ title: "请求出错", description: e.message, variant: "destructive" })
    } finally {
        setIsChecking(false)
    }
  }, [postgresUrl, selectedTimestamp, toast])

  // 4. 导出数据
  const handleExportData = useCallback(async () => {
    if (!report) return;

    setIsExporting(true)
    // 每次导出前先关闭并清空之前的错误
    setIsErrorDialogOpen(false)
    setValidationError(null)
    setIsSuccessDialogOpen(false)

    try {
      const res = await fetch('/api/db/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            connectionString: postgresUrl,
            timestamp: selectedTimestamp
        })
      })
      const result = await res.json()

      if (result.success) {
        // 成功后，设置统计数据并打开成功弹窗
        if (result.stats) {
            setSuccessStats(result.stats);
            setIsSuccessDialogOpen(true);
        } else {
            // 兼容
            toast({
              title: "导出成功",
              description: "所有表结构及数据已根据沙盘定义同步至数据库",
              className: "bg-green-100 border-green-200"
          })
        }
        // 清空报告，防止重复提交
        setReport(null)
      } else {
        // 优先处理校验错误
        if (result.errorType === 'VALIDATION_ERROR' && result.details) {
          // 1. 设置错误详情状态
          setValidationError(result.details);
          // 2. 打开弹窗
          setIsErrorDialogOpen(true);
        } else {
          // 普通数据库错误，还是用 Toast
          toast({
              title: "导出失败",
              description: result.error,
              variant: "destructive"
          })
        }
      }
    } catch (e: any) {
      console.error("Export Exception:", e);
      toast({ title: "导出出错", description: e.message, variant: "destructive" })
    } finally {
      setIsExporting(false)
    }
  }, [postgresUrl, selectedTimestamp, report, toast])

  // 格式化 ID 列表显示
  const renderIdList = (ids: number[], type: 'insert' | 'update') => {
    if (!ids || ids.length === 0) return null;

    // 如果数量太多，截断显示
    const MAX_DISPLAY = 15;
    const displayIds = ids.slice(0, MAX_DISPLAY).join(', ');
    const moreCount = ids.length - MAX_DISPLAY;

    const label = type === 'insert' ? '新增' : '更新';
    const colorClass = type === 'insert' ? 'text-green-600' : 'text-blue-600';
    const bgColorClass = type === 'insert' ? 'bg-green-50' : 'bg-blue-50';

    return (
        <div className={`text-xs mt-1 font-mono ${colorClass} ${bgColorClass} p-2 rounded break-all`}>
            <span className="font-bold">[{label} {ids.length} 条]:</span> ID 为 {displayIds}
            {moreCount > 0 && <span className="opacity-70"> ... 等 {moreCount} 条</span>}
        </div>
    );
  };

  const renderReportItem = (item: DiffReportItem) => {
    let icon = <CheckCircle2 className="text-slate-400" />
    let colorClass = "border-l-slate-300 bg-slate-50"
    let badge = <Badge variant="outline" className="text-slate-500">无变化</Badge>
    let showDetails = false;

    // 根据优先级高亮显示
    if (item.status === 'SCHEMA_CHANGE') {
      icon = <AlertTriangle className="text-red-500 h-5 w-5" />
      colorClass = "border-l-red-500 bg-red-50/50"
      badge = <Badge variant="destructive">结构变更 (重置)</Badge>
      showDetails = true;
    } else if (item.status === 'NEW_TABLE') {
      icon = <PlusCircle className="text-green-600 h-5 w-5" />
      colorClass = "border-l-green-500 bg-green-50/50"
      badge = <Badge className="bg-green-600">新增表</Badge>
      showDetails = true;
    } else if (item.status === 'DATA_INCREMENTAL' || item.status === 'DATA_OVERWRITE') {
      icon = <RefreshCcw className="text-blue-500 h-5 w-5" />
      colorClass = "border-l-blue-500 bg-blue-50/30"
      badge = <Badge className="bg-blue-500">数据更新</Badge>
      showDetails = true;
    }

    return (
      <Card key={item.tableName} className={`mb-3 border-l-4 shadow-sm transition-all ${colorClass}`}>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <CardTitle className={`text-base font-mono ${showDetails ? 'font-bold' : 'font-normal text-slate-600'}`}>
                {item.tableName}
              </CardTitle>
            </div>
            {badge}
          </div>
          <div className="flex items-center text-sm text-muted-foreground gap-4">
            {/* 只有有变化时才着重显示行数变化 */}
            {showDetails ? (
            <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase">Original</span>
            <span className="font-mono">{item.oldRowCount}</span>
            </div>
            <ArrowRight size={14} />
            <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase">New</span>
            <span className="font-mono font-bold text-foreground">{item.newRowCount}</span>
            </div>
            {/* 显示增量 */}
            {(item.insertCount > 0) && (
            <Badge variant="outline" className="ml-2 bg-white text-green-600 border-green-200">
              +{item.insertCount}
            </Badge>
            )}
            </div>
            ) : (
            <span className="text-xs text-slate-400">行数: {item.newRowCount}</span>
            )}
          </div>
        </CardHeader>
        {/* 只显示有意义的 Message */}
        {showDetails && (
          <>
            <Separator className="bg-black/5" />
            <CardContent className="py-2 px-4 text-xs text-muted-foreground space-y-2">
              {/* 优先显示详细 ID 列表 */}
              {item.status === 'DATA_INCREMENTAL' && item.detailIds ? (
                <>
                  {renderIdList(item.detailIds.inserts, 'insert')}
                  {renderIdList(item.detailIds.updates, 'update')}
                </>
              ) : (
                // 降级显示普通消息 (New Table, Schema Change)
                <div>{item.message}</div>
              )}
              {item.diff && (
                <div className="mt-2 space-y-1">
                  {item.diff.map((d, i) => (
                    <div key={i} className="text-red-500 font-mono">• {d}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    )
  }

  return (
    <div className="w-full max-w-none xl:max-w-7xl 2xl:max-w-[90rem] mx-auto pb-20">
    {/* 错误提示弹窗 */}
    <AlertDialog open={isErrorDialogOpen} onOpenChange={setIsErrorDialogOpen}>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-2">
            <XCircle className="h-6 w-6" />
            <AlertDialogTitle className="text-xl">数据导出中断：校验失败</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            在写入数据库之前，系统检测到严重的数据格式错误，已自动回滚所有操作。
            请根据以下信息修正源文件或调整沙盘设置。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {validationError && (
          <div className="bg-slate-950 text-slate-50 p-6 rounded-md font-mono text-sm overflow-auto max-h-[400px] border border-slate-800 shadow-inner">
            <div className="grid grid-cols-[100px_1fr] gap-y-3">
              <span className="text-slate-400">出错表名:</span>
              <span className="font-bold text-green-400">{validationError.tableName}</span>

              <span className="text-slate-400">错误位置:</span>
              <span>
                第 <span className="text-yellow-400 font-bold">{validationError.rowNumber}</span> 行，
                列 <span className="text-yellow-400 font-bold">[{validationError.columnName}]</span>
              </span>

              <span className="text-slate-400">目标类型:</span>
              <span className="text-blue-300">{validationError.targetType}</span>

              <span className="text-slate-400">非法数值:</span>
              <span className="text-red-400 bg-red-900/30 px-2 py-0.5 rounded break-all">
                  "{validationError.invalidValue}"
              </span>

              <span className="text-slate-400">详细原因:</span>
              <span className="text-slate-200">{validationError.message}</span>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90">
            我已知晓，去处理
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 成功结算弹窗 */}
    <AlertDialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex flex-col items-center gap-4 mb-4">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <AlertDialogTitle className="text-2xl text-green-700">导出成功</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-center">
            所有数据已成功写入数据库，旧数据已覆盖。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {successStats && (
          <div className="bg-muted/50 p-6 rounded-lg space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">处理表格</span>
                  <span className="text-lg font-bold">{successStats.tables} 张</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">写入数据</span>
                  <span className="text-lg font-bold text-primary">{successStats.rows.toLocaleString()} 行</span>
              </div>
              <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">外键关系</span>
                  <span className="font-medium">{successStats.relationships} 条</span>
              </div>
          </div>
        )}

        <AlertDialogFooter className="sm:justify-center mt-4">
          <AlertDialogAction className="min-w-[120px] bg-green-600 hover:bg-green-700">完成</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="mb-8">
      <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Database className="text-primary" />
        数据导出 (基于沙盘定义)
      </h2>
      <p className="text-muted-foreground mt-1">
        选择已保存的沙盘版本 (table_schema.json)，将其定义的结构和数据同步至 PostgreSQL。
      </p>
    </div>

    <div className="bg-card border rounded-lg p-6 shadow-sm mb-8">
      {/* 1. 选择导出基准版本 (Table Schema) */}
      <div className="mb-4 max-w-xl">
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          1. 选择导出基准版本 (Table Schema)
        </label>
        <div className="flex items-center gap-2">
          <History className="text-muted-foreground w-4 h-4" />
          <Select value={selectedTimestamp} onValueChange={setSelectedTimestamp}>
            <SelectTrigger className="font-mono">
              <SelectValue placeholder="选择历史版本..." />
            </SelectTrigger>
            <SelectContent>
              {historyList.map(ts => (
                <SelectItem key={ts} value={ts}>{ts}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 表格预览列表 */}
      <div className="mb-6 w-full">
        <div className="border rounded-md bg-slate-50 overflow-hidden">
          <div className="px-3 py-2 bg-slate-100 border-b flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TableProperties className="w-3 h-3" />
              包含 {schemaTables.length} 张表格定义
            </span>
            {isLoadingSchema && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>

          <ScrollArea className="h-[140px] w-full">
            {schemaTables.length > 0 ? (
              <div className="p-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {schemaTables.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-white border rounded text-sm hover:border-primary/30 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-slate-700 font-mono text-xs truncate" title={t.tableName}>
                        {t.tableName}
                      </span>
                      <span className="text-xs text-muted-foreground truncate" title={t.originalName}>
                        {t.originalName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
                {isLoadingSchema ? "正在加载表结构..." : "该版本未找到有效的表结构定义 (table_schema.json)"}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      <Separator className="mb-6" />

      <div className="mb-2">
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
        2. 数据库连接
        </label>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            value={postgresUrl}
            onChange={(e) => setPostgresUrl(e.target.value)}
            placeholder="正在读取默认配置..."
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1 ml-1">
            * 已自动读取服务器环境变量配置，您可以根据需要修改。
          </p>
        </div>
        <Button
          onClick={handleCheckData}
          disabled={isChecking || !selectedTimestamp}
          className="min-w-[140px]"
          size="default"
        >
          {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          检查数据差异
        </Button>
      </div>
    </div>

    {/* 差异报告展示区域 */}
    {report && (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <AlertCircle className="text-primary" />
            差异分析报告
          </h3>
        </div>

        <ScrollArea className="h-[500px] border rounded-lg bg-slate-50 p-4">
          {report.map(renderReportItem)}
          {report.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              没有任何变更，数据库与当前数据完全一致。
            </div>
          )}
        </ScrollArea>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-50 md:pl-64">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              请仔细核对上方报告。
              <span className="text-orange-600 font-bold ml-2">注意：涉及结构变更的表将被 DROP 并重建。</span>
            </div>
            <Button
              size="lg"
              onClick={handleExportData}
              disabled={isExporting}
              className="bg-primary hover:bg-primary/90 shadow-lg"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在写入数据库...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  确认并导出所有数据
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}