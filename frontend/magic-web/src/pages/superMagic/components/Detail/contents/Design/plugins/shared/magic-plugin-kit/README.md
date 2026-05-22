# Magic Plugin Kit

`magic-plugin-kit` 是给仓库内置设计插件用的轻量共享层。

它的目标不是改变现有插件协议，而是把重复的 DOM、上传、选项组、生成提交流程收口起来，让业务插件只描述：

- 初始 state
- 需要渲染哪些 section
- 生成前怎么校验
- 最终怎么拼 `ctx.ai.generateAndPlace()` 请求

插件 runtime 协议仍然保持不变：

- 入口仍然是 `registerMagicCanvasPlugin({ mount(ctx, root) { ... } })`
- 每个插件仍然在自己的 iframe 中独立运行
- 每个插件仍然独立管理自己的业务 state

## 入口

```js
MagicPluginKit.mount(ctx, root, config)
```

参数：

- `ctx`: 插件 runtime 上下文，由宿主注入
- `root`: 插件挂载 DOM 容器
- `config`: 业务插件配置对象

最小示例：

```js
registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "demo-plugin",
			initialState: {
				productImages: [],
				genCount: 1,
			},
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

### `initialState`

定义插件自己的业务初始状态。

kit 会先注入一组公共状态，再和 `initialState` 合并。

当前公共状态包括：

- `modelOptions`
- `modelId`
- `ratioKey`
- `scale`
- `imageGenerationConfig`
- `loading`
- `error`

因此业务插件只需要补自己的状态，例如：

```js
initialState: {
	productImages: [],
	modelImage: null,
	generationMode: "standard",
	genCount: 1,
}
```

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
3. 调用 `buildRequest`
4. 内部执行 `ctx.ai.generateAndPlace(request)`
5. 成功时调用 `onSuccess`
6. 失败时自动写入 `state.error` 并 toast

常用字段：

- `buttonLabel`: 按钮默认文案
- `loadingLabel`: 生成中文案
- `getIdleHint`: 按钮上方的空状态提示
- `isDisabled`: 是否禁用生成按钮
- `validate`: 生成前校验，返回字符串表示失败
- `buildRequest`: 组装最终请求
- `onSuccess`: 成功后的自定义行为
- `successMessage`: 未自定义 `onSuccess` 时的成功文案
- `errorMessage`: 失败兜底文案
- `closeOnSuccess`: 未自定义 `onSuccess` 时是否自动关闭

## Section Types

当前内置的 `kind` 有：

- `image-grid`
- `image-slot`
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
- `when`: 条件渲染，返回 `false` 时不显示

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

- `stateKey`
- `title`
- `suffix`
- `uploadLabel`
- `alt`
- `help`
- `pickErrorMessage`
- `beforePick`
- `when`

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

### `option-group`

用于标签按钮组选项。

约定：

- 生成模式、风格、生成数量这类静态枚举都统一使用 `option-group`

常用字段：

- `stateKey`
- `title`
- `suffix`
- `help`
- `groupClassName`
- `showDescriptionOnHover`: 是否改为使用 tooltip DOM 展示 option 的 `description`；
- `when`
- `options`

`options` 结构：

- `value`
- `label`
- `description` 可选
- `disabled` 可选

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
- 当 `showDescriptionOnHover: true` 时，kit 会渲染自定义 tooltip DOM

### `model-select`

用于显式展示模型下拉框。

常用字段：

- `title`
- `when`

说明：

- 不需要传 `stateKey`
- 直接读写 `state.modelId`
- 切换模型时会自动刷新 `ratioKey`、`scale`、`imageGenerationConfig`

### `resolution-select`

用于展示模型分辨率选项。

常用字段：

- `title`
- `hideWhenSingle`: 只有一个分辨率时是否隐藏，默认隐藏
- `when`

说明：

- 不需要传 `stateKey`
- 直接读写 `state.scale`
- 切换分辨率时会同步调整 `state.ratioKey`

## 回调上下文

以下函数里，kit 会传入一个上下文对象：

- `maxCount`
- `beforePick`
- `when`
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

它覆盖了这套配置的大部分常见能力：

- 多图上传
- 单图上传
- 标签组选项
- 分辨率选择
- 生成数量
- 生成前校验
- 请求拼装
