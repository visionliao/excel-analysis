"use client"

import type React from "react"

import { useState, useCallback, useRef } from "react"
import { FolderOpen, FileText, Upload, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { SmartDataDisplay, GroupedTableData } from "./data-structure-display"

// 导出 FileItem 接口供父组件使用
export interface FileItem {
  id: string
  name: string
  file?: File
  relativePath?: string 
}

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"]

function isAllowedFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry, basePath = ""): Promise<{ file: File; relativePath: string }[]> {
  const files: { file: File; relativePath: string }[] = []
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
          const relativePath = basePath ? `${basePath}/${file.name}` : file.name
          files.push({ file, relativePath })
        }
      } else if (e.isDirectory) {
        const newBasePath = basePath ? `${basePath}/${e.name}` : e.name
        const subFiles = await readDirectoryEntries(e as FileSystemDirectoryEntry, newBasePath)
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

// 组件名改回 FileUploadArea
export function FileUploadArea({ files, onFilesChange }: FileUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  
  // 数据状态
  const [parsedData, setParsedData] = useState<GroupedTableData[]>([])
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('')
  // 保存过的配置状态
  const [savedSchema, setSavedSchema] = useState<any>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

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
      const allFileData: { file: File; relativePath: string }[] = []

      for (const item of items) {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => {
              ;(entry as FileSystemFileEntry).file(resolve, reject)
            })
            if (isAllowedFile(file.name)) {
              allFileData.push({ file, relativePath: file.name })
            }
          } else if (entry.isDirectory) {
            const dirFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry, entry.name)
            allFileData.push(...dirFiles)
          }
        }
      }

      const newFiles = allFileData.map(({ file, relativePath }, index) => ({
        id: `file-${Date.now()}-${index}`,
        name: file.name,
        file,
        relativePath,
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
        relativePath: file.name, // For individual files, the relative path is just the filename
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

  const handleDataAnalysis = useCallback(async () => {
    if (files.length === 0) {
      toast({
        title: "没有选择文件",
        description: "请先选择要分析的文件",
        variant: "destructive",
      })
      return
    }

    setIsCopying(true)

    try {
      // Convert files to base64 for transmission
      const filesWithBase64 = await Promise.all(
        files.map(async (fileItem) => {
          if (!fileItem.file) {
            throw new Error(`File ${fileItem.name} is not available`)
          }

          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(fileItem.file!)
          })

          // Remove the data URL prefix to get pure base64
          const base64Data = base64.split(',')[1]

          return {
            name: fileItem.name,
            data: base64Data,
            relativePath: fileItem.relativePath || fileItem.name,
          }
        })
      )

      // Call the API to copy files
      const response = await fetch('/api/copy-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: filesWithBase64 }),
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "解析成功",
          description: `成功解析并合并为 ${result.data?.length || 0} 个逻辑表`,
        })
        
        // 更新数据状态
        if (result.data && result.data.length > 0) {
          setParsedData(result.data)
        }
        
        // 更新时间戳
        if (result.timestamp) {
          setCurrentTimestamp(result.timestamp)
        }

        // 新解析的文件，肯定没有保存过 Schema，重置为空
        setSavedSchema(null)

      } else {
        toast({
          title: "解析失败",
          description: result.error || "复制文件时发生错误",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error during data analysis:', error)
      toast({
        title: "解析过程中发生错误",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      })
    } finally {
      setIsCopying(false)
    }
  }, [files, toast])

  return (
    <div className="w-full max-w-none xl:max-w-7xl 2xl:max-w-[90rem] mx-auto">
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
            <Button
              onClick={handleDataAnalysis}
              disabled={isCopying || files.length === 0}
              className="gap-2"
            >
              {isCopying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <FileText size={16} />
                  数据分析
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Display parsed data structure */}
      {parsedData.length > 0 && (
        <SmartDataDisplay 
          groupedData={parsedData} 
          currentTimestamp={currentTimestamp}
          savedSchemaConfig={savedSchema}
          onDataReload={(data, ts, config) => {
            setParsedData(data)
            setCurrentTimestamp(ts)
            setSavedSchema(config)
          }}
        />
      )}
    </div>
  )
}