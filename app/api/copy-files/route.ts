import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(request: NextRequest) {
  try {
    const { files } = await request.json()

    if (!files || !Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid files data' }, { status: 400 })
    }

    // Create timestamp for output directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const outputDir = join(process.cwd(), 'output', 'source', timestamp)

    // Ensure output directory exists
    try {
      await mkdir(outputDir, { recursive: true })
    } catch (error) {
      console.error('Error creating output directory:', error)
      return NextResponse.json({ error: 'Failed to create output directory' }, { status: 500 })
    }

    const copyPromises = files.map(async (fileItem: { name: string; data: string; relativePath?: string }) => {
      try {
        // Create subdirectory if relativePath is provided
        let targetDir = outputDir
        if (fileItem.relativePath) {
          // Remove filename from relativePath to get directory path
          const dirPath = fileItem.relativePath.substring(0, fileItem.relativePath.lastIndexOf('/'))
          if (dirPath) {
            targetDir = join(outputDir, dirPath)
            // Ensure subdirectory exists
            await mkdir(targetDir, { recursive: true })
          }
        }

        // Write file to target location
        const targetPath = join(targetDir, fileItem.name)
        const buffer = Buffer.from(fileItem.data, 'base64')
        await writeFile(targetPath, buffer)

        return {
          success: true,
          originalName: fileItem.name,
          targetPath: targetPath
        }
      } catch (error) {
        console.error(`Error copying file ${fileItem.name}:`, error)
        return {
          success: false,
          originalName: fileItem.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    const results = await Promise.all(copyPromises)

    // Count successful and failed copies
    const successCount = results.filter(r => r.success).length
    const failureCount = results.length - successCount

    return NextResponse.json({
      success: true,
      message: `Successfully copied ${successCount} files to ${outputDir}`,
      outputDirectory: outputDir,
      results: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        details: results
      }
    })

  } catch (error) {
    console.error('Error in file copy API:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}