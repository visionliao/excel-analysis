"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { FileUploadArea, type FileItem } from "@/components/excel-data-analysis"
import { TableExportPanel } from "@/components/data-export"
import { GuidePanel } from "@/components/guide-panel"
import { GroupedTableData, SavedSchemaItem } from "@/components/data-structure-display"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { TableSandbox } from "@/components/table-sandbox"
import { cn } from "@/lib/utils" // 引入 cn 工具函数

export default function Home() {
  const { toast } = useToast()
  const [activeMenu, setActiveMenu] = useState("table-process")

  // 全局状态
  const [files, setFiles] = useState<FileItem[]>([])
  const [parsedData, setParsedData] = useState<GroupedTableData[]>([])
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('')
  const [savedSchema, setSavedSchema] = useState<SavedSchemaItem[] | null>(null)

  // 页面初始化加载状态
  const [isInitializing, setIsInitializing] = useState(true)

  // 初始化：检查并加载最新历史记录
  useEffect(() => {
    const initData = async () => {
      try {
        // 1. 获取历史列表 (source)
        const listRes = await fetch('/api/history/list');
        const listData = await listRes.json();

        if (listData.success && listData.timestamps && listData.timestamps.length > 0) {
          const latestTimestamp = listData.timestamps[0];

          console.log(`[AutoLoad] Found latest history: ${latestTimestamp}`);

          // 2. 加载最新数据
          const loadRes = await fetch('/api/history/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: latestTimestamp })
          });
          const result = await loadRes.json();

          if (result.success) {
            // 3. 恢复解析数据和配置
            setParsedData(result.data);
            setCurrentTimestamp(result.timestamp);
            setSavedSchema(result.savedSchema);

            // 4. 恢复文件列表
            if (result.fileList && Array.isArray(result.fileList)) {
              const restoredFiles: FileItem[] = result.fileList.map((path: string, idx: number) => ({
                id: `history-${idx}`,
                name: path.split('/').pop() || path,
                relativePath: path,
              }));
              setFiles(restoredFiles);
            }

            toast({
              title: "自动加载成功",
              description: `已恢复 ${latestTimestamp} 的处理现场`,
            });
          }
        }
      } catch (error) {
        console.error("Auto load failed", error);
      } finally {
        setIsInitializing(false);
      }
    };

    initData();
  }, []);

  if (isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">正在恢复上次工作现场...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeItem={activeMenu} onMenuChange={setActiveMenu} />

      {/*
         动态调整布局样式：
         如果是沙盘模式：移除 padding，隐藏 overflow (交给 React Flow 接管)
         如果是其他模式：保留 padding 和 overflow-auto
      */}
      <main className={cn(
        "flex-1",
        activeMenu === "table-sandbox"
          ? "overflow-hidden p-0" // 沙盘模式：全屏，无边距
          : "overflow-auto p-4 md:p-6 lg:p-8" // 普通模式：有边距，可滚动
      )}>
        <div className="w-full h-full max-w-full">
          {activeMenu === "table-process" && (
            <FileUploadArea
              files={files}
              onFilesChange={setFiles}
              // 传递状态
              parsedData={parsedData}
              setParsedData={setParsedData}
              currentTimestamp={currentTimestamp}
              setCurrentTimestamp={setCurrentTimestamp}
              savedSchema={savedSchema}
              setSavedSchema={setSavedSchema}
            />
          )}
          {activeMenu === "table-sandbox" && <TableSandbox />}
          {activeMenu === "table-export" && <TableExportPanel files={files} />}
          {activeMenu === "guide" && <GuidePanel />}
        </div>
      </main>
    </div>
  )
}