# 拾光绘旅 - 重启脚本（自动化调试用）
# 此脚本会自动关闭之前的前后端进程并重新启动

param(
    [switch]$NoBrowser  # 不自动打开浏览器
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  拾光绘旅 - 自动重启" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 停止占用端口的进程
function Stop-PortProcess {
    param([int]$Port, [string]$ServiceName)
    
    $connections = netstat -ano 2>$null | findstr ":$Port " | findstr "LISTENING"
    if ($connections) {
        $connections | ForEach-Object {
            $parts = $_.Trim() -split '\s+'
            $pid = $parts[-1]
            if ($pid -match '^\d+$' -and $pid -ne '0') {
                try {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "🔴 停止 $ServiceName (PID: $pid)" -ForegroundColor Yellow
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    }
                } catch {}
            }
        }
    }
}

# 停止现有服务
Write-Host "🧹 正在停止现有服务..." -ForegroundColor Yellow
Stop-PortProcess -Port 3001 -ServiceName "后端"
Stop-PortProcess -Port 8080 -ServiceName "前端"

# 额外清理可能的 Node 进程（通过窗口标题）
Get-Process pwsh -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "拾光绘旅"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1
Write-Host "✅ 清理完成" -ForegroundColor Green
Write-Host ""

# 检查配置
$backendEnv = ".\backend\.env"
if (-not (Test-Path $backendEnv)) {
    Write-Host "❌ 后端 .env 文件不存在！" -ForegroundColor Red
    exit 1
}

# 获取当前目录
$projectRoot = $PWD.Path

# 启动后端（在后台运行，不创建新窗口）
Write-Host "🚀 启动后端服务..." -ForegroundColor Cyan
$backendJob = Start-Process pwsh -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$projectRoot\backend'; `$Host.UI.RawUI.WindowTitle = '拾光绘旅 - 后端'; node src/index.js"
) -PassThru -WindowStyle Normal

Start-Sleep -Seconds 2

# 启动前端
Write-Host "🚀 启动前端服务..." -ForegroundColor Cyan
$frontendJob = Start-Process pwsh -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$projectRoot\frontend'; `$Host.UI.RawUI.WindowTitle = '拾光绘旅 - 前端'; npm run dev"
) -PassThru -WindowStyle Normal

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  ✅ 服务已重启！" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 前端: http://localhost:8080" -ForegroundColor White
Write-Host "📍 后端: http://localhost:3001" -ForegroundColor White
Write-Host ""

# 打开浏览器（可选）
if (-not $NoBrowser) {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8080"
}
