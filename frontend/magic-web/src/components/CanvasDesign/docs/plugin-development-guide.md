# MagicCanvas 插件开发手册

本文面向 MagicCanvas 插件开发者，说明如何用**纯 JavaScript** 编写一个可被 MagicCanvas 加载和运行的插件。

## 1. 插件是什么

MagicCanvas 插件是一段运行在独立 iframe 沙箱中的 JavaScript 脚本。插件可以自由创建 DOM、编写样式、绑定事件，并通过 `ctx` 调用 MagicCanvas 暴露的画布能力。

插件最终交付物是一个目录或 zip 包：

```text
my-plugin/
├── manifest.json
├── index.css
└── index.js
```

第一版只支持纯 JS 场景：

- `manifest.json` 描述插件信息；
- `manifest.json` 内的 `locales` 存放插件文案；
- `index.css` 存放插件样式，可通过 `manifest.json` 的 `styles` 字段声明；
- `index.js` 是浏览器可执行的普通 JavaScript 脚本；
- 不支持把非 JS 源码文件直接作为运行入口；
- 不要求插件使用任何前端框架；
- 插件 UI 推荐直接使用 DOM API 编写。

## 2. 快速开始

创建插件目录：

```text
hello-plugin/
├── manifest.json
├── index.css
└── index.js
```

### 2.1 编写 `manifest.json`

```json
{
	"description": "{{description}}",
	"entry": "index.js",
	"icon": "👋",
	"label": "{{label}}",
	"locales": {
		"en-US": {
			"button.showToast": "Show Toast",
			"description": "A minimal MagicCanvas plugin example.",
			"label": "Hello Plugin"
		},
		"zh-CN": {
			"button.showToast": "显示提示",
			"description": "一个最简单的 MagicCanvas 插件示例。",
			"label": "Hello 插件"
		}
	},
	"name": "hello-plugin",
	"styles": "index.css",
	"tags": ["Demo"],
	"version": "1.0.0"
}
```

### 2.2 编写 `index.js`

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		const panel = document.createElement("div")
		panel.style.padding = "16px"

		const title = document.createElement("h3")
		title.textContent = ctx.i18n.t("label", "Hello Plugin")

		const button = document.createElement("button")
		button.textContent = ctx.i18n.t("button.showToast", "Show Toast")

		const handleClick = () => {
			ctx.ui.toast("Hello from plugin", "success")
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

这个插件会在插件面板中渲染一个标题和按钮，点击按钮后调用 MagicCanvas 的 toast 能力。

### 2.3 内置插件共享 kit（可选）

如果是仓库内置插件，而不是给第三方单独分发的纯插件包，可以在 `plugins/shared/` 下维护一层共享的 `magic-plugin-kit`，把重复的 DOM 工具、图片上传区块、标签按钮组选项、模型参数区块等能力收口到一个可复用库里。

约束：

- `magic-plugin-kit` 只是一层 **mount 内部实现复用**，不改变插件协议；
- 每个插件仍然必须以 `registerMagicCanvasPlugin({ mount(ctx, root) { ... } })` 作为入口；
- 每个插件仍然在自己的 iframe 中独立渲染、独立持有 state 和 cleanup；
- kit 应优先提供通用能力（如 `optionGroup`、`fileGrid`），不要把业务语义写死进共享层。

## 3. 插件包结构

推荐结构：

```text
my-plugin/
├── manifest.json       required，插件配置
├── index.css           optional，插件样式
├── index.js            required，插件运行入口
└── media/              optional，自定义资源目录名，仅作示例
```

MagicCanvas 根据 `manifest.json` 的 `entry` 字段加载运行入口，并根据 `styles` 字段加载插件 CSS。`entry` 必须指向插件包内的纯 JS 文件，`styles` 只能指向插件包内的 CSS 文件。插件资源不需要固定放在 `assets/` 目录，任意插件包内安全相对路径都可以通过 `ctx.resources.resolve(path)` 解析。

## 4. `manifest.json` 配置

`manifest.json` 用于描述插件元信息、定位运行脚本，并通过 `locales` 字段内置多语言文案。`label`、`description` 等字段可以使用 `{{key}}` 占位符引用 `locales` 中的文案。

```json
{
	"description": "{{description}}",
	"entry": "index.js",
	"icon": "👗",
	"label": "{{label}}",
	"locales": {
		"en-US": {
			"button.generate": "Generate Try-On Image",
			"description": "Upload clothing, footwear, and accessory product images to generate model try-on images.",
			"label": "Virtual Try-On"
		},
		"zh-CN": {
			"button.generate": "一键生成穿搭图",
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

| 字段          | 必填 | 说明                                                                                  |
| ------------- | ---- | ------------------------------------------------------------------------------------- |
| `name`        | 是   | 插件唯一名称，建议使用 kebab-case，例如 `virtual-tryon`                               |
| `version`     | 否   | 插件版本                                                                              |
| `icon`        | 否   | 插件图标，可以是单字符 emoji，或指向插件包内媒体资源的相对路径，例如 `media/icon.png` |
| `tags`        | 否   | 插件标签                                                                              |
| `label`       | 是   | 插件名称占位符，例如 `{{label}}`                                                      |
| `description` | 是   | 插件描述占位符，例如 `{{description}}`                                                |
| `entry`       | 是   | 运行入口 JS 文件，相对插件目录                                                        |
| `styles`      | 否   | CSS 文件路径或路径数组，相对插件目录，例如 `index.css` 或 `["index.css"]`             |
| `locales`     | 是   | 插件多语言文案，第一层为语言标识，第二层为文案 key                                    |

注意：

- `name` 只在 `manifest.json` 中声明，`index.js` 不再重复声明插件名称，避免两处不一致。
- `entry` 必须指向浏览器可执行的 JS 文件。
- `entry` 不要指向非 JS 源码文件或远程脚本。
- `styles` 不要指向远程 CSS、绝对路径或跨插件目录路径。
- `icon` 如果是路径，只能指向当前插件目录下的媒体资源；不要使用 `https://...`、`data:`、`blob:` 或跨插件路径。
- `{{label}}` 表示读取 `manifest.locales -> 当前语言 -> label`。
- `{{description}}` 表示读取 `manifest.locales -> 当前语言 -> description`。

`icon` 示例：

```json
{
	"icon": "👗"
}
```

```json
{
	"icon": "media/icon.png"
}
```

## 5. `locales` 配置

`locales` 写在 `manifest.json` 中，用于存放插件多语言文案。第一层是语言标识，第二层是文案 key。

```json
{
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
}
```

插件脚本中通过 `ctx.i18n.t(key, fallback)` 读取文案：

```js
const title = ctx.i18n.t("label", "Virtual Try-On")
const buttonText = ctx.i18n.t("button.generate", "Generate")
```

## 6. 插件入口协议

`index.js` 必须调用 MagicCanvas 注入的注册函数：

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		return cleanup
	},
})
```

iframe 运行时会在加载插件脚本前注入全局函数 `registerMagicCanvasPlugin(plugin)`。插件脚本加载完成后，MagicCanvas 会读取被注册的插件对象并调用它的 `mount(ctx, root)`。

插件运行时不需要、也不建议在 `registerMagicCanvasPlugin` 中重复声明 `name`。插件唯一名称只来自 `manifest.json`，避免两处名称不一致。

### 5.1 `mount(ctx, root)`

`mount` 是插件入口函数。用户打开插件时，MagicCanvas 会创建 iframe 沙箱，并在 iframe 内调用 `mount`。

参数：

| 参数   | 说明                                                    |
| ------ | ------------------------------------------------------- |
| `ctx`  | MagicCanvas 注入的能力对象，所有画布能力都通过它调用    |
| `root` | 插件 iframe 内的根 DOM 节点，你可以把插件 UI 挂载到这里 |

返回值：

```js
return () => {
	// cleanup
}
```

返回的 cleanup 函数会在插件关闭或卸载时执行。你应该在这里清理：

- DOM；
- 事件监听；
- 定时器；
- 未完成的异步状态；
- 第三方库实例。

`mount` 中建议只创建一次稳定 DOM 结构并绑定事件。后续数据或配置变化时，优先更新对应节点的 `textContent`、`className`、`disabled`、`value`，或只替换局部列表容器；不要在每次状态变化时对整个 `root` 执行 `replaceChildren`，否则容易造成图片闪烁、输入焦点丢失、滚动位置重置和宿主弹层锚点漂移。

## 6. 写 DOM 和样式

插件运行在独立 iframe 中，你可以自由写 DOM 和 CSS，不会污染 MagicCanvas 主页面。推荐把样式写在 `index.css`，并在 `manifest.json` 中通过 `styles` 声明，避免在 `index.js` 中写大量 CSS 字符串。

示例：

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		const panel = document.createElement("div")
		panel.className = "panel"

		const button = document.createElement("button")
		button.className = "primary"
		button.textContent = "Click me"

		panel.append(button)
		root.append(panel)

		return () => root.replaceChildren()
	},
})
```

建议：

- 所有 UI 都挂载到 `root`。
- 样式写在插件 iframe 内的 `<style>` 标签中。
- 不要依赖 MagicCanvas 主页面的 CSS。
- 不要使用 `parent.document` 或访问宿主 DOM。

## 7. 调用 MagicCanvas 能力

插件不能直接访问 MagicCanvas 内部对象。所有画布能力都通过 `ctx` 调用。

第一版只开放“万物上身”所需的最小能力：

```js
ctx.plugin
ctx.i18n
ctx.ui
ctx.resources
ctx.assets
ctx.ai
```

暂不开放选区、元素、画布、存储和事件订阅能力。后续插件有真实需求时再扩展。

## 8. 多语言能力

### 8.1 获取当前语言

```js
const locale = ctx.i18n.locale
```

### 8.2 获取文案

```js
const title = ctx.i18n.t("label", "Virtual Try-On")
const buttonText = ctx.i18n.t("button.generate", "Generate")
```

`ctx.i18n.t(key, fallback)` 会读取 `manifest.locales` 中的当前语言文案。找不到 key 时返回 `fallback`。

## 9. UI 能力

### 9.1 显示提示

```js
ctx.ui.toast("操作成功", "success")
ctx.ui.toast("生成失败", "error")
ctx.ui.toast("请先选择图片", "warning")
```

### 9.2 调整面板高度

```js
ctx.ui.setHeight(520)
```

如果插件内容高度会变化，建议在 DOM 更新后重新设置高度。

## 10. 插件包资源解析

插件包内资源不需要固定目录。使用 `ctx.resources.resolve(path)` 把插件目录内的安全相对路径解析成浏览器可访问 URL。

```js
const iconUrl = await ctx.resources.resolve("media/icon.png")
const presetUrl = await ctx.resources.resolve("data/presets.json")
```

路径规则：

- 只能传插件目录内的相对路径；
- 不允许 `https://...`、`data:`、`blob:`、绝对路径；
- 不允许 `../` 跨出插件目录。

## 11. 素材能力

### 11.1 选择图片

```js
const images = await ctx.assets.pickFiles({
	type: "image",
	multiple: true,
	maxCount: 5,
	accept: ["image/png", "image/jpeg", "image/webp"],
})
```

返回示例：

```js
;[
	{
		id: "file_1",
		url: "https://example.com/image.png",
		width: 1024,
		height: 1024,
	},
]
```

`pickFiles` 由 MagicCanvas 统一打开宿主文件选择能力，入口包含“从本地上传”和“从项目选择”。插件不需要、也不应该自己创建系统文件选择框；只消费返回的文件引用。这里的 `ctx.assets` 指用户素材/上传能力，不表示插件包内必须有 `assets/` 目录。图片场景传 `type: "image"`，后续视频、音频、普通文件可分别传 `video`、`audio`、`file`。宿主 runtime 会自动使用最近一次用户点击位置显示下拉菜单，插件不需要传入鼠标事件。

## 12. AI 能力

### 12.1 生成并放置图片

```js
await ctx.ai.generateAndPlace({
	prompt: "A fashion model wearing all reference clothing items.",
	referenceImages: images,
	count: 1,
})
```

`generateAndPlace` 会由 MagicCanvas 负责：

- 调用生图能力；
- 创建生成任务；
- 处理 loading 状态；
- 将结果图片放入画布；
- 触发必要的画布事件和历史记录。

插件不需要自己创建画布图片元素。

### 11.2 获取模型列表

```js
const models = await ctx.ai.getImageModels()
```

你可以用模型列表渲染下拉框，再把选择结果传给生成接口。

## 12. 完整示例：上传图片并生成

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		const style = document.createElement("style")
		style.textContent = `
			.panel {
				padding: 16px;
				display: flex;
				flex-direction: column;
				gap: 12px;
				font-family: system-ui, sans-serif;
			}
			.button {
				height: 36px;
				border: 0;
				border-radius: 8px;
				background: #1677ff;
				color: white;
				cursor: pointer;
			}
			.error {
				color: #dc2626;
				font-size: 12px;
			}
		`

		const panel = document.createElement("div")
		panel.className = "panel"

		const title = document.createElement("h3")
		title.textContent = "图片生成"

		const button = document.createElement("button")
		button.className = "button"
		button.textContent = "选择参考图并生成"

		const error = document.createElement("div")
		error.className = "error"

		const handleClick = async () => {
			button.disabled = true
			button.textContent = "生成中..."
			error.textContent = ""

			try {
				const images = await ctx.assets.pickFiles({ type: "image", multiple: true })
				if (!images.length) {
					ctx.ui.toast("请选择至少一张图片", "warning")
					return
				}

				await ctx.ai.generateAndPlace({
					prompt: "Create a high-quality product image based on the reference images.",
					referenceImages: images,
					count: 1,
				})

				ctx.ui.toast("生成成功", "success")
			} catch (e) {
				error.textContent = e.message || "生成失败"
				ctx.ui.toast(error.textContent, "error")
			} finally {
				button.disabled = false
				button.textContent = "选择参考图并生成"
			}
		}

		button.addEventListener("click", handleClick)

		panel.append(title, button, error)
		root.append(style, panel)

		return () => {
			button.removeEventListener("click", handleClick)
			root.replaceChildren()
		}
	},
})
```

## 13. 复杂 UI 的开发建议

MagicCanvas 插件只要求运行入口是纯 JS，不限制你如何组织代码。对于复杂 DOM，建议：

### 13.1 拆小函数

```js
function createButton(text, onClick) {
	const button = document.createElement("button")
	button.textContent = text
	button.addEventListener("click", onClick)
	return button
}
```

### 13.2 使用简单的 DOM helper

```js
function h(tag, props = {}, children = []) {
	const el = document.createElement(tag)

	for (const [key, value] of Object.entries(props)) {
		if (key === "class") el.className = value
		else if (key === "style") Object.assign(el.style, value)
		else if (key.startsWith("on") && typeof value === "function") {
			el.addEventListener(key.slice(2).toLowerCase(), value)
		} else {
			el.setAttribute(key, value)
		}
	}

	for (const child of Array.isArray(children) ? children : [children]) {
		el.append(child instanceof Node ? child : document.createTextNode(String(child)))
	}

	return el
}
```

使用：

```js
const panel = h("div", { class: "panel" }, [
	h("h3", {}, "万物上身"),
	h("button", { class: "button", onClick: handleGenerate }, "生成"),
])
```

### 13.3 明确 cleanup

如果你添加了事件监听、定时器或外部对象，请保存引用并在 cleanup 中释放。

## 14. 调试建议

### 14.1 插件没有显示

检查：

- `manifest.json` 是否存在；
- `entry` 指向的 JS 文件是否存在；
- `index.js` 是否调用了 `registerMagicCanvasPlugin(plugin)`；
- `plugin.name` 是否与 `manifest.name` 一致；
- iframe 控制台是否有脚本错误。

### 14.2 点击按钮无反应

检查：

- 是否正确绑定事件；
- 是否在 cleanup 前意外清空 DOM；
- 浏览器控制台是否有 iframe 内错误。

### 14.3 调用 ctx 报错

检查：

- 方法名是否存在，例如 `ctx.ai.generateAndPlace`；
- 参数是否符合约定；
- 插件是否拥有对应权限；
- 是否在 `mount` 执行前调用 ctx。

### 14.4 样式不生效

检查：

- `<style>` 是否插入到了 `root`；
- className 是否匹配；
- 插件是否依赖了宿主页面 CSS。

## 15. 开发规范

建议遵守：

1. 所有 UI 都挂载到 `root`。
2. 不访问 `parent.document` 或宿主 DOM。
3. 不直接请求 MagicCanvas 内部接口。
4. 不在插件脚本中写入敏感信息。
5. 长任务要显示 loading。
6. 所有事件监听、定时器都要在 cleanup 中清理。
7. 所有画布操作都通过 `ctx` 调用。
8. `entry` 始终指向可执行 JS，不指向非 JS 源码文件或远程脚本。

## 16. “万物上身”插件开发思路

“万物上身”适合做面板型插件：

```text
上传商品图 → 可选上传模特图 → 选择风格/模型/数量 → 调用 generateAndPlace → 结果落到画布
```

需要用到的能力：

```js
ctx.assets.pickFiles
ctx.ai.getImageModels
ctx.ai.generateAndPlace
ctx.ui.toast
ctx.ui.setHeight
```

入口文件可以保持：

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		// build DOM
		// bind events
		// call ctx abilities
		// return cleanup
	},
})
```

## 17. 发布检查清单

发布前确认：

- `manifest.json` 字段完整；
- `entry` 指向 `index.js`；
- `styles` 指向插件包内的 CSS 文件；
- `index.js` 调用了 `registerMagicCanvasPlugin({ mount })`；
- 插件能在 iframe 中独立运行；
- 不依赖宿主 DOM；
- 事件监听和定时器都已清理；
- 失败场景有错误提示；
- 大文件和敏感信息没有写入插件包。

## 21. 总结

MagicCanvas 插件开发的核心原则是：

```text
用 manifest 描述插件，用 index.js 渲染插件 UI，用 ctx 调用画布能力。
```

你可以自由编写复杂 DOM 和样式，但所有 MagicCanvas 能力必须通过 `ctx` 调用。这样既能保证插件开发自由度，也能保证 MagicCanvas 的运行安全和能力边界清晰。
