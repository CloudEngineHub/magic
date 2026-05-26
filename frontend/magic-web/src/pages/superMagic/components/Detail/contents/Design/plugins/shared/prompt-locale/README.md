# Magic Prompt Locale

`MagicPromptLocale` 是 Design 插件运行时里的轻量多语言辅助对象。

它只负责三类事情：

- 解析 prompt locale
- 判断 prompt 应该走中文还是英文
- 处理双语文案和参考图标签

不负责拼接具体业务 prompt，也不负责 UI、状态或请求构建。

## 注入方式

运行时在 [../../options.ts](../../options.ts) 中通过 `sharedPluginRuntimeCode` 注入。

当前顺序是：

1. `MagicPluginKit`
2. `MagicPromptLocale`
3. 各插件自己的 runtime

因此基于 `MagicPluginKit` 的内置 Design 插件可以直接使用全局对象：

```js
/* global MagicPromptLocale */
```

## API

### `resolveLocale(ctxOrLocale)`

接受 `ctx` 或 locale 字符串，返回最终 locale。

```js
const promptLocale = MagicPromptLocale.resolveLocale(ctx)
```

### `isChinese(ctxOrLocale)`

当 locale 以 `zh` 开头时返回 `true`。

```js
if (MagicPromptLocale.isChinese(promptLocale)) {
	// 中文 prompt
}
```

### `pickText(textMap, ctxOrLocale, fallbackKey = "en")`

从双语对象里选出当前语言对应的文本。

```js
const suffix = MagicPromptLocale.pickText(modeDefinition.promptSuffix, promptLocale)
```

推荐文案结构：

```js
{
	zh: "中文文案",
	en: "English copy",
}
```

### `getReferenceLabel(index, ctxOrLocale)`

返回当前语言下的单个参考图标签。

```js
MagicPromptLocale.getReferenceLabel(1, promptLocale)
// zh -> "参考图 1"
// en -> "reference image 1"
```

### `joinReferenceLabels(count, ctxOrLocale)`

返回当前语言下的参考图标签列表。

```js
MagicPromptLocale.joinReferenceLabels(3, promptLocale)
// zh -> "参考图 1、参考图 2、参考图 3"
// en -> "reference image 1, reference image 2, reference image 3"
```

## 使用建议

推荐在插件里保持下面的职责边界：

- 插件内部：负责业务 prompt 的真正内容和参数拼装
- `MagicPromptLocale`：负责 locale 判定、双语文本选择、参考图标签

推荐写法：

```js
const promptLocale = MagicPromptLocale.resolveLocale(ctx)

function buildPrompt({ locale, generationMode }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const modePromptSuffix = MagicPromptLocale.pickText(
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode)?.promptSuffix,
		locale,
	)
	const baseReference = MagicPromptLocale.getReferenceLabel(1, locale)

	if (isChinese) {
		return `使用${baseReference}生成结果。` + modePromptSuffix
	}

	return `Create the result using ${baseReference}. ` + modePromptSuffix
}
```

## 不建议做的事

- 不要把完整 prompt 模板抽到共享层
- 不要让 helper 依赖 `MagicPluginKit`
- 不要把每个插件的业务参数结构泛化成一个“大一统” prompt builder

共享层应保持足够薄，便于 `virtual-tryon` 这类非 kit 插件未来也能复用同样的 locale 能力。