#!/bin/bash

# 快速运行导航 API 测试

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          /api/page/navigate 接口测试                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 检查服务器是否运行
echo "🔍 检查 HTTP 服务器状态..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ HTTP 服务器正在运行"
else
    echo "❌ HTTP 服务器未运行"
    echo ""
    echo "请先启动 HTTP 服务器："
    echo "  npm run server"
    echo ""
    exit 1
fi

echo ""
echo "请选择测试方式："
echo "  1) TypeScript 示例 (推荐)"
echo "  2) Bash/Curl 示例"
echo "  3) Python 示例"
echo "  4) 查看文档"
echo "  0) 退出"
echo ""
read -p "请输入选项 (0-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 运行 TypeScript 示例..."
        echo ""
        npx ts-node examples/test-http-navigate.ts
        ;;
    2)
        echo ""
        echo "🚀 运行 Bash/Curl 示例..."
        echo ""
        ./examples/curl-navigate-examples.sh
        ;;
    3)
        echo ""
        echo "🚀 运行 Python 示例..."
        echo ""
        ./examples/test-http-navigate.py
        ;;
    4)
        echo ""
        echo "📚 打开文档..."
        echo ""
        cat examples/NAVIGATE_API_TEST.md
        ;;
    0)
        echo ""
        echo "👋 再见！"
        exit 0
        ;;
    *)
        echo ""
        echo "❌ 无效的选项"
        exit 1
        ;;
esac