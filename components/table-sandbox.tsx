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
  NodeTypes,
  Node,
  ConnectionMode
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
import SchemaNode, { SchemaNodeType, SchemaNodeData } from './schema-node'

// 定义字段映射的结构
interface FieldMappingItem {
  original: string
  dbField: string
  comment: string
}

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
    relationships?: any[]
  }
  fieldMapping?: Record<string, FieldMappingItem[]>
}

export function TableSandbox() {
  const { toast } = useToast()

  const nodeTypes = useMemo<NodeTypes>(() => ({
    schemaNode: SchemaNode,
  }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [historyList, setHistoryList] = useState<string[]>([])
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 校验状态
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // 字符串标准化辅助函数
  // 用于消除换行符、多余空格的影响，确保 "订单号\nNO." 能匹配 "订单号 NO."
  const normalizeHeader = useCallback((str: string) => {
    if (!str) return '';
    return String(str)
      .replace(/[\r\n]+/g, ' ') // 1. 换行符变空格
      .replace(/\s+/g, ' ')     // 2. 多个连续空格变单个空格
      .trim();                  // 3. 去除首尾空格
  }, []);

  // 1. 初始化列表
  useEffect(() => {
    fetch('/api/schema/list')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.timestamps.length > 0) {
          setHistoryList(data.timestamps)
          setSelectedTimestamp(data.timestamps[0])
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

        const currentData = node.data;
        const newColumns = [...currentData.columns];

        // @ts-ignore
        newColumns[colIndex] = {
          ...newColumns[colIndex],
          [field]: value
        };

        return {
          ...node,
          data: {
            ...currentData,
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
          // 情况 A: 之前保存过沙盘布局 (table_schema.json) -> 直接恢复，忽略默认映射
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
          // 情况 B: 第一次初始化 (从 schema_summary.json) -> 使用 fieldMapping 自动填充
          else if (result.summary) {
            const initialNodes: SchemaNodeType[] = [];
            const activeTables = result.summary.filter(t => t.enabled !== false);
            const mappingData = result.fieldMapping || {};

            if (activeTables.length === 0) {
              toast({ title: "无可用数据", description: "该版本没有启用的表格", variant: "destructive" });
              setNodes([]);
              return;
            }

            activeTables.forEach((table, index) => {
              const col = index % 3;
              const row = Math.floor(index / 3);
              const X_OFFSET = 650;
              const Y_OFFSET = 600;
              // 获取该表对应的字段映射列表
              const tableMappings = mappingData[table.tableName] || [];

              initialNodes.push({
                id: table.tableName,
                type: 'schemaNode',
                position: { x: col * X_OFFSET, y: row * Y_OFFSET },
                data: {
                  tableName: table.tableName,
                  originalName: table.originalBaseName,
                  onColumnChange: handleColumnChange,
                  // 初始化字段：尝试从 mappingData 中查找
                  columns: table.headers.map((h: string) => {
                    const normalizedH = normalizeHeader(h);
                    // 在映射配置中查找当前字段
                    const matchedField = tableMappings.find(m =>
                      normalizeHeader(m.original) === normalizedH
                    );

                    return {
                      original: h,
                      // 如果找到映射，填充 dbField，否则留空
                      dbField: matchedField ? matchedField.dbField : '',
                      // 如果找到映射，使用映射的 comment，否则使用原始列名
                      comment: matchedField ? matchedField.comment : normalizedH,
                      enabled: true
                    };
                  })
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
            toast({ title: "加载失败", description: "未找到表结构定义文件", variant: "destructive" });
        }
      } catch (error) {
        console.error(error)
        toast({ title: "请求出错", variant: "destructive" })
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
      style: { stroke: '#2563eb', strokeWidth: 4 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      label: 'FK'
    }, eds)),
    [setEdges],
  );

  // 5. 校验逻辑
  const validateSchema = () => {
    const errors: string[] = [];
    nodes.forEach(node => {
      const data = node.data;
      data.columns.forEach(col => {
        // 如果字段启用，但没有填数据库字段名，报错
        if (col.enabled && (!col.dbField || col.dbField.trim() === '')) {
          errors.push(`[${data.tableName}] 字段 "${col.original}" 未填写数据库字段名`);
        }
      });
    });
    return errors;
  }

  const handleSaveClick = () => {
    const errors = validateSchema();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setValidationDialogOpen(true);
    } else {
      executeSave();
    }
  }

  // 解码 Handle ID (去除前缀并 Base64 解码)
  const decodeHandleId = (handleId: string | null | undefined): string => {
    if (!handleId) return '';
    try {
      // Handle ID 格式: "source-BASE64" 或 "target-BASE64"
      const parts = handleId.split('-');
      if (parts.length < 2) return handleId;
      const base64Str = parts[1];
      return decodeURIComponent(escape(atob(base64Str)));
    } catch (e) {
      console.error("Failed to decode handle ID", handleId, e);
      return handleId;
    }
  }

  // 6. 保存逻辑
  const executeSave = async () => {
    if (!selectedTimestamp) return;
    setValidationDialogOpen(false);
    setIsSaving(true);

    try {
      // A. 解析关系 (Relationships)
      // 遍历所有连线，找到对应的 Source 表/字段 和 Target 表/字段
      const relationships = edges.map(edge => {
        // 1. 找 Source Node
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);

        // 2. 解码 Handle ID 得到原始字段名
        const sourceOriginalField = decodeHandleId(edge.sourceHandle);
        const targetOriginalField = decodeHandleId(edge.targetHandle);

        // 3. 在 Node Data 中找到对应的 Column 配置 (为了获取 dbField)
        const sourceCol = sourceNode?.data.columns.find(c => c.original === sourceOriginalField);
        const targetCol = targetNode?.data.columns.find(c => c.original === targetOriginalField);

        return {
          sourceTable: edge.source,
          sourceOriginalField: sourceOriginalField,
          sourceDbField: sourceCol?.dbField || '', // 这里就是你想要的数据库字段名
          targetTable: edge.target,
          targetOriginalField: targetOriginalField,
          targetDbField: targetCol?.dbField || '', // 这里就是你想要的数据库字段名
          edgeId: edge.id
        };
      });

      // B. 准备保存数据
      const schemaData = {
        nodes: nodes.map(n => ({
          ...n,
          data: {
            ...n.data,
            onColumnChange: undefined // 剥离函数
          }
        })),
        edges, // 保存原始连线用于恢复画布
        relationships // 保存解析后的业务关系用于建表
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
        toast({ title: "保存成功", description: "数据库映射及关系已生成", className: "bg-green-100 border-green-200" });
      } else {
        toast({ title: "保存失败", variant: "destructive" });
      }
    } catch (error) {
      console.error(error);
      toast({ title: "保存出错", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 校验弹窗 */}
      <AlertDialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              存在未完成的字段配置
            </AlertDialogTitle>
            <AlertDialogDescription>
              检测到以下已启用的字段尚未填写“数据库字段名”。
              这会导致生成的建表语句不完整。是否仍要强制保存？
            </AlertDialogDescription>
          </AlertDialogHeader>
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

      {/* 顶部 Header */}
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

      {/* 画布 */}
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
                defaultEdgeOptions={{
                  type: 'smoothstep',
                  style: { strokeWidth: 4, stroke: '#2563eb' }, // 加粗
                  animated: true // 让默认线也动起来
                }}
                connectionMode={ConnectionMode.Loose}
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