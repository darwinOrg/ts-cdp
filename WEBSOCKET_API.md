# Browser Automation WebSocket API

基于 Chrome DevTools Protocol (CDP) 的浏览器自动化 WebSocket API 服务器。

## 为什么选择 WebSocket？

相比 HTTP API，WebSocket 提供以下优势：

1. **双向通信** - 服务器可以主动推送页面事件
2. **持久连接** - 避免每次请求都建立新连接
3. **实时性** - 更适合处理浏览器事件（如页面加载、元素变化）
4. **减少开销** - 不需要重复发送 sessionId
5. **更好的状态管理** - 可以保持长连接状态

## 启动服务器

```bash
npm run ws-server
```

服务器将在 `ws://localhost:3001` 启动。

## 连接方式

```javascript
const ws = new WebSocket('ws://localhost:3001?sessionId=your-session-id');
```

## 消息格式

所有消息都使用 JSON 格式：

### 请求消息

```json
{
  "type": "navigate",
  "pageId": "page-123",
  "data": {
    "url": "https://example.com",
    "requestId": "req-123"
  }
}
```

### 响应消息

```json
{
  "type": "navigated",
  "requestId": "req-123",
  "success": true,
  "data": {
    "pageId": "page-123",
    "url": "https://example.com"
  }
}
```

### 事件推送

```json
{
  "type": "page_event",
  "success": true,
  "data": {
    "pageId": "page-123",
    "event": "load",
    "eventData": { "url": "https://example.com" },
    "timestamp": "2026-01-12T10:30:00.000Z"
  }
}
```

## 支持的操作

### 浏览器管理

#### 启动浏览器
```json
{
  "type": "start_browser",
  "data": {
    "headless": false,
    "startingUrl": "https://example.com"
  }
}
```

#### 停止浏览器
```json
{
  "type": "stop_browser"
}
```

### 页面管理

#### 创建新页面
```json
{
  "type": "new_page",
  "data": {
    "pageId": "page-123"
  }
}
```

#### 关闭页面
```json
{
  "type": "close_page",
  "pageId": "page-123"
}
```

### 页面操作

#### 导航到 URL
```json
{
  "type": "navigate",
  "pageId": "page-123",
  "data": {
    "url": "https://example.com",
    "options": {
      "waitUntil": "load"
    }
  }
}
```

#### 刷新页面
```json
{
  "type": "reload",
  "pageId": "page-123",
  "data": {
    "options": {
      "waitUntil": "load"
    }
  }
}
```

#### 执行 JavaScript
```json
{
  "type": "execute_script",
  "pageId": "page-123",
  "data": {
    "script": "document.title"
  }
}
```

#### 获取页面标题
```json
{
  "type": "get_title",
  "pageId": "page-123"
}
```

#### 获取页面 URL
```json
{
  "type": "get_url",
  "pageId": "page-123"
}
```

#### 截图
```json
{
  "type": "screenshot",
  "pageId": "page-123",
  "data": {
    "format": "png"
  }
}
```

### 元素操作

#### 检查元素是否存在
```json
{
  "type": "element_exists",
  "pageId": "page-123",
  "data": {
    "selector": "h1"
  }
}
```

#### 获取元素文本
```json
{
  "type": "element_text",
  "pageId": "page-123",
  "data": {
    "selector": "h1"
  }
}
```

#### 点击元素
```json
{
  "type": "element_click",
  "pageId": "page-123",
  "data": {
    "selector": "#submit-button"
  }
}
```

#### 设置元素值
```json
{
  "type": "element_set_value",
  "pageId": "page-123",
  "data": {
    "selector": "#username",
    "value": "testuser"
  }
}
```

#### 等待元素
```json
{
  "type": "element_wait",
  "pageId": "page-123",
  "data": {
    "selector": "#result",
    "options": {
      "timeout": 10000,
      "state": "visible"
    }
  }
}
```

#### 获取元素属性
```json
{
  "type": "element_attribute",
  "pageId": "page-123",
  "data": {
    "selector": "#link",
    "attribute": "href"
  }
}
```

### 事件订阅

#### 订阅页面事件
```json
{
  "type": "subscribe_events",
  "pageId": "page-123",
  "data": {
    "events": ["load", "console", "error"]
  }
}
```

## 使用示例

### JavaScript 客户端

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001?sessionId=test-session');

ws.on('open', () => {
  console.log('Connected');

  // 启动浏览器
  ws.send(JSON.stringify({
    type: 'start_browser',
    data: { headless: false }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message);
});

// 导航到页面
ws.send(JSON.stringify({
  type: 'new_page',
  data: { pageId: 'page-1' }
}));

ws.send(JSON.stringify({
  type: 'navigate',
  pageId: 'page-1',
  data: { url: 'https://example.com' }
}));
```

### 使用提供的客户端类

```typescript
import { BrowserWebSocketClient } from '../src/websocket/client';

const client = new BrowserWebSocketClient('test-session');

// 启动浏览器
await client.startBrowser({ headless: false });

// 创建页面
const pageResult = await client.newPage('page-1');

// 导航
await client.navigate('page-1', 'https://example.com');

// 获取标题
const title = await client.getTitle('page-1');

// 检查元素
const exists = await client.elementExists('page-1', 'h1');

// 点击元素
await client.elementClick('page-1', '#submit-button');

// 设置值
await client.elementSetValue('page-1', '#username', 'testuser');

// 截图
const screenshot = await client.screenshot('page-1', 'png');

// 关闭
client.close();
```

## 事件类型

服务器可以主动推送以下事件：

- `load` - 页面加载完成
- `console` - 控制台消息
- `error` - 页面错误
- `dialog` - 对话框
- `request` - 网络请求

## 错误处理

所有错误都通过 WebSocket 返回：

```json
{
  "type": "error",
  "requestId": "req-123",
  "success": false,
  "error": "Error message"
}
```

## 最佳实践

1. **使用 pageId** - 每个操作都指定 pageId，确保操作正确的页面
2. **处理事件** - 监听服务器推送的事件，实现实时响应
3. **错误处理** - 检查 success 字段，处理错误情况
4. **资源清理** - 使用完毕后调用 stop_browser 关闭浏览器
5. **会话管理** - 使用唯一的 sessionId 避免冲突

## 与 HTTP API 的对比

| 特性 | HTTP API | WebSocket API |
|------|----------|----------------|
| 双向通信 | ❌ | ✅ |
| 实时事件 | ❌ | ✅ |
| 连接开销 | 高 | 低 |
| 状态管理 | 无状态 | 有状态 |
| 适用场景 | 简单操作 | 复杂交互 |

## 与 Go 版 Playwright 的对应关系

| Go Playwright | WebSocket CDP |
|--------------|----------------|
| `ExtBrowserContext` | Session + WebSocket |
| `ExtPage` | pageId |
| `Navigate()` | `navigate` message |
| `Click()` | `element_click` message |
| `MustInnerText()` | `element_text` message |
| `MustGetAttribute()` | `element_attribute` message |
| `Exists()` | `element_exists` message |
| 事件回调 | WebSocket 事件推送 |

## 新增的 Playwright 常用功能

#### 随机等待
```json
{
  "type": "random_wait",
  "pageId": "page-123",
  "data": {
    "duration": "middle"
  }
}
```

**duration 参数:**
- `short`: 100-1000ms
- `middle`: 3-6s
- `long`: 10-20s
- 数字: 自定义毫秒数

**响应:**
```json
{
  "type": "random_waited",
  "requestId": "req-123",
  "success": true,
  "data": {
    "pageId": "page-123",
    "duration": "middle"
  }
}
```

#### 获取页面 HTML
```json
{
  "type": "get_html",
  "pageId": "page-123",
  "data": {}
}
```

**响应:**
```json
{
  "type": "html",
  "requestId": "req-123",
  "success": true,
  "data": {
    "pageId": "page-123",
    "html": "<html>...</html>"
  }
}
```

#### 获取所有匹配元素的文本
```json
{
  "type": "element_all_texts",
  "pageId": "page-123",
  "data": {
    "selector": ".item"
  }
}
```

**响应:**
```json
{
  "type": "element_all_texts",
  "requestId": "req-123",
  "success": true,
  "data": {
    "pageId": "page-123",
    "selector": ".item",
    "texts": ["Item 1", "Item 2", "Item 3"]
  }
}
```

#### 获取所有匹配元素的属性
```json
{
  "type": "element_all_attributes",
  "pageId": "page-123",
  "data": {
    "selector": ".item",
    "attribute": "href"
  }
}
```

**响应:**
```json
{
  "type": "element_all_attributes",
  "requestId": "req-123",
  "success": true,
  "data": {
    "pageId": "page-123",
    "selector": ".item",
    "attribute": "href",
    "attributes": ["url1", "url2", "url3"]
  }
}
```

#### 获取元素数量
```json
{
  "type": "element_count",
  "pageId": "page-123",
  "data": {
    "selector": ".item"
  }
}
```

**响应:**
```json
{
  "type": "element_count",
  "requestId": "req-123",
  "success": true,
  "data": {
    "pageId": "page-123",
    "selector": ".item",
    "count": 3
  }
}
```