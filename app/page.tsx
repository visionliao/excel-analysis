"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { FileUploadArea, type FileItem } from "@/components/file-upload-area"
import { TableAnalysisPanel } from "@/components/table-analysis-panel"
import { GuidePanel } from "@/components/guide-panel"

export default function Home() {
  const [activeMenu, setActiveMenu] = useState("table-process")
  const [files, setFiles] = useState<FileItem[]>([])

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeItem={activeMenu} onMenuChange={setActiveMenu} />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-full">
          {activeMenu === "table-process" && <FileUploadArea files={files} onFilesChange={setFiles} />}
          {activeMenu === "table-analysis" && <TableAnalysisPanel files={files} />}
          {activeMenu === "guide" && <GuidePanel />}
        </div>
      </main>
    </div>
  )
}
