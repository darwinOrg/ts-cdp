# /api/page/navigate 接口测试示例

本目录包含测试 `/api/page/navigate` 接口的多种示例。

## 前置条件

确保 HTTP 服务器正在运行：

```bash
npm run server
```

服务器将在 `http://localhost:3000` 启动。

## 测试示例

### 1. TypeScript 示例

使用 Node.js 和 TypeScript 测试导航 API：

```bash
npm run example
```

或者直接运行：

```bash
npx ts-node examples/test-http-navigate.ts
```

**功能：**
- 启动浏览器
- 导航到百度
- 导航到 GitHub
- 获取页面标题和 URL
- 截图
- 获取页面 HTML
- 执行 JavaScript
- 停止浏览器

### 2. Bash/Curl 示例

使用 curl 命令测试导航 API：

```bash
./examples/curl-navigate-examples.sh
```

**依赖：**
- `curl` - HTTP 客户端
- `jq` - JSON 处理工具（可选，用于格式化输出）

安装 jq：
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### 3. Python 示例

使用 Python requests 库测试导航 API：

```bash
./examples/test-http-navigate.py
```

**依赖：**
- Python 3.6+
- requests 库

安装依赖：
```bash
pip install requests
```

## API 接口说明

### POST /api/page/navigate

导航到指定的 URL。

**请求体：**
```json
{
  "sessionId": "test-session",
  "url": "https://www.baidu.com"
}
```

**参数：**
- `sessionId` (必填): 浏览器会话 ID
- `url` (必填): 要导航到的 URL

**响应：**
```json
{
  "success": true
}
```

**错误响应：**
```json
{
  "success": false,
  "error": "Error message"
}
```

## 完整测试流程

1. **启动浏览器**
   ```bash
   POST /api/browser/start
   ```

2. **导航到页面**
   ```bash
   POST /api/page/navigate
   ```

3. **获取页面信息**
   - 获取标题: `GET /api/page/title`
   - 获取 URL: `GET /api/page/url`
   - 获取 HTML: `GET /api/page/html`

4. **执行操作**
   - 截图: `POST /api/page/screenshot`
   - 执行 JS: `POST /api/page/execute`

5. **停止浏览器**
   ```bash
   POST /api/browser/stop
   ```

## 相关 API

- `GET /api/page/title` - 获取页面标题
- `GET /api/page/url` - 获取页面 URL
- `GET /api/page/html` - 获取页面 HTML
- `POST /api/page/reload` - 刷新页面
- `POST /api/page/screenshot` - 截图
- `POST /api/page/execute` - 执行 JavaScript

## 注意事项

1. **会话管理**: 每个 `sessionId` 对应一个浏览器实例
2. **资源清理**: 测试完成后记得调用 `/api/browser/stop` 关闭浏览器
3. **等待时间**: 导航后需要等待页面加载完成（通常 2-3 秒）
4. **错误处理**: 所有错误都会返回 JSON 格式的错误信息

## 故障排查

### 无法连接到服务器

确保 HTTP 服务器正在运行：
```bash
npm run server
```

### 浏览器启动失败

检查 Chrome 是否已安装：
```bash
# macOS
which google-chrome-stable

# Linux
which google-chrome

# Windows
where chrome.exe
```

### 导航超时

增加等待时间或检查网络连接。