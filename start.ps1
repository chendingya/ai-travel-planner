# 拾光绘旅 - 启动脚本
# 此脚本将自动启动前端和后端服务

param(
    [switch]$NoBrowser  # 不自动打开浏览器
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  拾光绘旅 - 项目启动工具" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 获取当前脚本的进程ID，避免误杀自己
$currentPID = $PID

# 停止占用指定端口的进程（排除当前进程）
function Stop-PortProcess {
    param([int]$Port, [string]$ServiceName)
    
    try {
        $netstatOutput = netstat -ano 2>$null | Select-String ":$Port\s" | Select-String "LISTENING"
        if ($netstatOutput) {
            foreach ($line in $netstatOutput) {
                $parts = $line.ToString().Trim() -split '\s+'
                $pid = $parts[-1]
                if ($pid -match '^\d+$' -and [int]$pid -ne 0 -and [int]$pid -ne $currentPID) {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($process -and $process.Id -ne $currentPID) {
                        Write-Host "🔴 停止 $ServiceName (PID: $pid, 进程: $($process.ProcessName))" -ForegroundColor Yellow
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
    } catch {
        # 忽略错误
    }
}

# 检查环境变量是否配置
Write-Host "🔍 检查配置文件..." -ForegroundColor Yellow

$backendEnv = ".\backend\.env"
if (-not (Test-Path $backendEnv)) {
    Write-Host "❌ 错误: 后端 .env 文件不存在！" -ForegroundColor Red
    Write-Host "   请先复制 backend\.env.example 为 backend\.env 并填写配置" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 配置文件检查通过" -ForegroundColor Green
Write-Host "ℹ️  提示: 前端运行时配置将通过 backend/.env 中的 PUBLIC_* 变量注入" -ForegroundColor DarkCyan
Write-Host ""

function Get-BackendPortFromEnv {
    param([string]$EnvPath, [int]$DefaultPort = 3002)

    try {
        $line = Get-Content $EnvPath | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
        if ($line) {
            $value = ($line -split '=', 2)[1].Trim()
            $parsed = 0
            if ([int]::TryParse($value, [ref]$parsed) -and $parsed -gt 0) {
                return $parsed
            }
        }
    } catch {
        # 忽略错误，回退到默认端口
    }

    return $DefaultPort
}

$backendPort = Get-BackendPortFromEnv -EnvPath $backendEnv -DefaultPort 3002

# 清理可能残留的进程
Write-Host "🧹 检查并清理残留进程..." -ForegroundColor Yellow

$portsToClean = @($backendPort, 8080, 3001, 3002) | Select-Object -Unique
foreach ($port in $portsToClean) {
    if ($port -eq 8080) {
        Stop-PortProcess -Port $port -ServiceName "前端"
    } else {
        Stop-PortProcess -Port $port -ServiceName "后端"
    }
}

Start-Sleep -Seconds 1
Write-Host "✅ 进程清理完成" -ForegroundColor Green
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
$projectRoot = $PWD.Path
Start-Process pwsh -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$projectRoot\backend'; `$Host.UI.RawUI.WindowTitle = '拾光绘旅 - 后端'; Write-Host '🔧 后端服务器启动中...' -ForegroundColor Cyan; node src/index.js"
)

# 等待后端启动
Write-Host "⏳ 等待后端服务启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 启动前端服务
Write-Host "🚀 正在启动前端服务..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$projectRoot\frontend'; `$Host.UI.RawUI.WindowTitle = '拾光绘旅 - 前端'; `$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:$backendPort'; Write-Host '🎨 前端服务器启动中...' -ForegroundColor Cyan; Write-Host ('🔗 前端代理目标: ' + `$env:VITE_API_PROXY_TARGET) -ForegroundColor DarkCyan; npm run dev"
)

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  ✅ 项目启动成功！" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 访问地址：" -ForegroundColor Cyan
Write-Host "   前端: http://localhost:8080" -ForegroundColor White
Write-Host "   后端: http://localhost:$backendPort" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示：" -ForegroundColor Yellow
Write-Host "   - 在新打开的终端窗口中按 Ctrl+C 可停止服务" -ForegroundColor White
Write-Host "   - 如需查看日志，请查看对应的终端窗口" -ForegroundColor White
Write-Host "   - 如遇到端口占用问题，请运行 .\stop.ps1 后重试" -ForegroundColor White
Write-Host ""
Write-Host "🎉 祝你使用愉快！" -ForegroundColor Magenta
Write-Host ""

# 等待 2 秒后自动打开浏览器
if (-not $NoBrowser) {
    Start-Sleep -Seconds 2
    Write-Host "🌐 正在打开浏览器..." -ForegroundColor Cyan
    Start-Process "http://localhost:8080"
}
