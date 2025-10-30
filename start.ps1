# AI 旅行规划师 - 启动脚本
# 此脚本将自动启动前端和后端服务

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  AI 旅行规划师 - 项目启动工具" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 检查环境变量是否配置
Write-Host "🔍 检查配置文件..." -ForegroundColor Yellow

$backendEnv = ".\backend\.env"
$frontendEnv = ".\frontend\.env"

if (-not (Test-Path $backendEnv)) {
    Write-Host "❌ 错误: 后端 .env 文件不存在！" -ForegroundColor Red
    Write-Host "   请先复制 backend\.env.example 为 backend\.env 并填写配置" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $frontendEnv)) {
    Write-Host "❌ 错误: 前端 .env 文件不存在！" -ForegroundColor Red
    Write-Host "   请先复制 frontend\.env.example 为 frontend\.env 并填写配置" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 配置文件检查通过" -ForegroundColor Green
Write-Host ""

# 检查 Node.js 是否安装
Write-Host "🔍 检查 Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 错误: 未安装 Node.js！" -ForegroundColor Red
    Write-Host "   请访问 https://nodejs.org/ 下载并安装 Node.js" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 检查依赖是否安装
Write-Host "🔍 检查项目依赖..." -ForegroundColor Yellow

if (-not (Test-Path ".\backend\node_modules")) {
    Write-Host "⚠️  后端依赖未安装，正在安装..." -ForegroundColor Yellow
    Push-Location backend
    npm install
    Pop-Location
}

if (-not (Test-Path ".\frontend\node_modules")) {
    Write-Host "⚠️  前端依赖未安装，正在安装..." -ForegroundColor Yellow
    Push-Location frontend
    npm install
    Pop-Location
}

Write-Host "✅ 依赖检查完成" -ForegroundColor Green
Write-Host ""

# 启动后端服务
Write-Host "🚀 正在启动后端服务..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList '-NoExit', '-Command', "cd '$PWD\backend'; Write-Host '🔧 后端服务器启动中...' -ForegroundColor Cyan; node src/index.js"

# 等待后端启动
Write-Host "⏳ 等待后端服务启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 启动前端服务
Write-Host "🚀 正在启动前端服务..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList '-NoExit', '-Command', "cd '$PWD\frontend'; Write-Host '🎨 前端服务器启动中...' -ForegroundColor Cyan; npm run dev"

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  ✅ 项目启动成功！" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 访问地址：" -ForegroundColor Cyan
Write-Host "   前端: http://localhost:5173" -ForegroundColor White
Write-Host "   后端: http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示：" -ForegroundColor Yellow
Write-Host "   - 在新打开的终端窗口中按 Ctrl+C 可停止服务" -ForegroundColor White
Write-Host "   - 如需查看日志，请查看对应的终端窗口" -ForegroundColor White
Write-Host ""
Write-Host "🎉 祝你使用愉快！" -ForegroundColor Magenta
Write-Host ""

# 等待 2 秒后自动打开浏览器
Start-Sleep -Seconds 2
Write-Host "🌐 正在打开浏览器..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"
