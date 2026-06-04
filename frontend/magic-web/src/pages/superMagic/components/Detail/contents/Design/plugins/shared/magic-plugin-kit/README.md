# Magic Plugin Kit

`magic-plugin-kit` 是给仓库内置设计插件用的轻量共享层。

它的目标不是改变现有插件协议，而是把重复的 DOM、上传、选项组、生成提交流程收口起来，让业务插件只描述：

- 初始 state
- 需要渲染哪些 section
- 生成前怎么校验
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
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成数量"),
					options: [1, 2, 3, 4].map((count) => ({
						value: count,
						label: String(count),
					})),
				},
			],
			generate: {
				buttonLabel: t("button.generate", "开始生成"),
				loadingLabel: t("button.generating", "生成中…"),
				isDisabled: ({ state }) => !state.productImages.length,
				validate: ({ state, t }) => {
					if (!state.productImages.length) {
						return t("empty.products", "请先上传至少 1 张商品图")
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
- `imageGenerationConfig`
- `loading`
- `error`

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

1. 调用 `validate`
2. 校验通过后进入 loading
3. 若配置了 `execute`，则调用 `execute`；否则调用 `buildRequest` 后执行 `ctx.ai.generateAndPlace(request)`
4. 成功时调用 `onSuccess`
5. 失败时自动写入 `state.error` 并 toast

常用字段：

- `buttonLabel`: 按钮默认文案
- `loadingLabel`: 生成中文案
- `getIdleHint`: 按钮上方的空状态提示
- `isDisabled`: 是否禁用生成按钮
- `validate`: 生成前校验，返回字符串表示失败
- `buildRequest`: 组装最终请求
- `execute`: 可选，自定义完整生成流程；签名 `({ ctx, state, helpers, t, generateAndPlace }) => Promise<unknown>`
- `onSuccess`: 成功后的自定义行为
- `successMessage`: 未自定义 `onSuccess` 时的成功文案
- `errorMessage`: 失败兜底文案
- `closeOnSuccess`: 未自定义 `onSuccess` 时是否自动关闭

## Section Types

当前内置的 `kind` 有：

- `image-grid`
- `image-slot`
- `mask-painter`
- `textarea`
- `toggle`
- `size-control`
- `option-group`
- `model-select`
- `resolution-select`

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
- `rows`: 文本框默认行数
- `maxLength`: 最大输入长度
- `help`: 区块底部说明文案
- `deps`: 额外依赖的 state key，例如 `when` 依赖其他字段时需要声明
- `when`: 条件渲染，返回 `false` 时不显示

说明：

- 输入时直接写入对应 state，并重绘字数统计；不会每敲一个字就整段重渲染
- 配置了 `maxLength` 后会自动截断，并显示 `当前字数/上限`

### `toggle`

用于布尔开关，比如“同版替换”“保留原场景”这类 true/false 业务状态。

常用字段：

- `stateKey`: 对应布尔 state 字段
- `title`: 区块标题
- `suffix`: 标题右侧补充文案
- `help`: 区块底部说明文案
- `deps`: 额外依赖的 state key，例如 `when` 依赖其他字段时需要声明
- `when`: 条件渲染，返回 `false` 时不显示

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

说明：

- 默认优先从当前模型的 `image_size_config.sizes` 推导比例 options
- 如果没传 `ratioOptions` 且模型没声明尺寸，会退回到内置的常见比例
- 当前版本仅支持比例切换，不支持手动输入宽高

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

### `model-select`

用于显式展示模型下拉框。

常用字段：

- `title`: 区块标题
- `when`: 条件渲染，返回 `false` 时不显示

说明：

- 不需要传 `stateKey`
- 直接读写 `state.modelId`
- 切换模型时会自动刷新 `ratioKey`、`scale`、`imageGenerationConfig`

### `resolution-select`

用于展示模型分辨率选项。

常用字段：

- `title`: 区块标题
- `hideWhenSingle`: 只有一个分辨率时是否隐藏，默认隐藏
- `when`: 条件渲染，返回 `false` 时不显示

说明：

- 不需要传 `stateKey`
- 直接读写 `state.scale`
- 切换分辨率时会同步调整 `state.ratioKey`

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

为了让后续 5-6 个插件更容易维护，建议约定：

- kit 只提供通用 UI/流程能力，不塞业务语义
- 业务插件自己定义 prompt、业务字段和文案
- `sections` 里优先使用声明式配置，不直接回退到手写 DOM
- 复杂业务逻辑拆成插件内私有函数，例如 `buildPrompt()`、`getReferenceImages()`

## 参考实现

当前可以直接参考：

- `plugins/boots-tryon/index.js`
- `plugins/footwear-repair/index.js`

`boots-tryon` 覆盖了这套配置的大部分常见能力：

- 多图上传
- 单图上传
- 标签组选项
- 分辨率选择
- 生成数量

`footwear-repair` 额外覆盖了 `mask-painter` 的典型用法：

- 在源图上标记待修复区域
- 在参考图上标记待提取细节区域
- 将标记结果裁剪后作为额外参考图参与最终请求
- 生成前校验
- 请求拼装
