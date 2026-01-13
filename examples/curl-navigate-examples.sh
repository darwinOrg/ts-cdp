#!/bin/bash

# HTTP API 导航接口测试示例
# 使用 curl 命令测试 /api/page/navigate 接口

BASE_URL="http://localhost:3000"
SESSION_ID="test-navigate-$(date +%s)"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          HTTP API 导航接口测试 (curl 示例)                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ========== 1. 启动浏览器 ==========
echo "📌 步骤 1: 启动浏览器..."
echo "POST $BASE_URL/api/browser/start"
echo ""

curl -X POST "$BASE_URL/api/browser/start" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "'"$SESSION_ID"'",
    "headless": true
  }' \
  | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# 等待浏览器启动
sleep 2

# ========== 2. 导航到百度 ==========
echo "📌 步骤 2: 导航到百度..."
echo "POST $BASE_URL/api/page/navigate"
echo ""

curl -X POST "$BASE_URL/api/page/navigate" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "'"$SESSION_ID"'",
    "url": "https://www.baidu.com"
  }' \
  | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# 等待页面加载
sleep 3

# ========== 3. 获取页面标题 ==========
echo "📌 步骤 3: 获取页面标题..."
echo "GET $BASE_URL/api/page/title?sessionId=$SESSION_ID"
echo ""

curl -X GET "$BASE_URL/api/page/title?sessionId=$SESSION_ID" | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# ========== 4. 导航到 GitHub ==========
echo "📌 步骤 4: 导航到 GitHub..."
echo "POST $BASE_URL/api/page/navigate"
echo ""

curl -X POST "$BASE_URL/api/page/navigate" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "'"$SESSION_ID"'",
    "url": "https://github.com"
  }' \
  | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# 等待页面加载
sleep 3

# ========== 5. 获取页面 URL ==========
echo "📌 步骤 5: 获取页面 URL..."
echo "GET $BASE_URL/api/page/url?sessionId=$SESSION_ID"
echo ""

curl -X GET "$BASE_URL/api/page/url?sessionId=$SESSION_ID" | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# ========== 6. 获取页面标题 ==========
echo "📌 步骤 6: 获取页面标题..."
echo "GET $BASE_URL/api/page/title?sessionId=$SESSION_ID"
echo ""

curl -X GET "$BASE_URL/api/page/title?sessionId=$SESSION_ID" | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# ========== 7. 获取页面 HTML ==========
echo "📌 步骤 7: 获取页面 HTML..."
echo "GET $BASE_URL/api/page/html?sessionId=$SESSION_ID"
echo ""

curl -X GET "$BASE_URL/api/page/html?sessionId=$SESSION_ID" | jq '.html | length' | xargs -I {} echo "HTML 大小: {} 字符"

echo -e "\n────────────────────────────────────────────────────────────\n"

# ========== 8. 执行 JavaScript ==========
echo "📌 步骤 8: 执行 JavaScript..."
echo "POST $BASE_URL/api/page/execute"
echo ""

curl -X POST "$BASE_URL/api/page/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "'"$SESSION_ID"'",
    "script": "document.location.href"
  }' \
  | jq '.'

echo -e "\n────────────────────────────────────────────────────────────\n"

# ========== 9. 停止浏览器 ==========
echo "📌 步骤 9: 停止浏览器..."
echo "POST $BASE_URL/api/browser/stop"
echo ""

curl -X POST "$BASE_URL/api/browser/stop" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "'"$SESSION_ID"'"
  }' \
  | jq '.'

echo -e "\n╔══════════════════════════════════════════════════════════╗"
echo "║                    测试完成 ✅                             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""