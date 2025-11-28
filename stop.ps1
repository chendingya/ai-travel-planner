# 拾光绘旅 - 停止脚本
# 此脚本将停止所有运行中的前端和后端服务

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  停止 拾光绘旅 服务" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔍 正在查找占用端口的进程..." -ForegroundColor Yellow
Write-Host ""

function Stop-PortProcess {
    param(
        [int]$Port,
        [string]$ServiceName
    )
    
    $connections = netstat -ano | findstr ":$Port"
    
    if ($connections) {
        Write-Host "📍 $ServiceName (端口 $Port):" -ForegroundColor Cyan
        
        $stopped = $false
        $connections | ForEach-Object {
            $line = $_.Trim()
            $parts = $line -split '\s+'
            $pid = $parts[-1]
            
            if ($pid -match '^\d+$') {
                try {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "   正在停止: $($process.Name) (PID: $pid)" -ForegroundColor Yellow
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                        $stopped = $true
                    }
                } catch {
                    Write-Host "   ⚠️  无法停止 PID: $pid" -ForegroundColor Red
                }
            }
        }
        
        if ($stopped) {
            Write-Host "   ✅ 已停止" -ForegroundColor Green
        }
    } else {
        Write-Host "📍 $ServiceName (端口 $Port): 未运行" -ForegroundColor Gray
    }
    Write-Host ""
}

# 停止后端服务 (端口 3001)
Stop-PortProcess -Port 3001 -ServiceName "后端服务"

# 停止前端服务 (端口 5173)
Stop-PortProcess -Port 5173 -ServiceName "前端服务"

# 额外检查并停止所有 node 进程
Write-Host "🔍 检查其他 Node.js 进程..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "⚠️  发现 $($nodeProcesses.Count) 个其他 Node.js 进程" -ForegroundColor Yellow
    
    $choice = Read-Host "是否停止所有 Node.js 进程？(Y/N)"
    
    if ($choice -eq 'Y' -or $choice -eq 'y') {
        $nodeProcesses | ForEach-Object {
            Write-Host "   停止: $($_.Name) (PID: $($_.Id))" -ForegroundColor Yellow
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        Write-Host "✅ 所有 Node.js 进程已停止" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  已跳过" -ForegroundColor Cyan
    }
} else {
    Write-Host "✅ 没有其他 Node.js 进程" -ForegroundColor Green
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  完成！" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
