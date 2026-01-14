# Browser Automation HTTP Server

基于 Chrome DevTools Protocol (CDP) 的浏览器自动化 HTTP API 服务器。

## 功能特性

实现了 Go 版 Playwright 的核心功能：

### BrowserContext (浏览器上下文)
- 启动/停止浏览器
- 管理多个浏览器会话
- 支持持久化用户数据

### Page (页面操作)
- 导航到 URL
- 刷新页面
- 执行 JavaScript
- 获取页面标题和 URL
- 截图
- 等待加载状态
- 等待元素出现

### Locator (元素定位)
- 检查元素是否存在
- 获取元素文本
- 获取元素属性
- 点击元素
- 设置元素值
- 检查元素可见性
- 检查元素 class

## 启动服务器

```bash
npm run server
```

服务器将在 `http://localhost:3000` 启动。

## API 端点

### 浏览器管理

#### 启动浏览器
```bash
POST /api/browser/start
Content-Type: application/json

{
  "sessionId": "session-123",
  "headless": false
}
```

#### 连接到现有浏览器
```bash
POST /api/browser/connect
Content-Type: application/json

{
  "sessionId": "session-123",
  "port": 9222
}
```

#### 关闭浏览器
```bash
POST /api/browser/stop
Content-Type: application/json

{
  "sessionId": "session-123"
}
```

### 页面操作

#### 创建新页面
```bash
POST /api/page/new
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 关闭页面
```bash
POST /api/page/close
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 导航到 URL
```bash
POST /api/page/navigate
Content-Type: application/json

{
  "sessionId": "session-123",
  "url": "https://example.com",
  "pageId": "page-1"
}
```

**注意:** `pageId` 参数是可选的,默认使用 `default` 页面。

#### 刷新页面
```bash
POST /api/page/reload
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 执行 JavaScript
```bash
POST /api/page/execute
Content-Type: application/json

{
  "sessionId": "session-123",
  "script": "document.title",
  "pageId": "page-1"
}
```

#### 获取页面标题
```bash
GET /api/page/title?sessionId=session-123&pageId=page-1
```

#### 获取页面 URL
```bash
GET /api/page/url?sessionId=session-123&pageId=page-1
```

#### 截图
```bash
POST /api/page/screenshot
Content-Type: application/json

{
  "sessionId": "session-123",
  "format": "png",
  "pageId": "page-1"
}
```

#### 带加载状态的导航
```bash
POST /api/page/navigate-with-loaded-state
Content-Type: application/json

{
  "sessionId": "session-123",
  "url": "https://example.com",
  "pageId": "page-1"
}
```

#### 带加载状态的刷新
```bash
POST /api/page/reload-with-loaded-state
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 等待加载状态 load
```bash
POST /api/page/wait-for-load-state-load
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 等待 DOM 内容加载
```bash
POST /api/page/wait-for-dom-content-loaded
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 等待选择器可见
```bash
POST /api/page/wait-for-selector-visible
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "h1",
  "pageId": "page-1"
}
```

### 元素操作

#### 检查元素是否存在
```bash
POST /api/element/exists
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "h1",
  "pageId": "page-1"
}
```

**注意:** `pageId` 参数是可选的,默认使用 `default` 页面。

#### 获取元素文本
```bash
POST /api/element/text
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "h1",
  "pageId": "page-1"
}
```

#### 点击元素
```bash
POST /api/element/click
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "#submit-button",
  "pageId": "page-1"
}
```

#### 设置元素值
```bash
POST /api/element/setValue
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "#username",
  "value": "testuser",
  "pageId": "page-1"
}
```

#### 等待元素
```bash
POST /api/element/wait
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "#result",
  "timeout": 10000,
  "pageId": "page-1"
}
```

#### 获取元素属性
```bash
POST /api/element/attribute
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "#link",
  "attribute": "href",
  "pageId": "page-1"
}
```

### 会话管理

#### 获取所有会话
```bash
GET /api/sessions
```

#### 健康检查
```bash
GET /health
```

## 使用示例

### 启动浏览器并导航
```bash
# 1. 启动浏览器
curl -X POST http://localhost:3000/api/browser/start \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "options": {
      "headless": false
    }
  }'

# 2. 导航到页面
curl -X POST http://localhost:3000/api/page/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "url": "https://example.com"
  }'

# 3. 获取页面标题
curl http://localhost:3000/api/page/title?sessionId=test-session

# 4. 截图
curl -X POST http://localhost:3000/api/page/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "format": "png"
  }'

# 5. 关闭浏览器
curl -X POST http://localhost:3000/api/browser/stop \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session"
  }'
```

### 元素操作示例
```bash
# 检查元素是否存在
curl -X POST http://localhost:3000/api/element/exists \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "selector": "h1"
  }'

# 获取元素文本
curl -X POST http://localhost:3000/api/element/text \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "selector": "h1"
  }'

# 点击元素
curl -X POST http://localhost:3000/api/element/click \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "selector": "#submit-button"
  }'

# 设置输入框值
curl -X POST http://localhost:3000/api/element/setValue \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "selector": "#username",
    "value": "testuser"
  }'
```

## 响应格式

所有 API 响应都使用统一的 JSON 格式：

### 成功响应
```json
{
  "success": true,
  "data": { ... }
}
```

### 错误响应
```json
{
  "success": false,
  "error": "Error message"
}
```

## 注意事项

1. **会话管理**: 每个浏览器实例都有一个唯一的 `sessionId`，所有操作都需要提供 `sessionId`
2. **多页面管理**: 支持在一个浏览器会话中创建多个页面,使用 `pageId` 参数指定操作哪个页面。默认使用 `default` 页面
3. **外部浏览器连接**: 可以通过 `/api/browser/connect` 连接到现有的浏览器实例,而不是启动新浏览器
4. **资源清理**: 使用完毕后记得调用 `/api/browser/stop` 关闭浏览器
5. **超时处理**: 大多数操作都有默认超时时间（10秒），可以通过参数自定义
6. **错误处理**: 所有错误都会返回 JSON 格式的错误信息

## 与 Go 版 Playwright 的对应关系

| Go Playwright | TypeScript CDP |
|--------------|----------------|
| `ExtBrowserContext` | `BrowserHttpServer` (会话管理) |
| `ExtPage` | `BrowserPage` |
| `ExtLocator` | `BrowserLocator` |
| `Navigate()` | `navigate()` |
| `Click()` | `click()` |
| `MustInnerText()` | `getText()` |
| `MustGetAttribute()` | `getAttribute()` |
| `Exists()` | `exists()` |
| `WaitForSelectorStateVisible()` | `waitForSelector()` |

## 新增的 Playwright 常用功能

#### 随机等待
```bash
POST /api/page/random-wait
```

**请求体:**
```json
{
  "sessionId": "test-session",
  "duration": "middle",
  "pageId": "page-1"
}
```

**duration 参数:**
- `short`: 100-1000ms
- `middle`: 3-6s
- `long`: 10-20s
- 数字: 自定义毫秒数

#### 期望响应文本
```bash
POST /api/page/expect-response-text
Content-Type: application/json

{
  "sessionId": "session-123",
  "urlOrPredicate": "https://api.example.com/data",
  "callback": "document.querySelector('#load').click()",
  "pageId": "page-1"
}
```

#### 强制获取 inner text
```bash
POST /api/page/must-inner-text
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "h1",
  "pageId": "page-1"
}
```

#### 强制获取 text content
```bash
POST /api/page/must-text-content
Content-Type: application/json

{
  "sessionId": "session-123",
  "selector": "h1",
  "pageId": "page-1"
}
```

#### 暂停
```bash
POST /api/page/suspend
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 继续
```bash
POST /api/page/continue
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 释放
```bash
POST /api/page/release
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 关闭所有页面
```bash
POST /api/page/close-all
Content-Type: application/json

{
  "sessionId": "session-123",
  "pageId": "page-1"
}
```

#### 期望外部页面
```bash
POST /api/page/expect-ext-page
Content-Type: application/json

{
  "sessionId": "session-123",
  "callback": "document.querySelector('#open-new-tab').click()",
  "pageId": "page-1"
}
```

#### 获取页面 HTML
```bash
GET /api/page/html?sessionId=test-session
```

**响应:**
```json
{
  "success": true,
  "html": "<html>...</html>"
}
```

#### 获取所有匹配元素的文本
```bash
POST /api/element/all-texts
```

**请求体:**
```json
{
  "sessionId": "test-session",
  "selector": ".item"
}
```

**响应:**
```json
{
  "success": true,
  "texts": ["Item 1", "Item 2", "Item 3"]
}
```

#### 获取所有匹配元素的属性
```bash
POST /api/element/all-attributes
```

**请求体:**
```json
{
  "sessionId": "test-session",
  "selector": ".item",
  "attribute": "href"
}
```

**响应:**
```json
{
  "success": true,
  "attributes": ["url1", "url2", "url3"]
}
```

#### 获取元素数量
```bash
POST /api/element/count
```

**请求体:**
```json
{
  "sessionId": "test-session",
  "selector": ".item"
}
```

**响应:**
```json
{
  "success": true,
  "count": 3
}
```