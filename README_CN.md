# unplugin-devpilot

一个通用的开发工具插件框架，实现无缝的浏览器-服务器通信和 MCP (Model Context Protocol) 与 AI/LLM 系统的集成。

## 功能特性

- 🔌 **通用插件系统** - 一次编写，处处使用
- 🌐 **多构建工具支持** - 通过 [unplugin](https://github.com/unjs/unplugin) 支持 Vite、Webpack、Rspack、Farm 等
- 🔄 **实时双向通信** - 基于 WebSocket 的浏览器与开发服务器间的双向 RPC 通信
- 🤖 **MCP 集成** - 内置 Model Context Protocol 服务器，支持 AI/LLM 自动化
- 🎯 **DOM 检查器插件** - 开箱即用的 DOM 检查和操控能力，用于网页自动化
- 🛠️ **仅开发模式** - 零生产环境开销，仅在开发模式下运行

## 快速开始

### 安装

```bash
npm install -D unplugin-devpilot
npm install -D devpilot-plugin-dom-inspector
```

### 配置

<details>
<summary><b>Vite</b></summary>

```ts
// vite.config.ts
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot from 'unplugin-devpilot/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
});
```

</details>

<details>
<summary><b>Webpack</b></summary>

```js
// webpack.config.js
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot from 'unplugin-devpilot/webpack';

export default {
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
};
```

</details>

<details>
<summary><b>Rspack</b></summary>

```ts
// rspack.config.ts
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot from 'unplugin-devpilot/rspack';

export default {
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
};
```

</details>

### 客户端导入

在你的项目入口文件中添加以下导入来启用 devpilot 客户端：

```ts
// main.ts 或 main.js (入口文件)
import 'virtual:devpilot-client';
```

这个导入会激活到开发服务器的 WebSocket 连接，并在客户端初始化所有已注册的插件。

## 包介绍

### [unplugin-devpilot](./packages/unplugin-devpilot)

核心插件框架，提供：
- 通过 unplugin 支持多个构建工具
- WebSocket 服务器用于浏览器-服务器通信
- MCP 服务器用于 AI/LLM 集成
- 带命名空间隔离的插件系统
- 客户端代码的虚拟模块生成

### [devpilot-plugin-dom-inspector](./packages/devpilot-plugin-dom-inspector)

内置的 DOM 检查插件，提供：
- 优化 LLM token 使用的紧凑 DOM 快照
- 通过 devpilot-id 或 CSS 选择器查询元素（支持 :has() 和高级选择器）
- 元素交互功能（点击、输入文本）
- 滚动元素到视口
- 视觉布局分析
- 浏览器控制台日志访问
- 页面和元素截图捕获
- 8 个用于网页自动化的 MCP 工具

**MCP 工具：**
- `get_page_snapshot` - 获取 LLM 友好的 DOM 结构（紧凑、高效）
- `get_visual_hierarchy` - 分析视觉布局层级和覆盖关系
- `get_element_details` - 获取全面的元素信息（HTML + 可访问性 + 位置）
- `click_element` - 点击元素
- `input_text` - 填充表单字段
- `get_console_logs` - 访问浏览器日志（按客户端过滤）
- `scroll_to_element` - 滚动元素到视口（用于滚动容器）
- `capture_screenshot` - 捕获页面或元素截图（不带 CORS 头的跨域图片可能显示为空白）

**元素 ID 格式：** 所有元素标识符使用 `e` 前缀格式（如 `e1`, `e2`, `e123`）。`get_page_snapshot` 工具返回的 `devpilotId` 采用此格式，可直接用于其他 API。

## 使用场景

### 网页自动化
自动化浏览器交互和 DOM 操控，用于测试和脚本编写。

### AI/LLM 集成
通过标准化的 MCP 工具使 AI 系统能够与网页应用交互。

### 开发工具
利用实时浏览器访问能力构建自定义开发工具和扩展。

### 浏览器调试
通过实时服务器通信调试和检查网页应用。

## 架构概览

```
┌────────────────────────────────────────────┐
│         Web 应用浏览器                     │
│  ┌─────────────────────────────────────┐   │
│  │  虚拟模块: devpilot-client          │   │
│  │  - WebSocket 连接                   │   │
│  │  - RPC 处理函数                     │   │
│  │  - 插件客户端模块                   │   │
│  └─────────────────────────────────────┘   │
│           ▲                    ▲           │
│           │ WebSocket          │ RPC       │
└───────────┼────────────────────┼───────────┘
            │                    │
┌───────────┼────────────────────┼──────────┐
│           ▼                    ▼          │
│  ┌─────────────────────────────────────┐  │
│  │    开发服务器 (Node.js)             │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  WebSocket 服务器 (:3100)    │   │  │
│  │  │  - 客户端管理                │   │  │
│  │  │  - RPC 路由                  │   │  │
│  │  └──────────────────────────────┘   │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  MCP 服务器 (:3101)          │   │  │
│  │  │  - 工具注册                  │   │  │
│  │  │  - 工具调用                  │   │  │
│  │  └──────────────────────────────┘   │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  插件系统                    │   │  │
│  │  │  - DOM 检查器                │   │  │
│  │  │  - 自定义插件                │   │  │
│  │  └──────────────────────────────┘   │  │
│  └─────────────────────────────────────┘  │
│           ▲                               │
│           │ MCP 协议                      │
└───────────┼───────────────────────────────┘
            │
    ┌───────┴───────┐
    │               │
┌───▼──┐      ┌─────▼────┐
│ LLM  │      │ AI 工具  │
└──────┘      └──────────┘
```

## 插件开发

创建自定义插件：

```ts
import type { DevpilotPlugin } from 'unplugin-devpilot';
import { defineMcpToolRegister, resolveClientModule } from 'unplugin-devpilot';
import { z } from 'zod';

export default {
  namespace: 'my-plugin',
  clientModule: resolveClientModule(import.meta.url, './client/index.mjs'),

  serverSetup(ctx) {
    return {
      // 服务端 RPC 方法
      myServerMethod: (arg: string) => `Result: ${arg}`,
    };
  },

  mcpSetup(ctx) {
    return [
      defineMcpToolRegister(
        'my_tool',
        {
          title: '我的工具',
          description: '自定义 MCP 工具',
          inputSchema: z.object({
            param: z.string(),
          }),
        },
        async (params) => {
          // 工具实现
          return {
            content: [{
              type: 'text' as const,
              text: `工具结果: ${params.param}`,
            }],
          };
        },
      ),
    ];
  },
} satisfies DevpilotPlugin;
```

### 插件存储

每个插件通过 `ctx.storage` 获得一个**命名空间隔离的存储**实例（基于 [unstorage](https://github.com/unjs/unstorage)），在 `serverSetup` 和 `mcpSetup` 中均可使用。各插件的存储互相隔离，不会冲突。

#### 服务端：读写数据

```ts
export default {
  // 在 serverSetup 或 mcpSetup 中使用
  serverSetup(ctx) {
    return {
      async saveData(items: MyData[]) {
      // 领域逻辑在服务端执行
        const existing = await ctx.storage.getItem<MyData[]>('key') || [];
        const merged = [...existing, ...items];
        await ctx.storage.setItem('key', merged);
      },
    };
  },

  mcpSetup(ctx) {
  // MCP 工具直接从存储读取，无需经过浏览器 RPC
    const data = await ctx.storage.getItem<MyData[]>('key') || [];
  },
};
```

#### 客户端：通过 RPC 桥接的基础 KV 操作

客户端可使用 `createClientStorage` 进行简单的键值操作，底层通过 WebSocket RPC 桥接到服务端存储：

```ts
import { createClientStorage, getDevpilotClient } from 'unplugin-devpilot/client';

const client = getDevpilotClient();
const storage = createClientStorage(client, 'my-plugin');

await storage.setItem('key', value);
const data = await storage.getItem<MyType>('key');
```

#### 客户端：调用插件服务端方法

对于领域相关的操作（如增量追加、去重等），应在 `serverSetup` 中定义方法，客户端通过 `rpcCall` 调用：

```ts
// shared-types.ts - Shared type ensures client and server stay in sync
export interface MyPluginServerMethods extends Record<string, (...args: any[]) => any> {
  appendData: (items: MyData[]) => Promise<void>
}

// server (index.ts)
export default <DevpilotPlugin>{
  serverSetup(ctx): MyPluginServerMethods {
    return {
      async appendData(items) {
        const existing = await ctx.storage.getItem<MyData[]>('data') || [];
        await ctx.storage.setItem('data', [...existing, ...items].slice(-500));
      },
    };
  },
};
```

```ts
// client
import { getDevpilotClient } from 'unplugin-devpilot/client';

const client = getDevpilotClient<MyPluginServerMethods>();
client.rpcCall('appendData', batch);
```

这种模式将领域逻辑保留在服务端，最小化 RPC 负载，并在两端维持类型安全。

## 开发

### 前置要求
- Node.js 22+
- pnpm@~9

### 安装依赖
```bash
pnpm install
```

### 构建
```bash
pnpm build
```

### 开发模式
```bash
pnpm dev
```

### 运行测试
```bash
pnpm test
```

### 类型检查
```bash
pnpm typecheck
```

## 配置

### 端口配置

插件会自动管理端口分配以防止冲突：

```ts
Devpilot({
  wsPort: 3100, // 可选：WebSocket 服务器端口（未指定时随机分配）
  mcpPort: 3101, // 可选：MCP 服务器端口（被占用时会报错）
  plugins: [/* ... */],
});
```

**端口分配策略：**
- **wsPort**: 提供时，如果端口可用则使用该端口；否则随机分配一个可用端口。未提供时，自动分配一个随机可用端口。这确保没有端口冲突。
- **mcpPort**: 未提供时，默认使用 3101。如果该端口已被占用，会抛出错误。

这确保你的 MCP 服务器在可预测的端口上运行。如果默认端口被占用，你需要指定不同的端口或释放被占用的端口。

### 插件选项
每个插件可以根据其实现进行配置。请参考各个插件的文档。

## 性能

- **零生产成本** - 仅在开发模式运行
- **最小开销** - 懒加载插件客户端模块
- **高效通信** - 二进制 WebSocket 消息
- **Token 优化** - 为 LLM 使用优化的紧凑 DOM 快照

## 故障排除

### WebSocket 连接失败
- 确保开发服务器正在运行
- 检查端口 3100 是否未被防火墙阻止
- 验证 `wsPort` 配置是否正确

### MCP 工具不可用
- 确认插件已在配置中注册
- 检查服务器日志中的插件加载错误
- 验证 MCP 服务器是否在端口 3101 上运行

### 客户端未找到
- 刷新浏览器页面以重新连接
- 检查浏览器控制台中的连接错误
- 使用 `get_visual_hierarchy` 或 `list_clients` 工具发现可用客户端

## 许可证

MIT © 2025 [zcf0508](https://github.com/zcf0508)

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 相关资源

- [GitHub 仓库](https://github.com/zcf0508/unplugin-devpilot)
- [unplugin 文档](https://github.com/unjs/unplugin)
- [Model Context Protocol](https://modelcontextprotocol.io)
