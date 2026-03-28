<#
.SYNOPSIS
    WeChat OpenCode Bridge 安装脚本 (Windows PowerShell)

.DESCRIPTION
    用于 Windows 系统的安装脚本，自动检查环境、安装依赖并启动设置。

.EXAMPLE
    .\setup.ps1
    运行完整安装流程

.EXAMPLE
    .\setup.ps1 -SkipSetup
    跳过微信绑定步骤
#>

param(
    [switch]$SkipSetup
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色函数
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success($message) {
    Write-ColorOutput Green "✓ $message"
}

function Write-Warning($message) {
    Write-ColorOutput Yellow "⚠ $message"
}

function Write-Error($message) {
    Write-ColorOutput Red "✗ $message"
}

# 检查 Node.js
function Test-NodeJs {
    try {
        $nodeVersion = node -v
        Write-Success "Node.js $nodeVersion 已安装"
        
        # 检查版本
        $versionNumber = $nodeVersion -replace 'v', '' -split '\.' | Select-Object -First 1
        if ([int]$versionNumber -lt 22) {
            Write-Warning "Node.js 版本 ($versionNumber) 低于推荐的 22"
            Write-Output "建议升级到 Node.js 22 或更高版本"
        }
        
        return $true
    }
    catch {
        Write-Error "未找到 Node.js"
        Write-Output "请先安装 Node.js (版本 22 或更高)"
        Write-Output "访问 https://nodejs.org/ 下载安装"
        return $false
    }
}

# 检查 npm
function Test-Npm {
    try {
        $npmVersion = npm -v
        Write-Success "npm $npmVersion 已安装"
        return $true
    }
    catch {
        Write-Error "未找到 npm"
        Write-Output "npm 通常随 Node.js 一起安装"
        return $false
    }
}

# 安装依赖
function Install-Dependencies {
    Write-Output ""
    Write-Output "正在安装项目依赖..."
    
    try {
        npm install
        Write-Success "依赖安装成功"
        return $true
    }
    catch {
        Write-Error "依赖安装失败: $_"
        return $false
    }
}

# 构建项目
function Build-Project {
    Write-Output ""
    Write-Output "正在构建项目..."
    
    try {
        npm run build
        Write-Success "项目构建成功"
        return $true
    }
    catch {
        Write-Error "项目构建失败: $_"
        return $false
    }
}

# 运行设置
function Start-Setup {
    if ($SkipSetup) {
        Write-Warning "跳过微信绑定步骤"
        return $true
    }
    
    Write-Output ""
    Write-Output "正在启动微信绑定流程..."
    
    try {
        npm run setup
        Write-Success "微信账号绑定成功"
        return $true
    }
    catch {
        Write-Warning "微信绑定流程已结束"
        return $true
    }
}

# 显示使用说明
function Show-Usage {
    Write-Output ""
    Write-Output "=========================================="
    Write-Output "  安装完成！使用方法："
    Write-Output "=========================================="
    Write-Output ""
    Write-Output "启动服务: npm run start"
    Write-Output "开发模式: npm run dev"
    Write-Output "查看状态: npm run status"
    Write-Output "停止服务: npm run stop"
    Write-Output ""
    Write-Output "更多信息请查看 README.md"
    Write-Output ""
}

# 主函数
function Main {
    Write-Output "=========================================="
    Write-Output "  WeChat OpenCode Bridge 安装脚本"
    Write-Output "=========================================="
    
    # 检查环境
    if (-not (Test-NodeJs)) { exit 1 }
    if (-not (Test-Npm)) { exit 1 }
    
    # 安装依赖
    if (-not (Install-Dependencies)) { exit 1 }
    
    # 构建项目
    if (-not (Build-Project)) { exit 1 }
    
    # 运行设置
    if (-not (Start-Setup)) { exit 1 }
    
    # 显示使用说明
    Show-Usage
}

# 执行主函数
Main