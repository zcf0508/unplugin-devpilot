# unplugin-devpilot

一个通用的开发工具插件框架，实现无缝的浏览器-服务器通信和 MCP (Model Context Protocol) 与 AI/LLM 系统的集成。

## 功能特性

- 🔌 **通用插件系统** - 一次编写，处处使用
- 🌐 **多构建工具支持** - 通过 [unplugin](https://github.com/unjs/unplugin) 支持 Vite、Webpack、Rspack、Farm 等
- 🔄 **实时双向通信** - 基于 WebSocket 的浏览器与开发服务器间的双向 RPC 通信（支持 HTTP 和 HTTPS）
- 🤖 **MCP 集成** - 内置 Model Context Protocol 服务器，支持 AI/LLM 自动化
- 🎯 **DOM 检查器插件** - 开箱即用的 DOM 检查和操控能力，用于网页自动化
- 🛠️ **仅开发模式** - 零生产环境开销，仅在开发模式下运行
- 🔒 **HTTPS 支持** - 通过自动 WebSocket 代理与 HTTPS 开发服务器无缝协作

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

WebSocket 代理会自动配置，支持 HTTP 和 HTTPS 开发服务器。

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

WebSocket 代理会在 webpack-dev-server 中自动配置。

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

WebSocket 代理会在 rspack-dev-server 中自动配置。

</details>

<details>
<summary><b>Farm</b></summary>

```ts
// farm.config.ts
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot, { getProxyConfig } from 'unplugin-devpilot/farm';

// 注意：wsPort 是 WebSocket 服务器端口（从控制台输出获取）
export default defineConfig({
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
  server: {
    proxy: getProxyConfig(60427),
  },
});
```

Farm 需要手动配置代理。`getProxyConfig(wsPort)` 辅助函数会生成正确的代理配置。实际的 `wsPort` 会在开发服务器启动时输出到控制台。

</details>

### 客户端导入

在你的项目入口文件中添加以下导入来启用 devpilot 客户端：

```ts
// main.ts 或 main.js (入口文件)
import 'virtual:devpilot-client';
```

这个导入会激活到开发服务器的 WebSocket 连接，并在客户端初始化所有已注册的插件。

### 任务 UI（开发环境）

会自动挂载基于 Lit + Shadow DOM 的浮层：**Tasks** 每秒轮询并展示待办与进行中；进行中任务可在面板 **Get approval token** 后，再在 MCP 里调用 **complete_task**。**Alt+Shift+I** 提交任务；Agent 侧典型流程：**get_pending_tasks**（常设 `clearAfterFetch: false`）→ **claim_task** → 开发者确认后发 token → **complete_task**。右下角 **Devpilot** 角标显示待处理数量。

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
- `get_console_logs` - 访问浏览器日志（仅 error/warn/info/debug；不收集 `console.log`）
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
            │  WSS (通过 dev     │   WS (直接)
            │  服务器代理)       │
┌───────────┼────────────────────┼──────────┐
│           ▼                    ▼          │
│  ┌─────────────────────────────────────┐  │
│  │    开发服务器 (Node.js)             │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  WebSocket 代理              │   │  │
│  │  │  (为所有构建工具             │   │  │
│  │  │   自动配置)                  │   │  │
│  │  └──────────────────────────────┘   │  │
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

### Skill 文件

插件可以提供 `skillModule` 来帮助 LLM 理解和使用插件的功能。这是一个 Markdown 文件或文件夹，用于描述插件的用途、可用工具和使用方式。

```ts
import type { DevpilotPlugin } from 'unplugin-devpilot';
import { resolveModule } from 'unplugin-devpilot';

export default {
  namespace: 'my-plugin',
  clientModule: resolveClientModule(import.meta.url, './client/index.mjs'),
  skillModule: resolveModule(import.meta.url, './skill.md'), // 或 './skills' 文件夹
  // ...
} satisfies DevpilotPlugin;
```

**单文件模式：**

```ts
skillModule: resolveModule(import.meta.url, './skill.md');
```

Skill 文件会被复制到输出目录，命名为 `{namespace}.md`。

**文件夹模式：**

```ts
skillModule: resolveModule(import.meta.url, './skills');
```

使用文件夹时：
- 如果存在 `index.md`，链接指向 `{namespace}/index.md`
- 如果没有 `index.md`，链接指向 `{namespace}/`，由 LLM 自行探索文件夹内容
- 文件夹中的所有文件会被递归复制

**Skill 文件编写建议：**

- 核心指令保持在 100 行以内
- 包含工具描述、参数说明和使用示例
- 对于复杂插件，使用文件夹模式组织多个 `.md` 文件

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

插件在内部自动管理端口分配：

```ts
Devpilot({
  mcpPort: 3101, // 可选：MCP 服务器端口（默认 3101）
  plugins: [/* ... */],
});
```

**端口分配：**
- **WebSocket**: 端口在内部自动分配。WebSocket 连接通过开发服务器代理（通过 `/__devpilot_ws`），因此可以无缝支持 HTTP 和 HTTPS。
- **MCP**: 默认端口 3101。如果被占用，请指定不同端口或释放被占用的端口。

### HTTPS 支持

插件自动支持 HTTPS 开发服务器（如使用 `unplugin-https-reverse-proxy` 或 Vite 内置 HTTPS）。WebSocket 连接通过开发服务器使用相同的协议代理：

- **HTTP 页面**：通过 `ws://` 连接（WebSocket）
- **HTTPS 页面**：通过 `wss://` 连接（安全 WebSocket）

HTTPS 支持无需额外配置。

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
- 对于 HTTPS 服务器，确保证书被浏览器信任
- 检查浏览器控制台中的连接错误

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
