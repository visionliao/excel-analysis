"use client"

import { cn } from "@/lib/utils"
import { Table2, Database, BookOpen, PanelLeftClose, PanelLeft, Grid3X3 } from "lucide-react"
import { useState } from "react"

const menuItems = [
  { icon: Table2, label: "表格处理", id: "table-process" },
  { icon: Grid3X3, label: "表格沙盘", id: "table-sandbox" },
  { icon: Database, label: "导出数据", id: "table-export" },
  { icon: BookOpen, label: "使用说明", id: "guide" },
]

interface SidebarProps {
  activeItem: string
  onMenuChange: (id: string) => void
}

export function Sidebar({ activeItem, onMenuChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64 md:w-72 lg:w-80",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div className={cn("flex flex-col", collapsed && "hidden")}>
          <h1 className="text-lg font-bold text-foreground">Excel-Analysis</h1>
          <p className="text-sm text-amber-600">Excel表格处理工具</p>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md hover:bg-accent text-muted-foreground"
        >
          {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 p-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.id
          return (
            <button
              key={item.id}
              onClick={() => onMenuChange(item.id)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
              )}
            >
              <Icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
