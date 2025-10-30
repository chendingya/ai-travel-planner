# AI 旅行规划师 - 停止脚本
# 此脚本将停止所有运行中的 Node.js 进程

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  停止 AI 旅行规划师 服务" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔍 正在查找 Node.js 进程..." -ForegroundColor Yellow

$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "找到 $($nodeProcesses.Count) 个 Node.js 进程" -ForegroundColor Yellow
    Write-Host ""
    
    $choice = Read-Host "确定要停止所有 Node.js 进程吗？(Y/N)"
    
    if ($choice -eq 'Y' -or $choice -eq 'y') {
        $nodeProcesses | Stop-Process -Force
        Write-Host "✅ 所有 Node.js 进程已停止" -ForegroundColor Green
    } else {
        Write-Host "❌ 操作已取消" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  未找到运行中的 Node.js 进程" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "完成！" -ForegroundColor Green
