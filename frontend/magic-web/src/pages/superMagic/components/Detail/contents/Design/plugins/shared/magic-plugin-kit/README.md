# Magic Plugin Kit

`magic-plugin-kit` 是给仓库内置设计插件用的轻量共享层。

它的目标不是改变现有插件协议，而是把重复的 DOM、上传、选项组、必填标记、生成提交流程收口起来，让业务插件只描述：

- 初始 state
- 需要渲染哪些 section（含 `required` 必填标记）
- 按钮禁用与业务校验（`generate.isDisabled`、`generate.validate`）
- 最终怎么拼 `ctx.ai.generateAndPlace()` 请求

插件 runtime 入口使用 CanvasDesign 新生命周期：

- 入口是 `registerMagicCanvasPlugin({ create(ctx) { ... }, render(ctx, instance, root, scope) { ... } })`
- 每个插件仍然在自己的 iframe 中独立运行
- 每个插件仍然独立管理自己的业务 state
- 旧兼容包装仅供历史插件迁移，不作为新插件开发入口

## 入口

```js
MagicPluginKit.render(ctx, root, config)
```

参数：

- `ctx`: 插件 runtime 上下文，由宿主注入
- `root`: 插件挂载 DOM 容器
- `config`: 业务插件配置对象

最小示例：

```js
function createInitialState() {
	return {
		productImages: [],
		genCount: 1,
	}
}

registerMagicCanvasPlugin({
	create(ctx) {
		return {
			state: MagicPluginKit.createPanelState(ctx, createInitialState()),
		}
	},
	render(ctx, instance, root, scope) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)

		return ctx.panel.render(root, {
			panelClassName: "demo-plugin",
			state: instance.state,
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: t("section.products", "商品图"),
					required: true,
				},
				{
					id: "modelSelect",
					kind: "model-select",
					required: true,
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成数量"),
				},
			],
			generate: {
				buttonLabel: t("button.generate", "开始生成"),
				loadingLabel: t("button.generating", "生成中…"),
				isDisabled: ({ state }) => !state.productImages.length,
				validate: ({ state, helpers }) => {
					if (
						helpers.collectReferenceIds(state.productImages).length !==
						state.productImages.length
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					const selectedSize = helpers.getSelectedSize(state)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					return null
				},
				buildRequest: ({ state, helpers }) => {
					const selectedSize = helpers.getSelectedSize(state)
					return {
						model_id: state.modelId,
						prompt: "Generate image",
						size: `${selectedSize.genW}x${selectedSize.genH}`,
						reference_images: helpers.collectReferenceIds(state.productImages),
						width: selectedSize.genW,
						height: selectedSize.genH,
						count: state.genCount,
						select: false,
					}
				},
			},
		})
	},
})
```

## 顶层配置

### `panelClassName`

给最外层容器额外挂一个 class。

用途：

- 插件私有样式覆盖
- 调整局部布局

例如：

```js
panelClassName: "boots-tryon"
```

### `state`

传入插件自己的运行期 state。新范式下，内置插件应在 `create(ctx)` 阶段创建 state，再在 `render` 阶段交给 kit 消费：

```js
function createInitialState() {
	return {
		productImages: [],
		modelImage: null,
		generationMode: "standard",
		genCount: 1,
	}
}

registerMagicCanvasPlugin({
	create(ctx) {
		return {
			state: MagicPluginKit.createPanelState(ctx, createInitialState()),
		}
	},

	render(ctx, instance, root, scope) {
		return ctx.panel.render(root, {
			state: instance.state,
			sections,
			generate,
		})
	},
})
```

kit 会在 `MagicPluginKit.createPanelState(ctx, initialState)` 中先注入一组公共状态，再和插件业务初始状态合并。

当前公共状态包括：

- `modelOptions`
- `modelId`
- `ratioKey`
- `scale`
- `genCount`
- `imageGenerationConfig`
- `loading`
- `error`

其中公共生成配置会由 kit 自动缓存并在下次打开任意插件时恢复：

- `modelId`
- `ratioKey`
- `scale`
- `genCount`
- `imageGenerationConfig`

缓存 key 为 `magic-canvas:design-plugin:shared-generation-config`，由宿主侧 `ctx.storage` 读写，插件 iframe 内不要直接访问 `window.localStorage`。模型列表加载完成后，kit 会用当前模型能力校正缓存值：模型不存在时回退到可用模型；比例、尺寸倍数、生成数量或图片生成配置不被当前模型支持时回退到当前模型的合法默认值。插件业务字段不会写入这个共享缓存。

`MagicPluginKit.render(ctx, root, config)` 仍兼容 `config.initialState`，用于旧插件或极简示例；当前项目内置插件不要再使用它。

### `modelConfig`

控制模型加载行为。

当前支持字段：

- `autoLoad`: 是否自动调用 `ctx.ai.getImageModels()`
- `showLoadErrors`: 加载失败时是否展示错误
- `noModelsMessage`: 没有模型时的错误文案
- `defaultModelId`: 默认模型 id
- `loadErrorMessage`: 模型加载失败兜底文案

示例：

```js
modelConfig: {
	autoLoad: true,
	showLoadErrors: true,
	noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
}
```

### `sections`

声明插件 UI 由哪些区块组成。  
kit 会按顺序渲染这些 section。

每个 section 至少需要：

- `id`: 唯一标识
- `kind`: 区块类型

其余字段由不同 `kind` 决定。

通用可选字段：

- `when`: 条件渲染，返回 `false` 时不显示该区块
- `deps`: 额外依赖的 state key 列表，用于告诉 kit 该区块除了自己的 `stateKey` 外，还会受哪些状态变化影响
- `required`: 声明该区块为必填，用于标题旁展示浅色「必填」文案（见下文「Section Required」）

`deps` 什么时候需要传：

- 区块 UI 会读取多个 state 字段
- 区块的选项或上限依赖当前模型
- 区块没有 `stateKey`，但需要在其他状态变化时重新渲染

例如商品图区块虽然主状态是 `productImages`，但它的 `maxCount` 还依赖 `modelImage`、`modelId` 和 `modelOptions`，所以需要声明：

```js
{
	id: "productImages",
	kind: "image-grid",
	stateKey: "productImages",
	deps: ["modelImage", "modelId", "modelOptions"],
}
```

### `generate`

定义“点击生成”后的完整流程。

执行顺序：

1. 调用 `generate.validate`
2. 校验通过后进入 loading
3. 若配置了 `execute`，则调用 `execute`；否则调用 `buildRequest` 后执行 `ctx.ai.generateAndPlace(request)`
4. 成功时调用 `onSuccess`
5. 失败时自动写入 `state.error` 并 toast

字段是否已填写由 `generate.isDisabled` 控制按钮可用性；`generate.validate` 负责业务校验，例如参考图 ID 完整性、参考图数量上限、`getSelectedSize` 是否可用、跨字段 OR 逻辑、套图张数上限等。

常用字段：

- `buttonLabel`: 按钮默认文案
- `loadingLabel`: 生成中文案
- `getIdleHint`: 按钮上方的空状态提示
- `isDisabled`: 是否禁用生成按钮
- `validate`: 业务校验，返回字符串表示失败
- `buildRequest`: 组装最终请求
- `execute`: 可选，自定义完整生成流程；签名 `({ ctx, state, helpers, t, generateAndPlace }) => Promise<unknown>`
- `onSuccess`: 成功后的自定义行为
- `successMessage`: 未自定义 `onSuccess` 时的成功文案, 默认不展示
- `errorMessage`: 失败兜底文案
- `closeOnSuccess`: 未自定义 `onSuccess` 时是否在成功后自动关闭面板，默认 `false`

## Section Required（必填）

section 可通过 `required` 声明必填。kit **仅用于 UI**：在内置 `kind` 的 `section.title` 旁渲染浅色「必填」文案（class 为 `mpk-section-required`）。

生成拦截不在 kit 层做 `required` 校验，请用：

- `generate.isDisabled`：按钮置灰（用户未填业务字段时）
- `generate.validate`：业务规则（参考图 ID、尺寸可用性等）

> **注意**：`kind: "custom"` 不走 kit 的标准 section 壳，**不会**自动渲染标题或「必填」；需在 `render` 内自绘（见下文「custom 与手写 DOM」）。

### 配置写法

```js
// 展示「必填」标记
required: true
```

字段说明：


| 字段     | 说明                                      |
| ------ | --------------------------------------- |
| `true` | 展示「必填」标记                                |


常见约定：

- 业务图片、文本输入：`required: true`，同时在 `isDisabled` 中拦截未填写
- AI 模型、分辨率、画布尺寸：`required: true` 仅作 UI 标记（kit 加载模型后会写入默认值）；可用性在 `generate.validate` 里用 `getSelectedSize` 检查
- 可选字段：不要加 `required`，可用 `suffix: t("optional", "可选")` 标注

### 何时展示「必填」

一个 section 只有在以下条件都满足时，才会展示「必填」标记（仅对**内置 `kind`** 自动处理，`custom` 除外）：

1. 配置了 `required`
2. `section.when` 为真（若存在）
3. section 实际被渲染出来（例如 `model-select` 在 `modelOptions` 为空时不渲染）

`custom` 区块若需动态「必填」，请在 `render` 内根据 `state` 自行更新。

### `custom` 与手写 DOM

`kind: "custom"` 与其他内置 `kind` 的渲染路径不同：


| 能力               | 内置 `kind`（如 `image-slot`） | `custom`                              |
| ---------------- | ------------------------- | ------------------------------------- |
| 区块 UI            | kit 根据 `kind` 自动渲染        | **仅**通过 `render` 返回的 DOM              |
| `title`          | kit 渲染标题                  | **不渲染**；可在 `render` 内自绘标题            |
| `stateKey`       | 绑定表单控件                    | **不渲染**；供 `deps` 触发重绘、`isDisabled` 读取 |
| `required: true` | kit 自动展示「必填」              | **不会自动画**，需在 `render` 内自绘              |
| 「必填」标记           | kit 自动画在标题旁               | **不会自动画**，需在 `render` 内自绘              |


因此：**只填 `title` + `stateKey` 而没有 `render`，`custom` 区块不会显示任何内容。**

`render` 是必填字段，签名为：

```js
;({ state, setState, helpers, t, elements }) => Node
```

kit 会把返回值挂到对应 `mpk-slot`；内部交互、样式、标题栏都由插件自己负责。

**必填标记与拦截**：

- UI：`required: true` 仅对内置 `kind` 生效；`custom` 需在 `render` 内自绘「必填」
- 拦截：在 `generate.isDisabled` 中判断字段是否已填；复杂规则放在 `generate.validate`

**标题与「必填」**（需要展示时）：

在 `render` 返回的 DOM 中复用 kit 的 section 结构，例如参考 `product-image-set` 的 `createSectionNode(title, suffix, required)`，必填文案使用 class `mpk-section-required`。

`custom` 完整示例：

```js
{
	id: "targetLanguages",
	kind: "custom",
	stateKey: "targetLanguages",
	title: t("section.targetLanguages", "目标语言"),
	deps: ["targetLanguages"],
	required: true,
	render: ({ state, setState, elements }) => {
		// drawer 等浮层可挂到 elements.panel
		return createTargetLanguageSection({ state, setState, t, panel: elements.panel })
	},
}
```

参考实现：`plugins/image-translation/index.js`（`targetLanguages`）、`plugins/clothing-color-change/index.js`（`color`）。

跨字段 OR 逻辑示例（上下装至少一张）应在 `isDisabled` / `validate` 中处理：

```js
isDisabled: ({ state }) =>
	state.garmentMode === "separates" &&
	!state.topGarmentImage &&
	!state.bottomGarmentImage,
validate: ({ state, t }) => {
	if (
		state.garmentMode === "separates" &&
		!state.topGarmentImage &&
		!state.bottomGarmentImage
	) {
		return t("empty.separatesGarmentImage", "请至少上传上装图或下装图")
	}
},
```

### `generate.validate` 仍应保留什么

建议在 `generate.validate` 中保留：

- `helpers.collectReferenceIds(...)` 资源标识校验
- 参考图数量上限
- `helpers.getSelectedSize(state)` 的 `genW` / `genH` 可用性
- 业务上限、跨 section 组合规则、复杂计数逻辑

用户必填字段的「未填写」优先用 `isDisabled` 置灰按钮；需要 toast / 错误区文案时再在 `validate` 中返回字符串。

## Section Types

当前内置的 `kind` 有：

- `image-grid`
- `image-slot`
- `mask-painter`
- `textarea`
- `toggle`
- `size-control`
- `option-group`
- `tabs`
- `model-select`
- `resolution-select`
- `custom`

### `image-grid`

用于多图上传网格。

常用字段：

- `stateKey`: 对应数组 state 字段
- `title`: 区块标题
- `help`: 区块底部说明文案
- `alt`: 图片 alt
- `addLabel`: 添加按钮文案，默认 `+`
- `gridClassName`: 附加 class
- `pickErrorMessage`: 选图失败兜底文案
- `maxCount`: 最大图片数，支持数字或函数
- `beforePick`: 选图前校验，返回字符串表示中断
- `dropHint`: 拖拽悬停时的提示文案，可选
- `deps`: 额外依赖的 state key，例如 `maxCount` 依赖模型配置时需要声明
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 至少上传 1 张图时传 `required: true`

行为说明：

- 支持点击上传、拖拽导入、容器聚焦时粘贴图片；
- 拖拽本地图片时会走上传链路；

示例：

```js
{
	id: "productImages",
	kind: "image-grid",
	stateKey: "productImages",
	title: t("section.products", "鞋履商品图"),
	help: t("upload.productTip", "建议上传 1-2 张鞋履参考图。"),
	maxCount: ({ state, helpers }) => {
		const maxReferenceImages =
			helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
		return Math.max(1, maxReferenceImages - (state.modelImage ? 1 : 0))
	},
}
```

### `image-slot`

用于单图上传槽位。

常用字段：

- `stateKey`: 对应单图 state 字段
- `title`: 区块标题
- `suffix`: 标题右侧补充文案，例如“可选”
- `uploadLabel`: 未上传时的按钮文案
- `alt`: 预览图的 alt 文案
- `help`: 区块底部说明文案
- `pickErrorMessage`: 选图失败兜底文案
- `beforePick`: 选图前校验，返回字符串表示中断
- `dropHint`: 拖拽悬停时的提示文案，可选
- `deps`: 额外依赖的 state key，例如 `when` 依赖其他字段时需要声明
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 必填单图时传 `required: true`；可选图用 `suffix` 标注，不要加 `required`

行为说明：

- 支持点击上传、拖拽替换、容器聚焦时粘贴替换；

示例：

```js
{
	id: "modelImage",
	kind: "image-slot",
	stateKey: "modelImage",
	title: t("section.model", "模特底图"),
	suffix: t("optional", "可选"),
	uploadLabel: t("upload.model", "点击上传模特图"),
}
```

### `mask-painter`

用于在已上传图片上直接涂抹重点区域。

适合场景：

- 局部修复
- 指定参考细节迁移范围
- 让模型聚焦某个局部区域

常用字段：

- `stateKey`: 涂抹完成后写入的 state 字段
- `sourceStateKey`: 被涂抹的源图片 state 字段
- `title`: 区块标题
- `suffix`: 标题右侧补充文案
- `noSourceHint`: 没有源图时展示的提示文案
- `clearLabel`: 清除标记按钮文案
- `help`: 区块底部说明文案
- `brushSize`: 画笔大小，默认 `28`
- `cropPadding`: 根据涂抹区域裁剪局部图时额外扩出的边距，默认 `40`
- `deps`: 额外依赖的 state key，通常至少要包含 `sourceStateKey`
- `when`: 条件渲染，返回 `false` 时不显示

说明：

- 只有在 `sourceStateKey` 对应图片存在时才会显示画布
- 用户在图上涂抹后，kit 会根据涂抹范围计算 bounding box，并从源图裁剪出局部图
- 裁剪结果会通过 `ctx.assets.uploadFile` 自动上传，并把上传后的 asset 写入 `state[stateKey]`
- 没有涂抹内容、清空标记、或源图变化时，`state[stateKey]` 会被自动重置为 `null`
- 当前对外暴露的是“裁剪后的局部参考图”，不是原始 mask 二值图

示例：

```js
{
	id: "maskPainter",
	kind: "mask-painter",
	stateKey: "cropImage",
	sourceStateKey: "sourceImage",
	title: t("section.maskPainter", "标记修复区域（可选）"),
	noSourceHint: t("maskPainter.noSource", "请先上传待修复图"),
	clearLabel: t("maskPainter.clear", "清除标记"),
	deps: ["sourceImage"],
	help: t(
		"maskPainter.help",
		"在图上涂抹需要重点修复的区域，AI 将优先处理标记部分。不标记时 AI 自动识别。",
	),
}
```

### `textarea`

用于长文本输入，比如文生背景描述。

常用字段：

- `stateKey`: 对应文本 state 字段
- `title`: 区块标题
- `suffix`: 标题右侧补充文案
- `placeholder`: 输入框占位文案
- `rows`: 文本框行数，默认 `3`
- `maxLength`: 最大输入长度，默认 `2000`
- `help`: 区块底部说明文案
- `shellClassName`: 额外挂到输入壳容器上的 class
- `deps`: 额外依赖的 state key，例如 `when` 依赖其他字段时需要声明
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 必填文本时传 `required: true`（按去空白后是否非空判断）
- `aiGenerate`: 可选，启用左下角 AI 生成按钮

`aiGenerate` 推荐结构：

```js
aiGenerate: {
	label: t("button.aiPlaceholder", "AI 生成"),
	loadingLabel: t("button.generating", "生成中…"),
	disabled: ({ state }) => !state.productImages?.length,
	completeImagePrompt: {
		referenceImages: ({ state }) => state.productImages,
		userPrompt: ({ state }) =>
			buildPromptCompletionUserPrompt({
				imageCount: state.productImages.length,
				currentText: state.backgroundPrompt,
			}),
		emptyMessage: t("error.aiPromptEmpty", "AI 未生成有效提示词，请重试"),
	},
}
```

`completeImagePrompt` 是对 `ctx.ai.completeImagePrompt` 的声明式封装。插件只负责构造业务参数，kit 负责公共流程：

- 检查 `ctx.ai.completeImagePrompt` 是否可用
- 调用 `helpers.collectReferenceIds()` 收集 `reference_images`
- 校验参考图 ID 是否为空
- 校验 `userPrompt` 是否为空
- 调用 `ctx.ai.completeImagePrompt({ user_prompt, reference_images, ...request })`
- 校验返回的 `result.prompt` 是否为空
- 成功后把 prompt 写回 textarea 对应的 `stateKey`
- 失败时把错误展示到面板错误区

`completeImagePrompt` 字段：

- `referenceImages`: 图片 asset 数组，支持函数。通常返回商品图、模特图、背景图等需要作为参考图的文件对象
- `userPrompt`: 业务提示词，支持函数。这里只描述“要 AI 补全什么”，不要在插件里调用 AI 接口
- `request`: 可选，额外透传给 `ctx.ai.completeImagePrompt` 的请求字段，支持函数
- `emptyMessage`: 可选，AI 返回空 prompt 时的错误文案
- `referencesMessage`: 可选，参考图缺少可用资源标识时的错误文案
- `unavailableMessage`: 可选，宿主未提供 `completeImagePrompt` 能力时的错误文案
- `userPromptMessage`: 可选，`userPrompt` 为空时的错误文案

插件的 `manifest.json` 需要声明能力：

```json
"capabilities": [
	"ai.completeImagePrompt"
]
```

如果确实需要完全自定义 AI 流程，也可以继续使用高级逃生口：

```js
aiGenerate: {
	label: t("button.aiPlaceholder", "AI 生成"),
	loadingLabel: t("button.generating", "生成中…"),
	disabled: ({ state }) => !state.productImages?.length,
	generate: async ({ state, helpers, t }) => {
		return "自定义生成结果"
	},
}
```

说明：

- 输入时直接写入对应 state，并重绘字数统计；不会每敲一个字就整段重渲染
- 所有 textarea 统一使用卡片输入壳，右下角显示清空按钮；配置了 `maxLength` 后还会显示字数统计
- 配置了 `maxLength` 后会自动截断，并显示 `当前字数 / 上限`
- 配置了 `aiGenerate` 后，额外在左下角渲染 AI 按钮
- `completeImagePrompt` 或 `generate` 返回非空字符串后会写回 `stateKey`；返回空字符串时不更新输入框
- `completeImagePrompt` 或 `generate` 抛错时，kit 会把错误展示在面板错误区

### `toggle`

用于布尔开关，比如“同版替换”“保留原场景”这类 true/false 业务状态。

常用字段：

- `stateKey`: 对应布尔 state 字段
- `title`: 区块标题
- `suffix`: 标题右侧补充文案
- `help`: 区块底部说明文案
- `deps`: 额外依赖的 state key，例如 `when` 依赖其他字段时需要声明
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 展示「必填」标记；是否允许生成由 `isDisabled` / `validate` 控制

说明：

- 直接读写 `state[stateKey]`
- 点击后会在 `true / false` 间切换
- 适合只有两种状态、且需要常驻说明文案的场景

示例：

```js
{
	id: "samePatternReplace",
	kind: "toggle",
	stateKey: "samePatternReplace",
	title: t("section.samePatternReplace", "同版替换"),
	help: t(
		"samePatternReplace.help",
		"服饰图与模特图的服饰为同版型时，试衣效果会更好哦！",
	),
}
```

### `size-control`

用于选择画布比例。

常用字段：

- `title`: 区块标题
- `suffix`: 标题右侧补充文案
- `help`: 区块底部说明文案
- `ratioOptions`: 自定义比例选项，未传时优先从模型尺寸推导
- `deps`: 额外依赖的 state key，例如比例选项依赖当前模型时需要声明
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 需要用户显式选择比例时传 `required: true`

说明：

- 默认优先从当前模型的 `image_size_config.sizes` 推导比例 options
- 如果没传 `ratioOptions` 且模型没声明尺寸，会退回到内置的常见比例
- 当前版本仅支持比例切换，不支持手动输入宽高

### `tabs`

用于分段切换的 Tab 区块。可以只做状态切换，也可以渲染当前 Tab 对应的面板内容。

约定：

- 需要「切换 Tab 并展示不同内容」时，优先使用 `tabs`
- 如果内容适合顺延在顶层 `sections` 中渲染，可以不传 `panels`，后续 section 用 `when` 判断当前 `stateKey`
- 如果内容需要嵌套在 Tab 容器内，则传 `panels`

常用字段：

- `stateKey`: 当前激活 Tab 写入的 state 字段
- `title`: 区块标题
- `help`: 区块底部说明文案
- `tabsClassName`: 额外挂到 Tab 容器上的 class
- `options`: Tab 列表，结构与 `option-group` 的 `options` 一致
- `patchOnSelect`: 切换 Tab 时的额外 state patch, 局部更新同步
- `panels`: 可选，面板配置，按 `value` 与 `options` 对应

无 `panels` 的纯切换写法：

```js
{
	id: "displayStyle",
	kind: "tabs",
	stateKey: "displayStyle",
	options: [
		{ value: "flat", label: t("displayStyle.flat", "平铺图") },
		{ value: "mannequin", label: t("displayStyle.mannequin", "人台图") },
	],
},
{
	id: "poseReferenceImage",
	kind: "image-slot",
	stateKey: "poseReferenceImage",
	when: ({ state }) => state.displayStyle === "mannequin",
}
```

`panels` 结构：

```js
panels: [
	{
		value: "image",
		sections: [{ id: "backgroundImage", kind: "image-slot", stateKey: "backgroundImage" }],
	},
	{
		value: "prompt",
		sections: [
			{
				id: "backgroundPrompt",
				kind: "custom",
				render: ({ state, setState }) => renderPromptSection({ state, setState }),
			},
		],
	},
]
```

说明：

- 面板内 section 的 `id` 仍需在插件内保持唯一
- 面板内 section 支持 `required`、`when`、`deps` 等常规字段
- 仅当前激活 Tab 对应的面板会参与渲染；非激活 Tab 内 section 的「必填」标记不展示
- `options` 传函数时，kit 会在渲染阶段以 `({ state, helpers, t })` 调用它

### `option-group`

用于标签按钮组选项。

约定：

- 生成模式、风格、生成数量这类静态枚举都统一使用 `option-group`

常用字段：

- `stateKey`: 对应选项值的 state 字段
- `title`: 区块标题
- `suffix`: 标题右侧补充文案
- `help`: 区块底部说明文案
- `groupClassName`: 额外挂到选项组容器上的 class
- `showDescriptionOnHover`: 是否改为使用 tooltip DOM 展示 option 的 `description`
- `variant`: 可选，传 `"card"` 时改为卡片式单选布局
- `descriptionMode`: 描述展示方式，支持 `"title"`、`"tooltip"`、`"inline"`
- `deps`: 额外依赖的 state key，例如 `options` 为函数且依赖模型时需要声明
- `when`: 条件渲染，返回 `false` 时不显示
- `options`: 支持数组，或返回数组的函数

`options` 结构：

每个 option 对象支持：

- `value`: 选中后写入 `stateKey` 的值
- `label`: 按钮或卡片上显示的主文案
- `description`: 可选，补充说明；展示方式由 `descriptionMode` / `showDescriptionOnHover` 决定
- `disabled`: 可选，为 `true` 时选项不可点击

示例：

```js
{
	id: "generationMode",
	kind: "option-group",
	stateKey: "generationMode",
	title: t("section.generationMode", "生成模式"),
	showDescriptionOnHover: true,
	options: [
		{ value: "fast", label: "快速模式", description: "适合简单姿势" },
		{ value: "standard", label: "标准模式", description: "适合常规生产场景" },
	],
}
```

说明：

- 默认情况下，`description` 会写入按钮的 `title` 属性
- 当 `showDescriptionOnHover: true` 或 `descriptionMode: "tooltip"` 时，kit 会渲染自定义 tooltip DOM
- 当 `variant: "card"` 且 `descriptionMode: "inline"` 时，会渲染卡片式单选，并将 `description` 常驻显示在副文案区域
- `options` 传函数时，kit 会在渲染阶段以 `({ state, helpers, t })` 调用它
- 当 `kind: "option-group"` 且 `stateKey: "genCount"` 时，如果未显式传 `options`，kit 会自动根据当前模型的 `image_size_config.max_output_images` 生成数量选项，并在模型切换时自动修正 `genCount`

### `model-select`

用于显式展示模型下拉框。

常用字段：

- `title`: 区块标题
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 通常传 `required: true`（UI 标记）；kit 加载模型后会写入默认 `modelId`

说明：

- 不需要传 `stateKey`
- 直接读写 `state.modelId`
- 切换模型时会自动刷新 `ratioKey`、`scale`、`imageGenerationConfig`
- 模型可用性在 `generate.validate` 中通过 `getSelectedSize` 等业务规则检查，不必重复判断 `!state.modelId`

### `resolution-select`

用于展示模型分辨率选项。

常用字段：

- `title`: 区块标题
- `hideWhenSingle`: 只有一个分辨率时是否隐藏，默认隐藏
- `when`: 条件渲染，返回 `false` 时不显示
- `required`: 需要用户选择分辨率时传 `required: true`

说明：

- 不需要传 `stateKey`
- 直接读写 `state.scale`
- 切换分辨率时会同步调整 `state.ratioKey`

### `custom`

用于 kit 内置 `kind` 无法表达的 UI（颜色选择器、多选列表、样式卡编辑器等）。**本质是「自绘区块」**：kit 只分配 slot 并调用 `render`，不像 `image-slot` / `option-group` 那样根据字段自动生成控件。

#### 何时用 `custom`


| 场景                      | 建议                                       |
| ----------------------- | ---------------------------------------- |
| 上传图、单选/多选、文本框、模型/分辨率    | 用对应内置 `kind`                             |
| 复杂交互、浮层 drawer、自定义列表/卡片 | 用 `custom` + `render`                    |
| 只是改样式                   | 优先 `panelClassName` + 插件 CSS，不必 `custom` |


#### 字段说明


| 字段         | 必填    | 作用                                                      |
| ---------- | ----- | ------------------------------------------------------- |
| `render`   | **是** | 返回要挂载的 `Node`；**唯一**负责区块 UI                             |
| `id`       | 是     | slot 标识                                                 |
| `stateKey` | 建议    | 供 `deps` 触发重绘、`isDisabled` 读取；写入 `deps` 以便 state 变化时重绘 |
| `title`    | 可选    | **不渲染**；可在 `render` 内自绘标题                              |
| `deps`     | 建议    | 除 `stateKey` 外还影响 UI 的 state key；变化时 kit 会重新执行 `render` |
| `when`     | 可选    | 返回 `false` 时清空 slot、不渲染                                 |
| `required` | 可选    | 对 `custom` 不自动展示「必填」，须在 `render` 内自绘                    |


`render` 回调参数：

```js
;({ state, setState, helpers, t, elements }) => Node
```

`elements` 当前提供：

- `panel`: kit 面板根节点（`.mpk-panel`），适合挂载 drawer / popover，避免挂到 `document.body`

#### 渲染与更新机制

1. 初始化时 `createLayout()` 为每个 section 创建空 `mpk-slot`
2. `updateView()` 调用 `renderSection()`；`custom` 分支直接 `return section.render(getCallbackContext())`
3. `setState` 触发 `updateView(patch)`；若 patch 命中 `stateKey` 或 `deps` 中的 key，对应 slot 会 `replaceChildren(render(...))`
4. kit **不会**为 `custom` 调用 `createSection()`，因此 `title` / `suffix` / `help` 等内置字段**不会产生任何 DOM**

#### 常见错误


| 现象                     | 原因                                     |
| ---------------------- | -------------------------------------- |
| 区块空白                   | 未提供 `render`，或 `render` 返回空节点          |
| 填了 `title` 仍无标题        | `custom` 不自动画标题，需在 `render` 内自绘        |
| `required: true` 不拦截生成 | kit 不做 `required` 校验；须在 `isDisabled` / `validate` 中处理 |
| 选了值 UI 不更新             | 未声明 `deps`，或改 state 时未走 `setState`     |
| drawer 定位异常            | 应挂 `elements.panel`，不要操作宿主 DOM         |


#### 示例

```js
{
	id: "styleCards",
	kind: "custom",
	stateKey: "styleItems",
	deps: ["creationMode", "styleItems"],
	when: ({ state }) => state.creationMode === "custom",
	required: true,
	render: ({ state, setState, helpers, elements }) =>
		StyleEditorUI.createConfigSection({ state, setState, helpers, t, elements }),
}
```

更完整的说明见「Section Required → custom 与手写 DOM」。

## 回调上下文

以下函数里，kit 会传入一个上下文对象：

- `maxCount`
- `beforePick`
- `when`
- `options`
- `isDisabled`
- `getIdleHint`
- `validate`
- `buildRequest`

上下文结构：

```js
;({ state, helpers, t })
```

### `state`

当前插件状态快照。

### `t`

翻译函数，等价于：

```js
;(key, fallback) => ctx.i18n?.t?.(key, fallback) ?? fallback ?? key
```

### `helpers`

当前提供的辅助函数：

- `t`
- `setState`
- `getSelectedModel`
- `getModelSizes`
- `getResolutionOptions`
- `getSelectedSize`
- `getImageReferenceId`
- `getImageUrl`
- `getErrorMessage`
- `collectReferenceIds(items)`

常见用途：

- 读取当前模型配置
- 从尺寸配置里得到最终宽高
- `getSelectedSize` 会读取当前 `size-control` 区块配置的 `stateKey`
- 从上传文件对象里提取 `reference_images`

## 请求拼装建议

`buildRequest` 的职责应该尽量保持清晰：

1. 从 `state` 读业务选择
2. 从 `helpers` 读模型、尺寸、引用图工具
3. 只返回最终请求对象

建议不要在 `buildRequest` 内再做复杂 UI 状态修改。

例如：

```js
buildRequest: ({ state, helpers }) => {
	const selectedSize = helpers.getSelectedSize(state)
	const referenceImages = helpers.collectReferenceIds([
		...state.productImages,
		...(state.modelImage ? [state.modelImage] : []),
	])

	return {
		model_id: state.modelId,
		prompt: buildPrompt(state),
		size: `${selectedSize.genW}x${selectedSize.genH}`,
		reference_images: referenceImages,
		width: selectedSize.genW,
		height: selectedSize.genH,
		count: state.genCount,
		select: false,
	}
}
```

## 推荐约定

为了让后续插件更容易维护，建议约定：

- kit 只提供通用 UI/流程能力，不塞业务语义
- 业务插件自己定义 prompt、业务字段和文案
- `sections` 里优先使用内置 `kind` 的声明式配置；仅当内置 `kind` 无法满足时再使用 `custom`，且必须通过 `render` 自绘 DOM（不能只写 `title` + `stateKey`）
- 字段「必填」标记用 `section.required`；是否允许生成用 `generate.isDisabled`；`generate.validate` 只保留资源 ID、数量上限、尺寸可用性等业务规则
- AI 模型 / 分辨率 / 画布尺寸统一 `required: true`（UI 标记）；不要在 `validate` 里重复校验 `modelId`
- 复杂业务逻辑拆成插件内私有函数，例如 `buildPrompt()`、`getReferenceImages()`

## 参考实现

当前可以直接参考：

- `plugins/real-model-tryon/index.js`：`required: true` 迁移范式（图片 + 模型/分辨率/画布）
- `plugins/accessory-tryon/index.js`：双图 `required: true` + `isDisabled` / `validate` 只保留 references / noSize
- `plugins/image-translation/index.js`：`custom` + `render`（目标语言多选）
- `plugins/clothing-color-change/index.js`：`custom` + `render`（颜色选择器 + drawer）
- `plugins/product-image-set/index.js`：多个 `custom` 区块 + `createSectionNode` 自绘标题与「必填」
- `plugins/footwear-repair/index.js`：`mask-painter` 典型用法

`real-model-tryon` 覆盖了 `required` 的常见写法：

- 图片 slot：`required: true` + `isDisabled` 拦截未上传
- `model-select` / `resolution-select` / `size-control`：`required: true`（UI 标记）
- `generate.validate` 只保留 references、尺寸可用性等业务规则

`footwear-repair` 额外覆盖：

- 在源图上标记待修复区域
- 在参考图上标记待提取细节区域
- 将标记结果裁剪后作为额外参考图参与最终请求
