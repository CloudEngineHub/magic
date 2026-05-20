# CanvasDesign 插件运行时设计

## 1. 目标

CanvasDesign 插件模块需要同时满足三个目标：

1. **前端 runtime 易解析**：插件包结构固定，列表展示无需执行插件脚本。
2. **用户开发足够方便**：插件作者可以写普通 HTML / DOM / JS，不需要前端框架或构建工具。
3. **运行安全可控**：插件运行在沙箱 iframe 中，通过受控 RPC 调用 CanvasDesign 能力，不能直接访问宿主 Canvas 实例或 DOM。

因此第一版建议采用：

```text
manifest.json + iframe sandbox + index.js + postMessage RPC
```

插件脚本不直接运行在 CanvasDesign 主窗口中，而是在 iframe 沙箱内运行。CanvasDesign 只负责加载插件元信息、创建 iframe、建立消息通道、注入能力代理。

## 2. 插件包结构

推荐插件目录：

```text
virtual-tryon/
├── manifest.json
├── index.css
├── index.js
└── media/             optional，自定义资源目录名，仅作示例
```

### 2.1 `manifest.json`

`manifest.json` 是插件的静态描述文件，CanvasDesign 可以在不执行插件代码的情况下解析插件列表。

```json
{
	"description": "{{description}}",
	"entry": "index.js",
	"icon": "👗",
	"label": "{{label}}",
	"locales": {
		"en-US": {
			"button.generate": "Generate Try-On Image",
			"button.pickGarments": "Upload Product Images",
			"button.pickModel": "Upload Model Image (Optional)",
			"description": "Upload clothing, footwear, and accessory product images to generate model try-on images.",
			"label": "Virtual Try-On"
		},
		"zh-CN": {
			"button.generate": "一键生成穿搭图",
			"button.pickGarments": "上传商品图",
			"button.pickModel": "上传模特底图（可选）",
			"description": "上传服饰、鞋靴、配饰等商品图，一键生成模特上身穿搭图。",
			"label": "万物上身"
		}
	},
	"name": "virtual-tryon",
	"styles": "index.css",
	"tags": ["AI", "电商", "穿搭"],
	"version": "1.0.0"
}
```

字段说明：

| 字段          | 类型                                     | 必填 | 说明                                                                  |
| ------------- | ---------------------------------------- | ---- | --------------------------------------------------------------------- |
| `name`        | `string`                                 | 是   | 插件唯一名称，建议 kebab-case                                         |
| `version`     | `string`                                 | 否   | 插件版本                                                              |
| `icon`        | `string`                                 | 否   | 单字符 emoji，或指向插件包内媒体资源的相对路径，例如 `media/icon.png` |
| `tags`        | `string[]`                               | 否   | 插件标签                                                              |
| `label`       | `string`                                 | 是   | 展示名称占位符，例如 `{{label}}`                                      |
| `description` | `string`                                 | 是   | 描述占位符，例如 `{{description}}`                                    |
| `entry`       | `string`                                 | 是   | 插件 iframe 内执行的 JS 入口，相对插件目录                            |
| `styles`      | `string \| string[]`                     | 否   | 插件 CSS 文件路径，相对插件目录                                       |
| `locales`     | `Record<string, Record<string, string>>` | 是   | 插件多语言文案                                                        |

`icon` 解析规则：

- 如果是单字符 emoji，直接作为文本图标展示。
- 如果是路径，只允许解析为当前插件包内的媒体资源，例如 `media/icon.png`。
- 不允许远程 URL、`data:`、`blob:`、绝对路径、`../` 跨目录路径或跨插件资源引用。
- runtime 展示路径型 icon 前，需要把它解析成当前插件包资源的安全 URL。

### 2.2 `locales`

`locales` 固定写在 `manifest.json` 中，存放插件多语言文案。`manifest.json` 的 `label`、`description` 和 `index.js` 都通过 key 引用这里的内容。

解析规则：

```text
manifest.label = "{{label}}" → manifest.locales -> 当前语言 -> label
manifest.description = "{{description}}" → manifest.locales -> 当前语言 -> description
```

### 2.3 `index.js`

`index.js` 是插件运行入口，必须是浏览器可执行的标准 JS。  
runtime 不支持把非 JS 源码作为入口。

推荐入口形态：

```js
registerMagicCanvasPlugin({
	async mount(ctx, root) {
		const panel = document.createElement("div")
		panel.className = "panel"

		const title = document.createElement("h3")
		title.textContent = "万物上身"

		const button = document.createElement("button")
		button.className = "primary"
		button.textContent = "选择商品图并生成"

		const handleClick = async () => {
			const images = await ctx.assets.pickFiles({ type: "image", multiple: true })
			await ctx.ai.generateAndPlace({
				prompt: "A fashion model wearing all reference clothing items.",
				referenceImages: images,
				count: 1,
			})
			ctx.ui.toast("生成成功", "success")
		}

		button.addEventListener("click", handleClick)
		panel.append(title, button)
		root.append(panel)

		return () => {
			button.removeEventListener("click", handleClick)
			root.replaceChildren()
		}
	},
})
```

## 3. 为什么使用 iframe 沙箱

如果插件脚本直接在主窗口执行，即使使用 Shadow DOM，也只能隔离样式，不能隔离 JS 权限。插件仍然可以访问：

- `window`
- `document`
- `localStorage`
- 宿主 DOM
- 同源接口

对于用户插件或未来插件市场，这是不够安全的。

iframe 沙箱可以把插件 JS 放到独立执行环境中，并通过 `sandbox` 限制能力：

```html
<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" />
```

第一版建议默认只开启：

```text
allow-scripts
```

不建议开启：

- `allow-same-origin`
- `allow-forms`
- `allow-popups`
- `allow-top-navigation`

这样插件不能直接访问宿主同源资源，也不能操作父页面，只能通过 `postMessage` 请求 CanvasDesign 暴露的能力。

## 4. runtime 总体架构

```text
CanvasDesign 主窗口
├── PluginRegistry
│   ├── 读取 manifest.json
│   ├── 校验插件元信息
│   └── 维护 builtin / user 插件列表
│
├── PluginHost
│   ├── 创建 iframe
│   ├── 注入 bootstrap HTML
│   ├── 建立 MessageChannel
│   └── 管理插件生命周期
│
└── PluginCapabilityBridge
    ├── 接收 iframe RPC 请求
    ├── 校验 capability 权限
    ├── 调用 CanvasDesign 内部能力
    └── 返回结果或错误

iframe 插件沙箱
├── bootstrap runtime
│   ├── load script(entry)
│   ├── 创建 ctx 代理
│   └── 调用 plugin.mount(ctx, root)
│
└── plugin index.js
    └── 编写 DOM 并调用 ctx 能力
```

## 5. 插件生命周期

建议定义以下生命周期：

```text
registered
  ↓
manifest-loaded
  ↓
iframe-created
  ↓
script-loaded
  ↓
mounted
  ↓
unmounted
```

运行时内部可维护：

```ts
interface PluginRuntimeInstance {
	id: string
	source: "builtin" | "user"
	manifest: CanvasDesignPluginManifest
	iframe: HTMLIFrameElement
	status: "loading" | "mounted" | "failed" | "unmounted"
	cleanup?: () => void | Promise<void>
	error?: string
}
```

卸载时必须做兜底清理：

1. 通知 iframe 执行插件 cleanup。
2. 等待确认或超时。
3. 移除 iframe。
4. 清理 pending RPC。
5. 清理插件实例状态。

## 6. iframe bootstrap 设计

CanvasDesign 创建 iframe 后，可以通过 `srcdoc` 注入一段固定 bootstrap HTML。

示例：

```html
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>
			html,
			body,
			#root {
				margin: 0;
				width: 100%;
				min-height: 100%;
				font-family: system-ui, sans-serif;
			}
		</style>
	</head>
	<body>
		<div id="root"></div>
		<script>
			// bootstrap code injected by CanvasDesign runtime
		</script>
	</body>
</html>
```

bootstrap 负责：

1. 接收主窗口传来的插件 `entryUrl`。
2. 注入全局注册函数 `registerMagicCanvasPlugin(plugin)`。
3. 用普通 `<script src="entryUrl">` 加载插件入口。
4. 读取插件注册对象。
5. 创建 `ctx` 代理。
6. 调用 `plugin.mount(ctx, root)`。
7. 捕获错误并上报主窗口。
8. 监听主窗口的 `unmount` 指令。

## 7. 插件脚本协议

插件入口必须调用 MagicCanvas 注入的注册函数：

```js
registerMagicCanvasPlugin({
	async mount(ctx, root) {
		return cleanup
	},
})
```

不使用 `export default` 作为第一版协议，原因是插件 iframe 通过普通 `<script>` 加载入口文件，兼容性和实现复杂度都优于 ESM `type="module"` / 动态 `import()`。注册函数协议也更适合纯 JS 用户开发场景。

### 7.1 必填字段

| 字段    | 类型                                         | 说明                      |
| ------- | -------------------------------------------- | ------------------------- |
| `name`  | `string`                                     | 应与 `manifest.name` 一致 |
| `mount` | `(ctx, root) => cleanup \| Promise<cleanup>` | 插件挂载函数              |

### 7.2 `mount(ctx, root)`

`root` 是 iframe 内的 DOM 容器，不是宿主页面 DOM。

插件可以自由：

- `document.createElement`
- 添加事件监听
- 插入 `<style>`
- 创建复杂 DOM
- 使用浏览器原生 API

插件不应该：

- 假设可以访问宿主 DOM
- 直接调用父窗口对象
- 直接请求 CanvasDesign 内部接口

所有画布能力必须通过 `ctx` 调用。

## 8. RPC 通信协议

iframe 与主窗口通过 `postMessage` 或 `MessageChannel` 通信。建议使用 `MessageChannel`，每个插件实例一条独立通道。

### 8.1 消息格式

```ts
type PluginRpcRequest = {
	type: "canvas-plugin:request"
	id: string
	method: string
	params?: unknown
}

type PluginRpcResponse = {
	type: "canvas-plugin:response"
	id: string
	ok: boolean
	result?: unknown
	error?: {
		message: string
		code?: string
	}
}

type PluginRuntimeEvent = {
	type: "canvas-plugin:event"
	event: "mounted" | "unmounted" | "error" | "resize"
	payload?: unknown
}
```

### 8.2 插件侧调用

插件代码：

```js
const images = await ctx.assets.pickFiles({ type: "image", multiple: true })
await ctx.ai.generateAndPlace({ referenceImages: images, prompt: "..." })
ctx.ui.toast("生成成功", "success")
```

iframe 内 ctx 代理会转换为 RPC：

```json
{
	"id": "rpc_1",
	"method": "assets.pickFiles",
	"params": {
		"multiple": true,
		"type": "image"
	},
	"triggerPoint": {
		"x": 120,
		"y": 240
	},
	"type": "canvas-plugin:request"
}
```

主窗口执行后返回：

```json
{
	"id": "rpc_1",
	"ok": true,
	"result": [
		{
			"height": 1024,
			"id": "file_1",
			"url": "...",
			"width": 1024
		}
	],
	"type": "canvas-plugin:response"
}
```

## 9. ctx 能力设计

`ctx` 是插件唯一的画布能力入口。第一版不做通用大而全 API，只围绕“万物上身”的真实需求开放最小能力。

```js
ctx = {
	plugin,
	i18n,
	ui,
	assets,
	ai,
}
```

### 9.1 `ctx.plugin`

```js
ctx.plugin.name
ctx.plugin.version
ctx.plugin.source
```

### 9.2 `ctx.i18n`

```js
ctx.i18n.locale
ctx.i18n.t(key, fallback)
```

`ctx.i18n` 基于 `manifest.json` 内的 `locales`。插件脚本通过 `ctx.i18n.t(key, fallback)` 获取当前语言文案，例如：

```js
const title = ctx.i18n.t("label", "Virtual Try-On")
const generateText = ctx.i18n.t("button.generate", "Generate")
```

### 9.3 `ctx.ui`

```js
ctx.ui.toast(message, type)
ctx.ui.close()
ctx.ui.setHeight(height)
```

### 9.4 `ctx.assets`

```js
ctx.assets.pickFiles(options)
```

`pickFiles` 由宿主打开文件选择能力，入口可以包含“从本地上传”和“从项目选择”，并返回文件引用。iframe 内不直接接触宿主素材系统，也不直接创建系统文件选择框。这里的 `ctx.assets` 指用户素材/上传能力，不表示插件包内必须有 `assets/` 目录。图片场景传 `type: "image"`，后续可扩展到 `video`、`audio`、`file`。宿主 runtime 会自动使用最近一次用户点击位置显示下拉菜单，插件不需要传入鼠标事件。

### 9.5 `ctx.resources`

```js
const url = await ctx.resources.resolve("media/icon.png")
```

`resolve(path)` 将插件包内的安全相对路径解析为浏览器可访问 URL。插件目录结构由插件开发者自行组织，不要求固定 `assets/` 目录。宿主必须拒绝远程 URL、`data:`、`blob:`、绝对路径和 `../` 跨目录路径。

### 9.6 `ctx.ai`

```js
ctx.ai.getImageModels()
ctx.ai.generateAndPlace(params)
```

`generateAndPlace` 是插件最重要的高级能力：插件不需要自己理解画布图片节点、任务队列、占位节点、历史记录和资源缓存。

### 9.6 暂不开放的能力

以下能力先不进入第一版 `ctx`，等真实插件场景需要时再设计：

- `ctx.selection`
- `ctx.elements`
- `ctx.canvas`
- `ctx.storage`
- `ctx.events`

## 10. 权限与能力白名单

manifest 可以预留 `permissions` 字段，用于后续权限提示和 capability 校验。

```json
{
	"entry": "index.js",
	"name": "virtual-tryon",
	"permissions": ["assets:read", "ai:image-generate", "canvas:insert", "ui:toast", "ui:layout"]
}
```

主窗口收到 RPC 时根据白名单判断：

```ts
const capabilityMap = {
	"assets.pickFiles": "assets:read",
	"ai.getImageModels": "ai:image-generate",
	"ai.generateAndPlace": "ai:image-generate",
	"ui.toast": "ui:toast",
	"ui.setHeight": "ui:layout",
}
```

如果插件没有权限，返回错误：

```json
{
	"error": {
		"code": "PERMISSION_DENIED",
		"message": "Permission denied: ai:image-generate"
	},
	"ok": false
}
```

第一版内置插件可以默认授予所需权限；用户插件导入时再展示权限说明。

## 11. DOM 与样式设计

由于插件运行在 iframe 中，插件作者可以自由写复杂 DOM：

```js
const panel = document.createElement("div")
panel.className = "panel"

const style = document.createElement("style")
style.textContent = `
	.panel {
		padding: 16px;
	}
`

root.append(style, panel)
```

iframe 天然隔离插件样式，不会污染 CanvasDesign 主页面。  
插件也不能通过普通选择器访问宿主 DOM。

### 11.1 尺寸同步

插件 iframe 可以把内容高度上报给主窗口：

```js
ctx.ui.setHeight(document.body.scrollHeight)
```

或者 bootstrap 用 `ResizeObserver` 自动上报：

```js
new ResizeObserver(() => {
	postEvent("resize", {
		height: document.documentElement.scrollHeight,
	})
}).observe(document.body)
```

主窗口收到后调整插件窗口高度。

## 12. 错误处理

runtime 必须提供错误边界：

1. `manifest` 解析失败：插件不进入列表或展示损坏状态。
2. iframe 创建失败：展示加载失败。
3. `entry` import 失败：展示脚本加载失败。
4. `mount` 抛错：展示插件运行失败。
5. RPC 调用失败：返回结构化错误给插件。
6. 插件未处理的 Promise 错误：iframe bootstrap 捕获并上报。

iframe 内建议监听：

```js
window.addEventListener("error", reportError)
window.addEventListener("unhandledrejection", reportError)
```

主窗口错误展示可以包含：

- 插件名称
- 错误 message
- 是否可重试
- 是否移除插件

## 13. 用户开发体验

第一版只支持纯 JS 插件开发，不设计框架运行时、JSX 编译或依赖共享。

插件包：

```text
my-plugin/
├── manifest.json
└── index.js
```

用户直接写 DOM、CSS 和普通 JS。复杂 UI 可以通过拆函数、DOM helper 或模板字符串组织，但最终仍然是 `index.js`。

### 13.1 推荐脚手架

后续可以提供：

```bash
pnpm create canvas-plugin
```

生成：

```text
plugin/
├── manifest.json
├── index.css
├── index.js
└── media/        optional，自定义资源目录名
```

脚手架只负责生成标准纯 JS 插件包，不引入框架构建链路。

## 14. 内置插件与用户插件

插件来源用 `source` 区分：

```ts
type CanvasDesignPluginSource = "builtin" | "user"
```

### 14.1 内置插件

内置插件随 CanvasDesign 代码发布：

```text
canvas/plugins/virtual-tryon/
├── manifest.json
├── index.css
└── index.js
```

`options.ts` 读取 manifest 后补充：

```ts
source: "builtin"
```

### 14.2 用户插件

用户插件可以来自 zip：

```text
my-plugin.zip
└── my-plugin/
    ├── manifest.json
    ├── index.css
    └── index.js
```

导入流程：

1. 解压 zip。
2. 查找 `manifest.json`。
3. 校验 manifest。
4. 校验 entry 文件存在。
5. 保存插件文件到 IndexedDB 或 Origin Private File System。
6. 注册为 `source: "user"`。

## 15. 推荐第一版实现范围

第一版建议只做最小闭环：

1. 插件包固定为 `manifest.json + index.js`，可通过 `manifest.styles` 声明 CSS，多语言文案合并在 `manifest.locales`。
2. 插件脚本协议固定为 `registerMagicCanvasPlugin({ mount(ctx, root) })`。
3. 内置插件从本地目录加载。
4. 插件运行在 sandbox iframe。
5. 主窗口和 iframe 使用 `MessageChannel` RPC。
6. `ctx` 第一版只开放：
    - `ctx.plugin`
    - `ctx.i18n.locale`
    - `ctx.i18n.t`
    - `ctx.ui.toast`
    - `ctx.ui.setHeight`
    - `ctx.resources.resolve`
    - `ctx.assets.pickFiles`
    - `ctx.ai.getImageModels`
    - `ctx.ai.generateAndPlace`
7. 插件卸载支持 cleanup。
8. iframe 错误上报和主窗口错误展示。

暂不做：

- 用户插件 zip 导入
- 插件市场
- 插件热更新
- 插件权限弹窗
- 双向事件订阅全量开放

## 16. “万物上身”插件形态

`virtual-tryon` 适合作为 iframe panel 插件：

```js
registerMagicCanvasPlugin({
	async mount(ctx, root) {
		// 1. 创建上传商品图区域
		// 2. 创建可选模特图上传区域
		// 3. 创建风格、模型、数量等表单
		// 4. 点击生成时调用 ctx.ai.generateAndPlace
		// 5. 返回 cleanup
	},
})
```

它需要的能力：

```text
assets.pickFiles
ai.getImageModels
ai.generateAndPlace
ui.toast
ui.setHeight
```

由于插件 UI 在 iframe 中，万物上身可以放心写大量 DOM 和 CSS，不会污染 CanvasDesign。

## 17. 总结

CanvasDesign 插件系统建议采用：

```text
manifest 静态解析 + iframe 沙箱运行 + postMessage/MessageChannel RPC + ctx 能力白名单
```

这套方案的核心优势：

- 插件列表展示不需要执行 JS。
- 插件可以写复杂 DOM 和 CSS。
- iframe 隔离样式和 JS 运行环境。
- CanvasDesign 能力通过 ctx 受控开放。
- 后续可自然扩展到用户插件和插件市场。

第一版不要追求插件框架功能过多，先把 `manifest`、`iframe runtime`、`mount(ctx, root)`、`ctx.ai.generateAndPlace` 这条链路打通，就能支撑“万物上身”这类真实业务插件。
