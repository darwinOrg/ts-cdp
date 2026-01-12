# ts-cdp

一个用于 Chrome DevTools Protocol (CDP) 操作的 TypeScript 库，提供了简洁的 API 来控制 Chrome 浏览器、监控网络请求、追踪登录状态等功能。

## 特性

- 🚀 简单易用的 TypeScript API
- 🌐 网络请求监控和拦截
- 🔐 登录状态自动检测
- 📊 HAR (HTTP Archive) 日志生成
- 📸 页面截图
- 🎯 JavaScript 执行
- 🔄 DOM 操作和提取
- 💻 跨平台支持 (macOS, Windows, Linux)

## 安装

```bash
npm install
```

## 快速开始

### 基础使用

```typescript
import { launch, CDPClient } from './src';

async function main() {
  // 启动 Chrome
  const chrome = await launch({
    headless: false,
    startingUrl: 'https://example.com'
  });

  try {
    // 连接到 CDP
    const client = new CDPClient({
      port: chrome.port,
      name: 'my-client'
    });
    await client.connect();

    // 导航到页面
    await client.navigate('https://example.com');

    // 执行 JavaScript
    const title = await client.executeScript('document.title');
    console.log('Page title:', title);

    // 截图
    const screenshot = await client.screenshot('png');
    // 保存截图...
  } finally {
    // 清理
    await client.close();
    chrome.kill();
  }
}

main().catch(console.error);
```

### 网络监控

```typescript
import { launch, CDPClient } from './src';

async function main() {
  const chrome = await launch({ headless: false });
  const client = new CDPClient({
    port: chrome.port,
    watchUrls: [
      'https://api.example.com/data',
      'https://api.example.com/user'
    ]
  });
  await client.connect();

  // 添加网络请求回调
  client.addNetworkCallback('https://api.example.com/data', (response, request) => {
    console.log('API Response:', response);
    console.log('Request body:', request);
  });

  // 导航到页面触发请求
  await client.navigate('https://example.com');

  // 获取 HAR 日志
  const har = client.getHAR();
  console.log('Total requests:', har.log.entries.length);

  await client.close();
  chrome.kill();
}

main().catch(console.error);
```

### 登录状态监控

```typescript
import { launch, CDPClient } from './src';

async function main() {
  const chrome = await launch({ headless: false });
  const client = new CDPClient({
    port: chrome.port,
    loginCallback: (state) => {
      console.log(`Login state: ${state}`);
    },
    loginUrlPatterns: {
      loginUrl: 'https://example.com/login',
      targetPrefix: 'https://example.com'
    }
  });
  await client.connect();

  // 自动监控登录/登出状态
  await client.navigate('https://example.com');

  await client.close();
  chrome.kill();
}

main().catch(console.error);
```

## API 文档

### Launcher

#### `launch(options: LaunchOptions): Promise<ChromeInstance>`

启动 Chrome 浏览器实例。

**参数:**
- `options.chromePath?: string` - Chrome 可执行文件路径
- `options.chromeFlags?: string[]` - Chrome 启动参数
- `options.userDataDir?: string | false` - 用户数据目录
- `options.port?: number` - 调试端口 (0 表示自动分配)
- `options.startingUrl?: string` - 起始 URL
- `options.headless?: boolean` - 是否无头模式
- `options.ignoreDefaultFlags?: boolean` - 是否忽略默认参数
- `options.prefs?: Record<string, any>` - 浏览器偏好设置
- `options.envVars?: Record<string, string>` - 环境变量

**返回:** `Promise<ChromeInstance>`
```typescript
{
  pid: number;
  port: number;
  kill: () => void;
  process: ChildProcess;
}
```

### CDPClient

#### `constructor(config: CDPClientConfig)`

创建 CDP 客户端实例。

**参数:**
- `config.port: number` - Chrome 调试端口
- `config.name?: string` - 客户端名称
- `config.watchUrls?: string[]` - 要监控的 URL 列表
- `config.loginCallback?: (state: 'login' | 'logout') => void` - 登录状态回调
- `config.loginUrlPatterns?: { loginUrl: string; targetPrefix: string }` - 登录 URL 模式
- `config.disconnectCallback?: () => void` - 断开连接回调

#### `connect(): Promise<CDP.Client>`

连接到 Chrome DevTools Protocol。

#### `navigate(url: string): Promise<void>`

导航到指定 URL。

#### `reload(): Promise<void>`

重新加载当前页面。

#### `executeScript(script: string): Promise<any>`

在页面上下文中执行 JavaScript 代码。

#### `getDOM(): Promise<string>`

获取完整的页面 HTML。

#### `screenshot(format?: 'png' | 'jpeg', quality?: number): Promise<string>`

截取页面截图，返回 base64 编码的图片数据。

#### `addNetworkCallback(url: string, callback: (response: any, request?: string) => void): void`

添加网络请求回调函数。

#### `removeNetworkCallback(url: string): void`

移除网络请求回调函数。

#### `getHAR(): HAR`

获取 HAR 日志对象。

#### `close(): Promise<void>`

关闭客户端连接。

#### `isConnected(): boolean`

检查客户端是否已连接。

## 示例

项目包含以下示例代码：

- `examples/basic-usage.ts` - 基础使用示例
- `examples/network-monitoring.ts` - 网络监控示例
- `examples/login-monitoring.ts` - 登录状态监控示例

运行示例：

```bash
npm run example
```

## 项目结构

```
ts-cdp/
├── src/
│   ├── browser/
│   │   └── client.ts          # CDP 客户端核心
│   ├── network/
│   │   └── listener.ts        # 网络监听器
│   ├── launcher/
│   │   ├── index.ts           # Chrome 启动器
│   │   └── chrome-finder.ts   # Chrome 路径查找
│   ├── types/
│   │   └── index.ts           # TypeScript 类型定义
│   ├── utils/
│   │   ├── logger.ts          # 日志工具
│   │   └── url.ts             # URL 工具
│   └── index.ts               # 主入口
├── examples/                  # 示例代码
├── package.json
├── tsconfig.json
└── README.md
```

## 构建

```bash
npm run build
```

## 开发

```bash
npm run dev
```

## 依赖

- `chrome-remote-interface` - Chrome DevTools Protocol 客户端
- TypeScript 5.0+

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！