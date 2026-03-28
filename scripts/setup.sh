#!/bin/bash
# WeChat OpenCode Bridge 安装脚本
# 用于 Linux/macOS 系统

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  WeChat OpenCode Bridge 安装脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误: 未找到 Node.js${NC}"
        echo "请先安装 Node.js (版本 22 或更高)"
        echo "访问 https://nodejs.org/ 下载安装"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        echo -e "${YELLOW}警告: Node.js 版本 ($NODE_VERSION) 低于推荐的 22${NC}"
        echo "建议升级到 Node.js 22 或更高版本"
    fi
    
    echo -e "${GREEN}✓ Node.js $(node -v) 已安装${NC}"
}

# 检查 npm
check_npm() {
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}错误: 未找到 npm${NC}"
        echo "npm 通常随 Node.js 一起安装"
        exit 1
    fi
    
    echo -e "${GREEN}✓ npm $(npm -v) 已安装${NC}"
}

# 安装依赖
install_dependencies() {
    echo ""
    echo "正在安装项目依赖..."
    npm install
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 依赖安装成功${NC}"
    else
        echo -e "${RED}错误: 依赖安装失败${NC}"
        exit 1
    fi
}

# 构建项目
build_project() {
    echo ""
    echo "正在构建项目..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 项目构建成功${NC}"
    else
        echo -e "${RED}错误: 项目构建失败${NC}"
        exit 1
    fi
}

# 运行设置
run_setup() {
    echo ""
    echo "正在启动微信绑定流程..."
    npm run setup
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 微信账号绑定成功${NC}"
    else
        echo -e "${YELLOW}提示: 微信绑定流程已结束${NC}"
    fi
}

# 显示使用说明
show_usage() {
    echo ""
    echo "=========================================="
    echo "  安装完成！使用方法："
    echo "=========================================="
    echo ""
    echo "启动服务: npm run start"
    echo "开发模式: npm run dev"
    echo "查看状态: npm run status"
    echo "停止服务: npm run stop"
    echo ""
    echo "更多信息请查看 README.md"
    echo ""
}

# 主函数
main() {
    check_node
    check_npm
    install_dependencies
    build_project
    run_setup
    show_usage
}

# 执行主函数
main