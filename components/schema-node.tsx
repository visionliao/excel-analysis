"use client"

import React, { memo } from 'react'
import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Database } from 'lucide-react'

// 1. 定义每列的数据结构
export interface ColumnMapping {
  original: string
  dbField: string
  comment: string
  enabled: boolean
}

// 2. 定义节点 data 的内部结构
export interface SchemaNodeData extends Record<string, unknown> {
  tableName: string
  originalName: string
  columns: ColumnMapping[]
  onColumnChange: (tableName: string, colIndex: number, field: keyof ColumnMapping, value: any) => void
}

// 3. 定义完整的节点类型
// 这告诉 TS：这是一个类型为 'schemaNode' 的节点，它的 data 符合 SchemaNodeData 结构
export type SchemaNodeType = Node<SchemaNodeData, 'schemaNode'>;

// 4. 组件定义
// 使用 NodeProps<SchemaNodeType> 来获得精确的类型推断
const SchemaNode = ({ data }: NodeProps<SchemaNodeType>) => {
  // 这里 data 会自动推断为 SchemaNodeData，不需要强转了
  const { tableName, originalName, columns, onColumnChange } = data;

  return (
    <Card className="min-w-[500px] shadow-xl border-2 border-slate-200 bg-white">
      {/* 1. 表头 */}
      <CardHeader className="py-3 px-4 bg-slate-100 border-b flex flex-row items-center justify-between space-y-0 cursor-move">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-bold font-mono text-primary flex items-center gap-2">
            <Database size={14} />
            {tableName}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{originalName}</span>
        </div>
        <Badge variant="outline" className="bg-white text-xs">
          {columns.length} 字段
        </Badge>
      </CardHeader>

      {/* 2. 字段列表 */}
      <CardContent className="p-0">
        {/* 表头行 */}
        <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_40px] gap-2 px-4 py-2 bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b">
          <div>原始字段</div>
          <div>数据库字段 (Editable)</div>
          <div>备注 (Editable)</div>
          <div className="text-center">启用</div>
        </div>

        <div className="flex flex-col max-h-[400px] overflow-y-auto bg-white nodrag nowheel cursor-default">
          {columns.map((col, idx) => (
            <div
              key={`${tableName}-${idx}`}
              className={`relative group border-b last:border-0 transition-colors py-2 px-4 grid grid-cols-[1.5fr_1.5fr_1.5fr_40px] gap-2 items-center ${
                !col.enabled ? 'bg-slate-50 opacity-60' : 'hover:bg-blue-50/50'
              }`}
            >

              {/* 左侧连接点 (Target) */}
              <Handle
                type="target"
                position={Position.Left}
                id={`target-${col.original}`}
                className="!w-3 !h-3 !bg-slate-400 group-hover:!bg-blue-500"
                style={{ left: '-6px' }}
              />

              {/* 1. 原始字段名 */}
              <div className="text-xs font-medium text-slate-700 truncate" title={col.original}>
                {col.original}
              </div>

              {/* 2. 数据库字段名 (可编辑) */}
              <div className="relative">
                <Input
                  className="h-7 text-xs font-mono border-slate-200 focus-visible:ring-1"
                  value={col.dbField}
                  placeholder="field_name"
                  disabled={!col.enabled}
                  onChange={(e) => onColumnChange(tableName, idx, 'dbField', e.target.value)}
                />
              </div>

              {/* 3. 备注 (可编辑) */}
              <Input
                className="h-7 text-xs border-slate-200 focus-visible:ring-1"
                value={col.comment}
                placeholder="备注说明"
                disabled={!col.enabled}
                onChange={(e) => onColumnChange(tableName, idx, 'comment', e.target.value)}
              />

              {/* 4. 启用开关 */}
              <div className="flex justify-center">
                <Switch
                  checked={col.enabled}
                  onCheckedChange={(val) => onColumnChange(tableName, idx, 'enabled', val)}
                  className="scale-75"
                />
              </div>

              {/* 右侧连接点 (Source) */}
              <Handle
                type="source"
                position={Position.Right}
                id={`source-${col.original}`}
                className="!w-3 !h-3 !bg-slate-400 group-hover:!bg-blue-500"
                style={{ right: '-6px' }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default memo(SchemaNode)