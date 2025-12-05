"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  Edge,
  MiniMap,
  OnConnect,
  NodeTypes // 引入类型
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Save, Loader2, LayoutGrid, AlertTriangle } from 'lucide-react'
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
import { useToast } from "@/hooks/use-toast"
// 引入 SchemaNodeType
import SchemaNode, { SchemaNodeType, SchemaNodeData } from './schema-node'

// 定义 API 返回的数据结构
interface LoadSummaryResponse {
  success: boolean
  summary?: Array<{
    tableName: string
    originalBaseName: string
    headers: string[]
    enabled?: boolean
  }>
  existingLayout?: {
    nodes: SchemaNodeType[]
    edges: Edge[]
  }
}

export function TableSandbox() {
  const { toast } = useToast()

  // 使用 useMemo 缓存 nodeTypes，防止 React Flow 无限重渲染警告
  const nodeTypes = useMemo<NodeTypes>(() => ({
    schemaNode: SchemaNode,
  }), []);

  // 使用泛型 SchemaNodeType
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // 业务状态
  const [historyList, setHistoryList] = useState<string[]>([])
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 校验弹窗状态
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // 1. 初始化加载时间戳列表 (Schema 模式)
  useEffect(() => {
    fetch('/api/schema/list')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.timestamps.length > 0) {
          setHistoryList(data.timestamps)
          setSelectedTimestamp(data.timestamps[0]) // 默认选中最新的 Schema
        } else {
          setHistoryList([]);
          setSelectedTimestamp('');
        }
      })
      .catch(err => console.error("Failed to fetch schema list", err))
  }, [])

  // 2. 字段变更回调
  const handleColumnChange = useCallback((tableName: string, colIndex: number, field: string, value: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== tableName) return node;

        const newData = { ...node.data };
        const newColumns = [...newData.columns];

        // @ts-ignore: 忽略动态 key 赋值的类型检查
        newColumns[colIndex] = {
          ...newColumns[colIndex],
          [field]: value
        };

        return {
          ...node,
          data: {
            ...newData,
            columns: newColumns
          }
        };
      })
    );
  }, [setNodes]);

  // 3. 加载逻辑
  useEffect(() => {
    if (!selectedTimestamp) return;

    const loadSchema = async () => {
      setIsLoading(true)
      try {
        const res = await fetch('/api/history/load-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp: selectedTimestamp })
        })
        const result: LoadSummaryResponse = await res.json()

        if (result.success) {
          // 情况 A: 之前保存过沙盘布局
          if (result.existingLayout) {
            const restoredNodes = result.existingLayout.nodes.map((n) => ({
              ...n,
              data: {
                ...n.data,
                onColumnChange: handleColumnChange
              }
            }));
            setNodes(restoredNodes);
            setEdges(result.existingLayout.edges);
            toast({ title: "已恢复沙盘", description: "加载了上次保存的布局和映射" })
          }
          // 情况 B: 第一次进入
          else if (result.summary) {
            const initialNodes: SchemaNodeType[] = [];
            const activeTables = result.summary.filter(t => t.enabled !== false);

            activeTables.forEach((table, index) => {
              const col = index % 3;
              const row = Math.floor(index / 3);
              const X_OFFSET = 600;
              const Y_OFFSET = 600;

              initialNodes.push({
                id: table.tableName,
                type: 'schemaNode',
                position: { x: col * X_OFFSET, y: row * Y_OFFSET },
                data: {
                  tableName: table.tableName,
                  originalName: table.originalBaseName,
                  onColumnChange: handleColumnChange,
                  columns: table.headers.map((h: string) => ({
                    original: h,
                    dbField: '',
                    comment: h,
                    enabled: true
                  }))
                }
              });
            });
            setNodes(initialNodes);
            setEdges([]);
            toast({ title: "初始化成功", description: `加载了 ${activeTables.length} 张可用表格` })
          }
        } else {
            setNodes([]);
            setEdges([]);
            toast({ title: "无数据", description: "该版本下没有 Schema Summary 数据", variant: "destructive" });
        }
      } catch (error) {
        console.error(error)
        toast({ title: "加载失败", variant: "destructive" })
      } finally {
        setIsLoading(false)
      }
    }

    loadSchema();
  }, [selectedTimestamp, handleColumnChange, setNodes, setEdges, toast])

  // 4. 连线回调
  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      label: 'FK'
    }, eds)),
    [setEdges],
  );

  // 5. 校验逻辑
  const validateSchema = () => {
    const errors: string[] = [];

    nodes.forEach(node => {
      // 强制类型转换以访问 data
      const data = node.data as SchemaNodeData;

      data.columns.forEach(col => {
        // 只有当字段被启用，且 dbField 为空时才报错
        if (col.enabled && (!col.dbField || col.dbField.trim() === '')) {
          errors.push(`[${data.tableName}] 字段 "${col.original}" 未填写数据库字段名`);
        }
      });
    });

    return errors;
  }

  // 6. 点击保存按钮的处理
  const handleSaveClick = () => {
    const errors = validateSchema();

    if (errors.length > 0) {
      setValidationErrors(errors);
      setValidationDialogOpen(true);
    } else {
      // 如果没有错误，直接执行保存
      executeSave();
    }
  }

  // 7. 执行保存的逻辑
  const executeSave = async () => {
    if (!selectedTimestamp) return;

    // 关闭校验弹窗（如果是从弹窗确认进来的）
    setValidationDialogOpen(false);
    setIsSaving(true);

    try {
      const schemaData = {
        nodes: nodes.map(n => ({
          ...n,
          data: {
            ...n.data,
            onColumnChange: undefined
          }
        })),
        edges
      };

      const res = await fetch('/api/save-table-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: selectedTimestamp,
          schemaData
        })
      });

      if (res.ok) {
        toast({ title: "保存成功", description: "数据库映射关系已保存", className: "bg-green-100 border-green-200" });
      } else {
        toast({ title: "保存失败", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "保存出错", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* --- 校验警告弹窗 --- */}
      <AlertDialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              存在未完成的字段配置
            </AlertDialogTitle>
            <AlertDialogDescription>
              检测到以下已启用的字段尚未填写“数据库字段名”。
              未填写的字段可能导致生成的 SQL 无效。是否仍要强制保存？
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* 错误列表滚动区 */}
          <div className="my-4 max-h-[300px] overflow-y-auto border rounded-md bg-muted/30 p-4">
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {validationErrors.map((err, idx) => (
                <li key={idx} className="break-all">{err}</li>
              ))}
            </ul>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>取消 (去修改)</AlertDialogCancel>
            <AlertDialogAction onClick={executeSave} className="bg-amber-600 hover:bg-amber-700">
              忽略并强制保存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 顶部 Header 区 */}
      <div className="h-20 border-b bg-white px-6 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">表格沙盘</h2>
          <p className="text-xs text-muted-foreground">
            编辑表格字段、备注，并建立表格字段之间的外键关联 (Drag & Connect)
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">选择数据版本</label>
            <div className="flex items-center gap-2">
                <Select value={selectedTimestamp} onValueChange={setSelectedTimestamp} disabled={isLoading}>
                    <SelectTrigger className="w-[240px] h-9 font-mono text-xs">
                    <SelectValue placeholder={historyList.length > 0 ? "选择版本..." : "暂无保存的表结构"} />
                    </SelectTrigger>
                    <SelectContent>
                    {historyList.map(ts => (
                        <SelectItem key={ts} value={ts}>{ts}</SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                {isLoading && <Loader2 className="animate-spin text-primary h-4 w-4" />}
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>

          <Button
            onClick={handleSaveClick}
            disabled={isSaving || !selectedTimestamp || nodes.length === 0}
            className="min-w-[140px]"
          >
            {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            保存 Schema
          </Button>
        </div>
      </div>

      {/* 画布区域 */}
      <div className="flex-1 w-full h-full relative bg-slate-100">
        {nodes.length > 0 ? (
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
                maxZoom={1.5}
                defaultEdgeOptions={{ type: 'smoothstep' }}
            >
                <Background gap={24} size={1} color="#cbd5e1" />
                <Controls />
                <MiniMap style={{ height: 120 }} zoomable pannable />
            </ReactFlow>
        ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <div className="flex flex-col items-center gap-2">
                    <LayoutGrid size={48} strokeWidth={1} />
                    <p>
                        {historyList.length === 0
                            ? "暂无已保存的表结构，请先在“表格处理”中保存"
                            : "请选择一个数据版本以加载沙盘"}
                    </p>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}