"use client"

import { 
  BookOpen, FileSpreadsheet, Grid3X3, Database, ServerCog, 
  Settings, AlertTriangle, CheckCircle2, ArrowRight, RefreshCcw, Trash2, Info
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function GuidePanel() {
  return (
    <div className="w-full max-w-none xl:max-w-7xl 2xl:max-w-[90rem] mx-auto pb-20">
      
      {/* 头部标题 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="text-primary" />
          使用说明手册
        </h2>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          本工具是一个完整的 Excel 数据 ETL (Extract, Transform, Load) 解决方案，请按照以下流程操作。
        </p>
      </div>

      <div className="grid gap-8">
        
        {/* 0. 环境配置 */}
        <Card className="border-l-4 border-l-slate-500 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-slate-500" />
              0. 环境配置 (系统管理员)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>在开始之前，请确保项目根目录下的 <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">.env</code> 文件已正确配置：</p>
            <ul className="grid gap-2 border rounded-md p-4 bg-slate-50/50">
              <li className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Badge variant="outline" className="font-mono bg-white">POSTGRES_URL</Badge>
                <span>配置 PostgreSQL 数据库连接字符串（如 postgresql://user:pass@localhost:5432/db）。</span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Badge variant="outline" className="font-mono bg-white">DB_UPDATE_STRATEGY</Badge>
                <span>
                  决定导出数据的策略。可选值：
                  <code className="text-foreground bg-slate-200 px-1 rounded ml-1">incremental</code> (推荐) 或 
                  <code className="text-foreground bg-slate-200 px-1 rounded ml-1">overwrite</code>。
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* 1. 表格处理 */}
        <Card className="border-l-4 border-l-green-500 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              1. 表格处理 (数据清洗与归档)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              这是数据录入的第一步。系统会对上传的原始 Excel/CSV 文件进行智能解析、去重和标准化处理。
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> 支持格式
                </h4>
                <div className="flex gap-2">
                  <Badge variant="secondary">.xlsx</Badge>
                  <Badge variant="secondary">.xls</Badge>
                  <Badge variant="secondary">.csv</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">支持文件夹拖拽上传，系统会自动按文件名自然排序解析，确保数据顺序一致。</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-green-600" /> 关键操作
                </h4>
                <p className="text-sm">
                  点击 <strong>“保存表结构”</strong> 按钮。系统会生成一个唯一的 <span className="font-mono text-xs bg-slate-200 px-1 rounded">时间戳版本</span>，将清洗后的干净数据归档，供后续步骤使用。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. 表格沙盘 */}
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Grid3X3 className="h-5 w-5 text-blue-600" />
              2. 表格沙盘 (Schema 设计)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              可视化配置数据库结构。您可以决定哪些字段需要入库，以及它们对应的数据类型。
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside bg-muted/30 p-4 rounded-lg border">
              <li><strong className="text-foreground">版本选择</strong>：首先选择上一步生成的“时间戳版本”来加载表结构。</li>
              <li><strong className="text-foreground">字段映射</strong>：修改“数据库字段名(英文)”，设置“数据类型”(如 VARCHAR, DECIMAL, DATE)。</li>
              <li><strong className="text-foreground">外键关联</strong>：通过拖拽字段上的连接点，建立表与表之间的关联关系（将在导出后建立物理约束）。</li>
              <li><strong className="text-foreground">保存设计</strong>：配置完成后，点击保存，生成 <code className="text-xs">table_schema.json</code> 描述文件。</li>
            </ul>
          </CardContent>
        </Card>

        {/* 3. 导出数据 */}
        <Card className="border-l-4 border-l-purple-500 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5 text-purple-600" />
              3. 导出数据 (策略选择)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              系统将根据 <code className="bg-slate-100 px-1 rounded">.env</code> 配置的策略执行数据写入。
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* 增量模式 */}
              <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-bl">推荐</div>
                <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" /> 策略 A：增量更新
                </h4>
                <div className="text-xs text-blue-800 space-y-2">
                  <p><span className="font-mono bg-white/50 px-1 rounded">DB_UPDATE_STRATEGY=incremental</span></p>
                  <ul className="list-disc list-inside space-y-1 opacity-90">
                    <li><strong>智能比对</strong>：系统根据行号与数据库 ID 进行对齐。</li>
                    <li><strong>无损更新</strong>：仅插入新增行，或更新内容变动的行。</li>
                    <li><strong>数据保留</strong>：旧的、未变动的数据保持原样，不会丢失。</li>
                  </ul>
                </div>
              </div>

              {/* 全量模式 */}
              <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-bl">兜底</div>
                <h4 className="font-medium text-orange-900 mb-2 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> 策略 B：全量覆盖
                </h4>
                <div className="text-xs text-orange-800 space-y-2">
                  <p><span className="font-mono bg-white/50 px-1 rounded">DB_UPDATE_STRATEGY=overwrite</span></p>
                  <ul className="list-disc list-inside space-y-1 opacity-90">
                    <li><strong>暴力重置</strong>：每次导出都会先 <code className="font-mono">DROP TABLE</code> 删除旧表。</li>
                    <li><strong>全新重建</strong>：重新建表并插入所有数据。</li>
                    <li><strong>副作用</strong>：自增 ID 会重置，依赖该表的外部数据可能会失效。</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg border text-sm text-muted-foreground mt-2">
                <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5 text-primary" />
                    <span>
                        无论哪种模式，系统都内置了<strong>自动容错</strong>功能：在写入数据库前，会自动修复 Excel 中不标准的日期格式（如截断的时间、非标准分隔符），并强制去时区化，确保数据与源文件完全一致。
                    </span>
                </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. 数据库操作 */}
        <Card className="border-l-4 border-l-orange-500 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ServerCog className="h-5 w-5 text-orange-600" />
              4. 数据库操作 (运维与验证)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
             <p className="text-sm text-muted-foreground leading-relaxed">
              用于验证导入结果或清理环境。该面板直接操作真实数据库。
            </p>
            <div className="grid gap-2 text-sm text-muted-foreground">
               <div className="flex items-start gap-2">
                 <div className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                 <span><strong>数据查询</strong>：分页查看所有表的真实入库数据，验证时间格式和精度。</span>
               </div>
               <div className="flex items-start gap-2">
                 <div className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                 <span><strong>清空表</strong>：当某张表数据污染严重时，可单独清空该表。</span>
               </div>
               <div className="flex items-start gap-2">
                 <div className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                 <span><strong>清空全部</strong>：<span className="text-red-500 font-bold">危险操作！</span>将删除 Schema 中定义的所有表及级联数据。</span>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* 常见问题 */}
        <div className="mt-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" /> 注意事项
            </h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3 text-sm text-amber-900">
                <p>
                    <strong>1. 为什么“检查差异”显示有新增，但我没改过文件？</strong><br/>
                    请检查数据库中的数据是否曾被手动修改过，或者是否有时区导致的日期显示差异（本系统已内置自动时区对齐）。
                </p>
                <Separator className="bg-amber-200" />
                <p>
                    <strong>2. 什么是“结构变更”？</strong><br/>
                    如果在沙盘中修改了字段类型、删除了字段，或修改了字段名，系统会判定为结构变更。此时无论处于何种模式，该表都必须被 <strong>DROP（删除）</strong> 并重建。
                </p>
                <Separator className="bg-amber-200" />
                <p>
                    <strong>3. 导出报错提示 "数据校验失败"？</strong><br/>
                    系统内置了严格的类型校验。如果 Excel 中的数据（如 "1)"）无法转换为目标类型（如 DECIMAL），导出将终止并弹窗提示具体的行号和错误值。请回到 Excel 修正源数据，或在沙盘中调整字段类型。
                </p>
            </div>
        </div>

      </div>
    </div>
  )
}