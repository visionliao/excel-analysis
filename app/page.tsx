"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { FileUploadArea, type FileItem } from "@/components/excel-data-analysis"
import { TableAnalysisPanel } from "@/components/data-export"
import { GuidePanel } from "@/components/guide-panel"
import { GroupedTableData, SavedSchemaItem } from "@/components/data-structure-display"

export default function Home() {
  const [activeMenu, setActiveMenu] = useState("table-process")
  const [files, setFiles] = useState<FileItem[]>([])
  const [parsedData, setParsedData] = useState<GroupedTableData[]>([])
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('')
  const [savedSchema, setSavedSchema] = useState<SavedSchemaItem[] | null>(null)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeItem={activeMenu} onMenuChange={setActiveMenu} />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-full">
          {activeMenu === "table-process" && (
            <FileUploadArea
              files={files}
              onFilesChange={setFiles}

              // 3. 将状态和设置方法传递给子组件
              parsedData={parsedData}
              setParsedData={setParsedData}
              currentTimestamp={currentTimestamp}
              setCurrentTimestamp={setCurrentTimestamp}
              savedSchema={savedSchema}
              setSavedSchema={setSavedSchema}
            />
          )}
          {activeMenu === "table-analysis" && <TableAnalysisPanel files={files} />}
          {activeMenu === "guide" && <GuidePanel />}
        </div>
      </main>
    </div>
  )

}
