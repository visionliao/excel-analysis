"use client"

import type React from "react"

import { useState, useCallback, useRef } from "react"
import { FolderOpen, FileText, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface FileItem {
  id: string
  name: string
  file?: File
}

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"]

function isAllowedFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = []
  const reader = entry.createReader()

  const readEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
  }

  let entries = await readEntries()
  while (entries.length > 0) {
    for (const e of entries) {
      if (e.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          ;(e as FileSystemFileEntry).file(resolve, reject)
        })
        if (isAllowedFile(file.name)) {
          files.push(file)
        }
      } else if (e.isDirectory) {
        const subFiles = await readDirectoryEntries(e as FileSystemDirectoryEntry)
        files.push(...subFiles)
      }
    }
    entries = await readEntries()
  }
  return files
}

interface FileUploadAreaProps {
  files: FileItem[]
  onFilesChange: (files: FileItem[]) => void
}

export function FileUploadArea({ files, onFilesChange }: FileUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const items = Array.from(e.dataTransfer.items)
      const allFiles: File[] = []

      for (const item of items) {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => {
              ;(entry as FileSystemFileEntry).file(resolve, reject)
            })
            if (isAllowedFile(file.name)) {
              allFiles.push(file)
            }
          } else if (entry.isDirectory) {
            const dirFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
            allFiles.push(...dirFiles)
          }
        }
      }

      const newFiles = allFiles.map((file, index) => ({
        id: `file-${Date.now()}-${index}`,
        name: file.name,
        file,
      }))
      onFilesChange([...files, ...newFiles])
    },
    [files, onFilesChange],
  )

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || [])
      const filteredFiles = selectedFiles.filter((file) => isAllowedFile(file.name))
      const newFiles = filteredFiles.map((file, index) => ({
        id: `file-${Date.now()}-${index}`,
        name: file.name,
        file,
      }))
      onFilesChange([...files, ...newFiles])
      e.target.value = ""
    },
    [files, onFilesChange],
  )

  const handleClearFiles = useCallback(() => {
    onFilesChange([])
  }, [onFilesChange])

  const handleRemoveFile = useCallback(
    (id: string) => {
      onFilesChange(files.filter((file) => file.id !== id))
    },
    [files, onFilesChange],
  )

  return (
    <div className="max-w-4xl">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        // @ts-expect-error - webkitdirectory is not in the types
        webkitdirectory=""
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">文件列表</h2>
          <p className="text-muted-foreground mt-1">选择文件或文件夹进行处理</p>
        </div>
        <Button variant="outline" onClick={handleFileSelect} className="gap-2 bg-transparent">
          <Upload size={16} />
          选择文件
        </Button>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer",
          isDragging ? "border-primary bg-accent" : "border-border hover:border-muted-foreground/50",
        )}
        onClick={handleFileSelect}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="p-4 rounded-lg bg-muted">
            <FolderOpen size={40} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-muted-foreground">拖拽文件或文件夹到此处，或点击上方按钮</p>
            <p className="text-sm text-muted-foreground/70 mt-1">支持 .xlsx, .xls, .csv 格式</p>
          </div>
        </div>
      </div>

      {/* Selected Files */}
      {files.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium text-foreground">已选择的文件 ({files.length})</h3>
            <button
              onClick={handleClearFiles}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              清除
            </button>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border max-h-80 overflow-auto">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 group">
                <FileText size={18} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{file.name}</span>
                <button
                  onClick={() => handleRemoveFile(file.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity"
                >
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={() => console.log("开始数据分析", files)}>数据分析</Button>
          </div>
        </div>
      )}
    </div>
  )
}
