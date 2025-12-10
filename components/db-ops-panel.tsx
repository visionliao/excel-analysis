"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  ServerCog, Database, Loader2, History, ChevronDown, ChevronRight, 
  Trash2, AlertTriangle, ArrowDownCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area" 
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export interface TableColumnInfo {
  name: string
  comment: string | null
}

export interface TableData {
  tableName: string
  tableComment?: string
  originalName?: string
  exists: boolean
  rows: any[]
  totalInDB: number
  columns: TableColumnInfo[]
  isExpanded?: boolean
  isLoadingMore?: boolean
}

// 定义持久化状态
export interface OpsPanelState {
    historyList: string[]
    selectedTimestamp: string
    tables: TableData[]
}

interface DbOpsPanelProps {
    postgresUrl: string
    setPostgresUrl: (url: string) => void
    state: OpsPanelState
    setState: (newState: OpsPanelState | ((prev: OpsPanelState) => OpsPanelState)) => void
}

export function DbOpsPanel({ postgresUrl, setPostgresUrl, state, setState }: DbOpsPanelProps) {
  const { toast } = useToast()

  const { historyList, selectedTimestamp, tables } = state;

  const [isQuerying, setIsQuerying] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null) 
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // 1. 初始化
  useEffect(() => {
    if (!postgresUrl) {
        fetch('/api/config/get-db-url').then(res => res.json()).then(data => {
            if (data.success && data.url) setPostgresUrl(data.url)
        });
    }

    if (historyList.length === 0) {
        fetch('/api/schema/list').then(res => res.json()).then(data => {
            if (data.success && data.timestamps.length > 0) {
                setState(prev => ({
                    ...prev,
                    historyList: data.timestamps,
                    selectedTimestamp: prev.selectedTimestamp || data.timestamps[0]
                }));
            }
        });
    }
  }, [])

  // 处理下拉切换
  const handleTimestampChange = (val: string) => {
      setState(prev => ({
          ...prev,
          selectedTimestamp: val,
          tables: [] // 清空之前查询的数据
      }));
  };

  // 2. 查询数据
  const handleQuery = useCallback(async () => {
    if (!selectedTimestamp) return;
    setIsQuerying(true);
    // 清空旧数据
    setState(prev => ({ ...prev, tables: [] }));

    try {
      const res = await fetch('/api/db/ops/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: postgresUrl, timestamp: selectedTimestamp })
      });
      const result = await res.json();

      if (result.success) {
        // 默认全部展开，方便查看
        const processedTables = result.tables.map((t: any) => ({ ...t, isExpanded: true }));
        setState(prev => ({ ...prev, tables: processedTables }));
        if (processedTables.length === 0) {
            toast({ title: "查询完成", description: "该版本没有定义任何表格。" });
        } else {
            toast({ title: "查询成功", description: `已加载 ${processedTables.length} 张表的数据概览` });
        }
      } else {
        toast({ title: "查询失败", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
        toast({ title: "请求出错", description: e.message, variant: "destructive" });
    } finally {
        setIsQuerying(false);
    }
  }, [postgresUrl, selectedTimestamp, toast, setState]);

  // 3. 加载更多
  const handleLoadMore = async (index: number) => {
    const table = tables[index];
    const currentCount = table.rows.length;
    // 每次加载当前行数的 2 倍，至少 100 行
    const limit = Math.max(currentCount * 2, 100); 

    // 局部 loading 状态更新
    const updateTableLoading = (loading: boolean) => {
        setState(prev => {
            const newTables = [...prev.tables];
            newTables[index] = { ...newTables[index], isLoadingMore: loading };
            return { ...prev, tables: newTables };
        });
    };
    updateTableLoading(true);

    try {
        const res = await fetch('/api/db/ops/more', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                connectionString: postgresUrl, 
                tableName: table.tableName,
                limit: limit,
                offset: currentCount
            })
        });
        const result = await res.json();

        if (result.success && result.rows.length > 0) {
            setState(prev => {
                const newTables = [...prev.tables];
                newTables[index] = {
                    ...newTables[index],
                    rows: [...newTables[index].rows, ...result.rows],
                    isLoadingMore: false
                };
                return { ...prev, tables: newTables };
            });
        } else if (result.success && result.rows.length === 0) {
            toast({ description: "没有更多数据了" });
            updateTableLoading(false);
        } else {
            toast({ title: "加载失败", description: result.error, variant: "destructive" });
            updateTableLoading(false);
        }
    } catch(e) {
        console.error(e);
        updateTableLoading(false);
    }
  };

  // 切换展开/折叠
  const toggleExpanded = (index: number, open: boolean) => {
      setState(prev => {
          const newTables = [...prev.tables];
          newTables[index] = { ...newTables[index], isExpanded: open };
          return { ...prev, tables: newTables };
      });
  }

  // 4. 删除表操作
  const confirmDelete = (targetNames: string[]) => {
    setDeleteTarget(targetNames);
    setIsDeleteDialogOpen(true);
  }

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setIsDeleteDialogOpen(false);

    try {
        const res = await fetch('/api/db/ops/drop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                connectionString: postgresUrl, 
                tableNames: deleteTarget 
            })
        });
        const result = await res.json();
        if (result.success) {
            toast({ title: "删除成功", description: `已清理 ${deleteTarget.length} 张表的数据`, className: "bg-green-100" });
            // 删除后自动刷新查询
            handleQuery();
        } else {
            toast({ title: "删除失败", description: result.error, variant: "destructive" });
        }
    } catch(e) {
        console.error(e);
        toast({ title: "请求出错", variant: "destructive" });
    } finally {
        setIsDeleting(false);
        setDeleteTarget(null);
    }
  }

  return (
    <div className="w-full max-w-none xl:max-w-7xl 2xl:max-w-[90rem] mx-auto pb-20">
      {/* 删除确认弹窗 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                <AlertDialogTitle>确认删除数据库表？</AlertDialogTitle>
            </div>

            <AlertDialogDescription>
              此操作将执行 <span className="font-mono bg-slate-100 px-1">DROP TABLE ... CASCADE</span>。
              <br/><br/>
              <strong className="text-red-600">警告：</strong>
              <br/>
              {/* 修改：使用 br 和 &bull; 替代 ul/li，以符合 <p> 标签规范 */}
              &bull; 表中的所有数据将永久丢失。<br/>
              &bull; 所有依赖此表的外键约束也会被级联删除。
              <br/><br/>
              当前选中: <strong>{deleteTarget?.length === tables.length ? "所有表格" : deleteTarget?.[0]}</strong>
            </AlertDialogDescription>

          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive hover:bg-destructive/90">
              确认并删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ServerCog className="text-primary" />
            数据库操作与管理
        </h2>
        <p className="text-muted-foreground mt-1">
            查看真实数据库中的数据，或清理旧数据。基于选定的 Schema 定义进行查询。
        </p>
      </div>

      {/* 控制栏 */}
      <div className="bg-card border rounded-lg p-6 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row gap-6 items-end">

            <div className="flex-1 w-full space-y-4">
                <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        1. 选择 Schema 版本
                    </label>
                    <div className="flex items-center gap-2 max-w-md">
                        <History className="text-muted-foreground w-4 h-4" />
                        <Select value={selectedTimestamp} onValueChange={handleTimestampChange}>
                            <SelectTrigger className="font-mono bg-white">
                                <SelectValue placeholder="选择版本..." />
                            </SelectTrigger>
                            <SelectContent>
                                {historyList.map(ts => <SelectItem key={ts} value={ts}>{ts}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        2. 数据库连接
                    </label>
                    <Input 
                        value={postgresUrl} 
                        onChange={e => setPostgresUrl(e.target.value)} 
                        className="font-mono text-sm bg-white"
                        placeholder="读取中..."
                    />
                </div>
            </div>

            <div className="flex gap-3">
                <Button 
                    size="lg" 
                    disabled={isQuerying || isDeleting || !selectedTimestamp}
                    onClick={handleQuery}
                    className="min-w-[140px]"
                >
                    {isQuerying ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Database className="mr-2 h-4 w-4" />}
                    查询数据
                </Button>
                <Button 
                    variant="destructive" 
                    disabled={isQuerying || isDeleting || tables.length === 0}
                    onClick={() => confirmDelete(tables.map(t => t.tableName))}
                    className="min-w-[120px]"
                >
                    {isDeleting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    清空全部
                </Button>
            </div>
        </div>
      </div>

      {/* 表格列表 */}
      <div className="space-y-6">
        {tables.map((table, index) => (
            <Card key={table.tableName} className={`border-l-4 shadow-sm ${table.exists ? 'border-l-blue-500' : 'border-l-slate-300 opacity-70'}`}>
                <Collapsible open={table.isExpanded} onOpenChange={(open) => toggleExpanded(index, open)}>
                    <div className="p-4 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-4 flex-1">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
                                    {table.isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </Button>
                            </CollapsibleTrigger>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-bold font-mono text-primary">{table.tableName}</h3>
                                    {table.tableComment && (
                                      <span className="text-sm text-muted-foreground font-normal">
                                        ({table.tableComment})
                                      </span>
                                    )}
                                    {!table.exists && <Badge variant="secondary">未在数据库中找到</Badge>}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                    {table.exists ? (
                                        <span>数据库总行数: <span className="font-bold text-foreground">{table.totalInDB}</span></span>
                                    ) : (
                                        "Schema 中定义但数据库缺失"
                                    )}
                                </div>
                            </div>
                        </div>

                        {table.exists && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                                onClick={() => confirmDelete([table.tableName])}
                            >
                                <Trash2 size={14} className="mr-1" /> 清空此表
                            </Button>
                        )}
                    </div>

                    <CollapsibleContent>
                        {table.exists && table.rows.length > 0 ? (
                            <div className="border-t">
                                <ScrollArea className="h-[300px] w-full whitespace-nowrap rounded-md border">
                                    <div className="min-w-max"> 
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-muted text-muted-foreground font-medium sticky top-0 z-10">
                                                <tr>
                                                    {table.columns.map((col) => (
                                                        <th key={col.name} className={`px-4 py-2 border-b whitespace-nowrap bg-muted ${col.name === 'id' ? 'w-[80px]' : ''}`}>
                                                            <div className="flex flex-col">
                                                                <span className={col.name === 'id' ? 'font-mono' : ''}>
                                                                    {col.name}
                                                                </span>
                                                                {col.comment && (
                                                                    <span className="text-[10px] font-normal text-slate-500">
                                                                        ({col.comment})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {table.rows.map((row) => (
                                                    <tr key={row.id} className="hover:bg-muted/50 border-b last:border-0">
                                                        {table.columns.map((col) => (
                                                            <td key={col.name} className={`px-4 py-2 whitespace-nowrap max-w-[300px] truncate ${col.name === 'id' ? 'font-mono text-xs text-muted-foreground' : ''}`}>
                                                                {String(row[col.name] ?? '')}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>

                                <div className="p-2 border-t bg-slate-50 flex justify-center">
                                    {table.rows.length < table.totalInDB ? (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => handleLoadMore(index)}
                                            disabled={table.isLoadingMore}
                                            className="text-primary"
                                        >
                                            {table.isLoadingMore ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <ArrowDownCircle className="mr-2 h-4 w-4"/>}
                                            加载更多 ({table.rows.length} / {table.totalInDB})
                                        </Button>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">已加载全部数据</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            table.exists && (
                                <div className="p-8 text-center text-muted-foreground text-sm">
                                    暂无数据
                                </div>
                            )
                        )}
                    </CollapsibleContent>
                </Collapsible>
            </Card>
        ))}

        {tables.length === 0 && !isQuerying && (
            <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
                请选择版本并点击查询
            </div>
        )}
      </div>
    </div>
  )
}