# MagicCanvas 插件 ctx 最小能力说明

本文只基于“万物上身”插件场景设计 `ctx`，不提前设计通用大而全 API。后续插件需要更多能力时，再按真实用例增量扩展。

“万物上身”的业务流程：

```text
上传商品图 → 可选上传模特图 → 填写额外描述 / 选择生成参数 → 调用 AI 生成 → 结果放入画布 → 给用户提示
```

因此第一版 `ctx` 只需要支撑以下能力：

```js
ctx.plugin
ctx.i18n
ctx.ui
ctx.resources
ctx.assets
ctx.ai
```

不在第一版设计：

```js
ctx.selection
ctx.elements
ctx.canvas
ctx.storage
ctx.events
```

这些能力不是“万物上身”最小闭环必需项，先不加入，避免插件协议过早膨胀。

## 1. 插件入口

插件脚本通过注册函数接入：

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		// build plugin DOM
		// call ctx capabilities
		return function cleanup() {
			root.replaceChildren()
		}
	},
})
```

`root` 是 iframe 内的根 DOM 节点。插件只能把 UI 挂到 `root` 内。

## 2. ctx 总览

第一版建议：

```js
ctx.plugin
ctx.i18n.t(key, fallback)
ctx.ui.toast(message, type)
ctx.ui.setHeight(height)
ctx.resources.resolve(path)
ctx.assets.pickFiles(options)
ctx.ai.getImageModels()
ctx.ai.generateAndPlace(params)
```

其中 `ctx.ui.setHeight` 可以由 runtime 的 `ResizeObserver` 自动处理。如果 runtime 已自动同步 iframe 高度，插件可以不直接调用。

## 3. `ctx.plugin`

提供插件自身的静态信息，主要来自 `manifest.json`。

```js
ctx.plugin.name
ctx.plugin.version
ctx.plugin.icon
ctx.plugin.tags
ctx.plugin.source
```

示例：

```js
const pluginName = ctx.plugin.name
```

`label` 和 `description` 不放在 `ctx.plugin` 中，插件应通过 `ctx.i18n.t("label")` 和 `ctx.i18n.t("description")` 读取当前语言文案。

`ctx.plugin.icon` 保留 `manifest.json` 中的原始值：可以是单字符 emoji，也可以是指向当前插件包内媒体资源的相对路径，例如 `media/icon.png`。插件不要把它当成任意外链处理。

示例结构：

```js
{
	name: "virtual-tryon",
	version: "1.0.0",
	icon: "👗",
	tags: ["AI", "电商", "穿搭"],
	source: "builtin"
}
```

## 4. `ctx.i18n`

多语言能力来自 `manifest.json` 中的 `locales` 字段。

```js
ctx.i18n.locale
ctx.i18n.t(key, fallback)
```

### 4.1 `ctx.i18n.locale`

当前语言，例如：

```js
const locale = ctx.i18n.locale
```

### 4.2 `ctx.i18n.t(key, fallback)`

读取 `manifest.locales -> 当前语言 -> key`。

```js
const title = ctx.i18n.t("label", "万物上身")
const description = ctx.i18n.t("description", "")
const generateText = ctx.i18n.t("button.generate", "一键生成穿搭图")
```

如果当前语言缺失，会按 runtime 规则回退，例如：

```text
当前语言 → en-US → fallback → key
```

示例 `manifest.json` 中的 `locales`：

```json
{
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
}
```

## 5. `ctx.ui`

“万物上身”只需要两个 UI 能力：

```js
ctx.ui.toast(message, type)
ctx.ui.close()
ctx.ui.setHeight(height)
```

### 5.1 `ctx.ui.toast(message, type)`

用于生成成功、生成失败、参数缺失等场景。

```js
ctx.ui.toast("穿搭图生成成功", "success")
ctx.ui.toast("请先上传至少一张商品图", "warning")
ctx.ui.toast("生成失败，请重试", "error")
```

参数：

| 参数      | 类型                                          | 说明     |
| --------- | --------------------------------------------- | -------- |
| `message` | `string`                                      | 提示内容 |
| `type`    | `"info" \| "success" \| "warning" \| "error"` | 提示类型 |

返回：

```js
Promise<void>
```

### 5.2 `ctx.ui.setHeight(height)`

用于 iframe 内容高度变化后通知 MagicCanvas 调整插件面板高度。

```js
ctx.ui.setHeight(document.body.scrollHeight)
```

如果 runtime 已通过 `ResizeObserver` 自动同步高度，则该方法可以作为内部能力存在，不要求插件显式调用。

### 5.3 `ctx.ui.close()`

主动关闭当前插件浮窗。

```js
ctx.ui.close()
```

适合在插件提交成功、流程完成后关闭面板。

## 5. `ctx.resources`

用于解析插件包内资源。插件包内资源不需要固定目录，开发者可以按插件需要自由组织目录结构。

```js
ctx.resources.resolve(path)
```

### 5.1 `ctx.resources.resolve(path)`

把插件目录内的安全相对路径解析为浏览器可访问 URL。

```js
const iconUrl = await ctx.resources.resolve("media/icon.png")
const presetUrl = await ctx.resources.resolve("data/presets.json")
```

路径规则：

| 规则           | 说明                                       |
| -------------- | ------------------------------------------ |
| 只允许相对路径 | 例如 `media/icon.png`、`data/presets.json` |
| 不允许远程 URL | 例如 `https://...`、`data:`、`blob:`       |
| 不允许绝对路径 | 例如 `/plugins/a/icon.png`                 |
| 不允许跨目录   | 例如 `../other/icon.png`                   |

返回：

```js
Promise<string>
```

返回值可以直接用于 `<img src>`、`fetch(url)` 等浏览器 API。

## 6. `ctx.assets`

“万物上身”需要上传两类图片：

1. 商品图：多张，必填；
2. 模特底图：单张，可选。

所以第一版只需要一个素材能力：

```js
ctx.assets.pickFiles(options)
```

### 6.1 `ctx.assets.pickFiles(options)`

打开文件选择器，选择并上传文件，返回可传给 AI 或插件继续处理的资源对象。

这里的 `ctx.assets` 指用户素材/上传能力，不表示插件包内必须有 `assets/` 目录；插件包内静态资源请使用 `ctx.resources.resolve(path)`。

`pickFiles` 会调用 MagicCanvas 宿主文件选择能力，由宿主展示“从本地上传 / 从项目选择”等入口。插件只发起选择请求，不直接创建系统文件选择框。宿主 runtime 会自动使用最近一次用户点击位置显示下拉菜单，插件不需要传入鼠标事件。

商品图：

```js
const garments = await ctx.assets.pickFiles({
	type: "image",
	multiple: true,
	maxCount: 5,
})
```

模特底图：

```js
const modelImages = await ctx.assets.pickFiles({
	type: "image",
	multiple: false,
	maxCount: 1,
})
const modelImage = modelImages[0] || null
```

参数：

| 字段       | 类型                                      | 说明                                            |
| ---------- | ----------------------------------------- | ----------------------------------------------- |
| `type`     | `"image" \| "video" \| "audio" \| "file"` | 文件类型，用于限制宿主选择入口                  |
| `multiple` | `boolean`                                 | 是否允许多选                                    |
| `maxCount` | `number`                                  | 最大选择数量，可选                              |
| `accept`   | `string[]`                                | 本地上传 input accept，可选，例如 `["image/*"]` |

返回：

```js
Promise<MagicCanvasFileAsset[]>
```

`MagicCanvasFileAsset`：

```js
{
	id: "asset_1",
	path: "uploads/image.png",
	url: "https://example.com/image.png",
	src: "https://example.com/image.png",
	fileName: "image.png",
	type: "image",
	width: 1024,
	height: 1024
}
```

字段说明：

| 字段       | 类型                                      | 说明                                      |
| ---------- | ----------------------------------------- | ----------------------------------------- |
| `id`       | `string`                                  | 文件资源 ID，传给 `generateAndPlace` 使用 |
| `path`     | `string`                                  | 文件路径                                  |
| `url`      | `string`                                  | 文件预览地址                              |
| `src`      | `string`                                  | 文件预览地址，同 `url`                    |
| `fileName` | `string`                                  | 文件名                                    |
| `type`     | `"image" \| "video" \| "audio" \| "file"` | 文件类型                                  |
| `width`    | `number`                                  | 图片宽度，仅图片尽量返回                  |
| `height`   | `number`                                  | 图片高度，仅图片尽量返回                  |

为什么不先设计 `uploadFiles`？

- “万物上身”不需要插件自己管理文件 input；
- `pickFiles` 同时完成“选择 + 上传 + 返回预览信息”，对纯 JS 插件最简单；
- 如果后续插件需要拖拽、自定义文件输入，再补 `uploadFiles`。

## 6. `ctx.ai`

“万物上身”需要：

1. 可选：获取可用图片模型；
2. 必需：调用 AI 生成并把结果放入画布。

因此第一版只需要：

```js
ctx.ai.getImageModels()
ctx.ai.generateAndPlace(params)
```

### 6.1 `ctx.ai.getImageModels()`

获取可用图片模型列表，用于渲染模型下拉选择。

```js
const models = await ctx.ai.getImageModels()
```

返回：

```js
Promise<MagicCanvasImageModel[]>
```

示例：

```js
;[
	{
		id: "doubao-seedream-4-5",
		label: "Seedream 4.5",
	},
]
```

`MagicCanvasImageModel`：

| 字段    | 类型     | 说明     |
| ------- | -------- | -------- |
| `id`    | `string` | 模型 ID  |
| `label` | `string` | 展示名称 |

如果第一版暂时不提供模型选择，也可以让插件不调用该方法，由 `generateAndPlace` 使用默认模型。

### 6.2 `ctx.ai.generateAndPlace(params)`

生成图片并自动放入画布。

```js
await ctx.ai.generateAndPlace({
	prompt,
	referenceImages,
	width,
	height,
	count: 1,
	modelId,
	select: true,
})
```

参数：

| 字段              | 类型                     | 必填 | 说明             |
| ----------------- | ------------------------ | ---- | ---------------- |
| `prompt`          | `string`                 | 是   | 生成提示词       |
| `negativePrompt`  | `string`                 | 否   | 反向提示词       |
| `referenceImages` | `MagicCanvasFileAsset[]` | 否   | 参考图列表       |
| `width`           | `number`                 | 否   | 生成宽度         |
| `height`          | `number`                 | 否   | 生成高度         |
| `count`           | `number`                 | 否   | 生成数量，默认 1 |
| `modelId`         | `string`                 | 否   | 模型 ID          |
| `select`          | `boolean`                | 否   | 是否选中生成结果 |

返回：

```js
Promise<{
	elementIds: string[]
}>
```

MagicCanvas 内部负责：

- 调用生图能力；
- 维护生成任务状态；
- 下载 / 转存生成结果；
- 创建画布图片元素；
- 插入画布；
- 选中结果；
- 写入历史记录。

插件不需要知道画布元素结构，也不需要自己调用元素创建 API。

## 7. “万物上身”如何使用这些 ctx 能力

### 7.1 上传商品图

```js
const garments = await ctx.assets.pickFiles({
	type: "image",
	multiple: true,
	maxCount: 5,
})

if (!garments.length) {
	ctx.ui.toast("请先上传至少一张商品图", "warning")
	return
}
```

### 7.2 上传模特底图，可选

```js
const selected = await ctx.assets.pickFiles({
	type: "image",
	multiple: false,
	maxCount: 1,
})

const modelImage = selected[0] || null
```

### 7.3 获取模型，可选

```js
const models = await ctx.ai.getImageModels()
const defaultModelId = models[0]?.id
```

### 7.4 构建参考图

商品图在前，模特图最后：

```js
const referenceImages = [...garments, ...(modelImage ? [modelImage] : [])]
```

### 7.5 调用生成并放入画布

```js
await ctx.ai.generateAndPlace({
	prompt:
		"A fashion model wearing all reference clothing/accessory items. " +
		"Every reference item must be clearly visible and faithfully preserved.",
	referenceImages,
	width: modelImage ? modelImage.width : 1024,
	height: modelImage ? modelImage.height : 1024,
	count: 1,
	modelId: defaultModelId,
	select: true,
})

ctx.ui.toast("穿搭图生成成功", "success")
```

## 8. 完整示例

下面是一个精简版“万物上身”插件，展示第一版 ctx 的完整使用方式：

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		const state = {
			garments: [],
			modelImage: null,
			loading: false,
			modelId: null,
		}

		const style = document.createElement("style")
		style.textContent = `
			.panel {
				padding: 16px;
				display: flex;
				flex-direction: column;
				gap: 12px;
				font-family: system-ui, sans-serif;
			}
			button {
				height: 36px;
				border: 0;
				border-radius: 8px;
				background: #6366f1;
				color: #fff;
				cursor: pointer;
			}
			button:disabled {
				opacity: .5;
				cursor: not-allowed;
			}
			.hint {
				font-size: 12px;
				color: #666;
			}
			.error {
				font-size: 12px;
				color: #dc2626;
			}
		`

		const panel = document.createElement("div")
		panel.className = "panel"

		const title = document.createElement("h3")
		title.textContent = ctx.i18n.t("label", "万物上身")

		const garmentButton = document.createElement("button")
		garmentButton.textContent = ctx.i18n.t("button.pickGarments", "上传商品图")

		const modelButton = document.createElement("button")
		modelButton.textContent = ctx.i18n.t("button.pickModel", "上传模特底图（可选）")

		const generateButton = document.createElement("button")
		generateButton.textContent = ctx.i18n.t("button.generate", "一键生成穿搭图")

		const hint = document.createElement("div")
		hint.className = "hint"

		const error = document.createElement("div")
		error.className = "error"

		function refresh() {
			hint.textContent =
				"商品图：" +
				state.garments.length +
				"/5，模特图：" +
				(state.modelImage ? "已上传" : "未上传")
			generateButton.disabled = state.loading || state.garments.length === 0
			generateButton.textContent = state.loading ? "生成中..." : "一键生成穿搭图"
			ctx.ui.setHeight(document.body.scrollHeight)
		}

		async function pickGarments() {
			error.textContent = ""
			const images = await ctx.assets.pickFiles({
				type: "image",
				multiple: true,
				maxCount: 5,
			})
			state.garments = images.slice(0, 5)
			refresh()
		}

		async function pickModelImage() {
			error.textContent = ""
			const images = await ctx.assets.pickFiles({
				type: "image",
				multiple: false,
				maxCount: 1,
			})
			state.modelImage = images[0] || null
			refresh()
		}

		async function generate() {
			if (!state.garments.length || state.loading) return

			state.loading = true
			error.textContent = ""
			refresh()

			try {
				const referenceImages = [
					...state.garments,
					...(state.modelImage ? [state.modelImage] : []),
				]

				await ctx.ai.generateAndPlace({
					prompt:
						"A fashion model wearing all reference clothing/accessory items. " +
						"Every reference item must be clearly visible and faithfully preserved.",
					referenceImages,
					width: state.modelImage ? state.modelImage.width : 1024,
					height: state.modelImage ? state.modelImage.height : 1024,
					count: 1,
					modelId: state.modelId,
					select: true,
				})

				ctx.ui.toast("穿搭图生成成功", "success")
			} catch (e) {
				error.textContent = e.message || "生成失败，请重试"
				ctx.ui.toast(error.textContent, "error")
			} finally {
				state.loading = false
				refresh()
			}
		}

		garmentButton.addEventListener("click", pickGarments)
		modelButton.addEventListener("click", pickModelImage)
		generateButton.addEventListener("click", generate)

		panel.append(title, garmentButton, modelButton, hint, generateButton, error)
		root.append(style, panel)
		refresh()

		return function cleanup() {
			garmentButton.removeEventListener("click", pickGarments)
			modelButton.removeEventListener("click", pickModelImage)
			generateButton.removeEventListener("click", generate)
			root.replaceChildren()
		}
	},
})
```

## 9. 第一版 ctx 方法清单

最终建议第一版只实现：

```js
ctx.plugin
ctx.i18n.locale
ctx.i18n.t
ctx.ui.toast
ctx.ui.setHeight
ctx.resources.resolve
ctx.assets.pickFiles
ctx.ai.getImageModels
ctx.ai.generateAndPlace
```

其中 `ctx.ai.getImageModels` 是可选能力。如果“万物上身”先使用默认模型，也可以暂缓实现。

## 10. 后续按需扩展

当后续插件出现真实需求时，再增加：

| 需求                   | 可能新增能力                        |
| ---------------------- | ----------------------------------- |
| 基于当前选中图片做处理 | `ctx.selection.getSingleImage()`    |
| 修改已有元素           | `ctx.elements.update()`             |
| 插件保存用户偏好       | `ctx.storage.get/set()`             |
| 监听选区变化           | `ctx.events.on("selection:change")` |
| 聚焦生成结果           | `ctx.canvas.focusElement()`         |

原则：**一个插件场景提出一个明确需求，再扩一个最小能力。**
