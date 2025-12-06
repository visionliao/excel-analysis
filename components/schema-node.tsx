"use client"

import React, { memo } from 'react'
import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Database } from 'lucide-react'

// Postgres 数据类型集合 (下标即 value)
export const POSTGRES_TYPES = [
  "VARCHAR(255)", // 0
  "TEXT",         // 1
  "INTEGER",      // 2
  "DECIMAL(18,2)",// 3
  "BOOLEAN",      // 4
  "DATE",         // 5
  "TIMESTAMP",    // 6
  "BIGINT",       // 7
  "JSONB",        // 8
  "SERIAL"        // 9
];

// 使用 Base64 编码原始字段名，避免特殊字符导致 React Flow 报错
export const getSafeHandleId = (prefix: string, value: string) => {
  try {
    // 编码：处理中文和特殊字符
    const safeValue = btoa(unescape(encodeURIComponent(value)));
    return `${prefix}-${safeValue}`;
  } catch (e) {
    console.error("Handle ID generation failed", e);
    return `${prefix}-${Math.random().toString(36)}`;
  }
}

export interface ColumnMapping {
  original: string
  dbField: string
  comment: string
  dataType: number
  enabled: boolean
}

export interface SchemaNodeData extends Record<string, unknown> {
  tableName: string
  originalName: string
  columns: ColumnMapping[]
  onColumnChange: (tableName: string, colIndex: number, field: keyof ColumnMapping, value: any) => void
}

export type SchemaNodeType = Node<SchemaNodeData, 'schemaNode'>;

const SchemaNode = ({ data }: NodeProps<SchemaNodeType>) => {
  const { tableName, originalName, columns, onColumnChange } = data;

  return (
    <Card className="min-w-[520px] shadow-xl border-2 border-slate-200 bg-white">
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
        {/* 表头行 - 调整 grid 比例以容纳新列 */}
        <div className="grid grid-cols-[0.4fr_0.6fr_0.4fr_0.5fr_40px] gap-2 px-6 py-2 bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b">
          <div className="pl-2">原始字段</div>
          <div>数据库字段 (Editable)</div>
          <div>类型 (Select)</div>
          <div>备注 (Editable)</div>
          <div className="text-center">启用</div>
        </div>

        {/* 滚动容器 */}
        <div className="flex flex-col max-h-[400px] overflow-y-auto bg-white nodrag nowheel cursor-default relative">
          {columns.map((col, idx) => (
            <div
              key={`${tableName}-${idx}`}
              className={`relative group border-b last:border-0 transition-colors py-2 px-6 grid grid-cols-[0.4fr_0.6fr_0.4fr_0.5fr_40px] gap-2 items-center ${
                !col.enabled ? 'bg-slate-50 opacity-60' : 'hover:bg-blue-50/50'
              }`}
            >
              {/* 左侧连接点 */}
              <Handle
                type="source"
                position={Position.Left}
                id={getSafeHandleId('target', col.original)}
                isConnectable={col.enabled}
                className={`!w-3.5 !h-3.5 !border-2 !border-white transition-colors z-50 ${
                    col.enabled ? '!bg-slate-400 group-hover:!bg-blue-500 cursor-crosshair' : '!bg-slate-200'
                }`}
                style={{ left: '6px' }}
              />

              {/* 1. 原始字段 */}
              <div className="text-xs font-medium text-slate-700 truncate pl-2" title={col.original}>
                {col.original}
              </div>

              {/* 2. 数据库字段 */}
              <div className="relative">
                <Input
                  className="h-7 text-xs font-mono border-slate-200 focus-visible:ring-1"
                  value={col.dbField}
                  placeholder="field_name"
                  disabled={!col.enabled}
                  onChange={(e) => onColumnChange(tableName, idx, 'dbField', e.target.value)}
                />
              </div>

              {/* 3. 数据类型选择 */}
              <div className="relative">
                <select
                  className="h-7 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={col.dataType ?? 0} // 默认 0 (VARCHAR)
                  disabled={!col.enabled}
                  onChange={(e) => onColumnChange(tableName, idx, 'dataType', parseInt(e.target.value))}
                >
                  {POSTGRES_TYPES.map((type, typeIdx) => (
                    <option key={typeIdx} value={typeIdx}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. 备注 */}
              <Input
                className="h-7 text-xs border-slate-200 focus-visible:ring-1"
                value={col.comment}
                placeholder="备注说明"
                disabled={!col.enabled}
                onChange={(e) => onColumnChange(tableName, idx, 'comment', e.target.value)}
              />

              {/* 5. 开关 */}
              <div className="flex justify-center">
                <Switch
                  checked={col.enabled}
                  onCheckedChange={(val) => onColumnChange(tableName, idx, 'enabled', val)}
                  className="scale-75"
                />
              </div>

              {/* 右侧连接点 */}
              <Handle
                type="source"
                position={Position.Right}
                id={getSafeHandleId('source', col.original)}
                isConnectable={col.enabled}
                className={`!w-3.5 !h-3.5 !border-2 !border-white transition-colors z-50 ${
                    col.enabled ? '!bg-slate-400 group-hover:!bg-blue-500 cursor-crosshair' : '!bg-slate-200'
                }`}
                style={{ right: '6px' }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default memo(SchemaNode)