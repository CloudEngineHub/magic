/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const MAX_PRODUCT_IMAGES = 5
const MAX_UPLOADED_STYLE_IMAGES = 10
const MAX_SMART_SHOTS = 10
const CREATION_MODE_OPTIONS = [
	{
		value: "smart",
		labelKey: "creationMode.smart",
		labelFallback: "智能套图",
		descriptionKey: "creationMode.smart.desc",
		descriptionFallback: "自动规划营销主图与详情图，适合快速批量生成。",
	},
	{
		value: "custom",
		labelKey: "creationMode.custom",
		labelFallback: "自定义套图",
		descriptionKey: "creationMode.custom.desc",
		descriptionFallback: "手动维护样式卡片，按每个样式的配置分别生成。",
	},
]

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "平衡生成效率、营销表达与商品还原。",
		promptSuffix: {
			zh: "保持商品结构准确、营销氛围明确，并兼顾电商可用性与视觉完成度。",
			en: "Keep the product structure accurate, the marketing message clear, and the final visuals commercially usable.",
		},
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback: "增强材质细节、卖点表现和排版层次感。",
		promptSuffix: {
			zh: "增强材质纹理、细节特写、构图层次与卖点视觉表达，适合高要求营销素材。",
			en: "Enhance material texture, detail close-ups, composition layering, and selling-point presentation for premium marketing assets.",
		},
	},
	{
		value: "premium",
		labelKey: "generationMode.premium",
		labelFallback: "专业模式",
		descriptionKey: "generationMode.premium.desc",
		descriptionFallback: "优先成片质感、品牌叙事和高端视觉一致性。",
		promptSuffix: {
			zh: "优先输出品牌调性统一、视觉叙事完整、适合专业营销投放的商品套图。",
			en: "Prioritize premium brand consistency, complete visual storytelling, and professional marketing-ready product image sets.",
		},
	},
]

const SMART_SHOT_TYPE_OPTIONS = [
	{
		value: "hero",
		labelKey: "smartShotType.hero",
		labelFallback: "主图/模特图",
		promptLabel: {
			zh: "主图/模特图",
			en: "hero / model image",
		},
		promptInstruction: {
			zh: "以主视觉为核心的主图或模特展示图，重点突出商品主体、模特表现与整体氛围。可以包含少量辅助文案、局部细节或功能提示，但主视觉必须明确，不要做成信息过载的详情页版式，也不要把多张彼此独立的套图任务混在同一张图中。",
			en: "Create a hero or model-led image with a clear primary visual focus. Emphasize the product, model presentation, and overall atmosphere. Small supporting copy, detail highlights, or feature cues are allowed, but the main visual must stay dominant. Do not turn it into an overloaded detail-page layout or merge multiple independent image-set tasks into one frame.",
		},
	},
	{
		value: "selling",
		labelKey: "smartShotType.selling",
		labelFallback: "卖点图",
		promptLabel: {
			zh: "卖点图",
			en: "selling-point image",
		},
		promptInstruction: {
			zh: "围绕一个核心卖点主题组织卖点图。每张图只表达一个卖点，可以从功能亮点、利益点、对比关系或结构优势中选择最适合当前任务的一个方向。允许局部放大、标注、图文组合或小范围信息分区，但所有元素都必须服务同一个卖点，不要在一张图里罗列多个卖点。",
			en: "Create a selling-point image around one core benefit theme. Each image should communicate only one selling point, choosing the most suitable angle from a functional highlight, customer benefit, comparison, or structural advantage. Close-up callouts, labels, image-and-text composition, or small segmented areas are allowed, but every element must support the same selling point instead of listing multiple benefits in one image.",
		},
	},
	{
		value: "detail",
		labelKey: "smartShotType.detail",
		labelFallback: "详情图/A+图",
		promptLabel: {
			zh: "详情图/A+图",
			en: "detail / A+ image",
		},
		promptInstruction: {
			zh: "生成一张详情图或 A+ 图，但每张图只讲一个详情主题，例如材质、结构、工艺、尺寸、功能说明、使用方式或局部特写中的一个。允许围绕该主题做少量分区、细节拆解或图文说明，但不要把多个详情主题、多个参数和多个场景堆在同一张图里。",
			en: "Create a detail or A+ image, but each image should explain only one detail topic, such as material, construction, craftsmanship, dimensions, functional explanation, usage guidance, or one close-up detail. Small sections, detail breakdowns, or image-and-text explanations are allowed when they support that topic, but do not pack multiple detail topics, specifications, and scenarios into one image.",
		},
	},
]

const MARKET_OPTIONS = [
	{ value: "cn", labelKey: "market.cn", labelFallback: "中国" },
	{ value: "us", labelKey: "market.us", labelFallback: "美国" },
	{ value: "uk", labelKey: "market.uk", labelFallback: "英国" },
	{ value: "de", labelKey: "market.de", labelFallback: "德国" },
	{ value: "jp", labelKey: "market.jp", labelFallback: "日本" },
	{ value: "br", labelKey: "market.br", labelFallback: "巴西" },
	{ value: "sa", labelKey: "market.sa", labelFallback: "沙特" },
	{ value: "vn", labelKey: "market.vn", labelFallback: "越南" },
	{ value: "mx", labelKey: "market.mx", labelFallback: "墨西哥" },
	{ value: "in", labelKey: "market.in", labelFallback: "印度" },
	{ value: "pl", labelKey: "market.pl", labelFallback: "波兰" },
	{ value: "kr", labelKey: "market.kr", labelFallback: "韩国" },
	{ value: "custom", labelKey: "common.custom", labelFallback: "自定义" },
]

const COPY_LANGUAGE_OPTIONS = [
	{ value: "zh", labelKey: "copyLanguage.zh", labelFallback: "中文" },
	{ value: "en", labelKey: "copyLanguage.en", labelFallback: "英语" },
	{ value: "de", labelKey: "copyLanguage.de", labelFallback: "德语" },
	{ value: "es", labelKey: "copyLanguage.es", labelFallback: "西班牙语" },
	{ value: "ja", labelKey: "copyLanguage.ja", labelFallback: "日语" },
	{ value: "fr", labelKey: "copyLanguage.fr", labelFallback: "法语" },
	{ value: "pt", labelKey: "copyLanguage.pt", labelFallback: "葡萄牙语" },
	{ value: "ar", labelKey: "copyLanguage.ar", labelFallback: "阿拉伯语" },
	{ value: "ko", labelKey: "copyLanguage.ko", labelFallback: "韩语" },
	{ value: "custom", labelKey: "common.custom", labelFallback: "自定义" },
]

const PLATFORM_OPTIONS = [
	{ value: "taobao", labelKey: "platform.taobao", labelFallback: "淘宝" },
	{ value: "amazon", labelKey: "platform.amazon", labelFallback: "亚马逊" },
	{ value: "pdd", labelKey: "platform.pdd", labelFallback: "拼多多" },
	{ value: "douyin", labelKey: "platform.douyin", labelFallback: "抖音" },
	{ value: "xiaohongshu", labelKey: "platform.xiaohongshu", labelFallback: "小红书" },
	{ value: "jd", labelKey: "platform.jd", labelFallback: "京东" },
	{ value: "temu", labelKey: "platform.temu", labelFallback: "Temu" },
	{ value: "shopee", labelKey: "platform.shopee", labelFallback: "Shopee" },
	{ value: "shein", labelKey: "platform.shein", labelFallback: "Shein" },
	{ value: "sueritong", labelKey: "platform.sueritong", labelFallback: "速卖通" },
	{ value: "shopify", labelKey: "platform.shopify", labelFallback: "Shopify" },
	{ value: "ebay", labelKey: "platform.ebay", labelFallback: "eBay" },
	{ value: "lazada", labelKey: "platform.lazada", labelFallback: "Lazada" },
	{ value: "etsy", labelKey: "platform.etsy", labelFallback: "Etsy" },
]

const THEME_MODE_OPTIONS = [
	{ value: "smart", labelKey: "themeMode.smart", labelFallback: "智能主题色" },
	{ value: "custom", labelKey: "themeMode.custom", labelFallback: "自定义颜色" },
]

const THEME_COLOR_OPTIONS = ["#5b8def", "#ff7a59", "#30c67c", "#111827", "#eab308", "#ec4899"]

const FONT_STYLE_OPTIONS = [
	{ value: "smart", labelKey: "fontStyle.smart", labelFallback: "智能字体风格" },
	{ value: "minimal", labelKey: "fontStyle.minimal", labelFallback: "极简无衬线体" },
	{ value: "elegant", labelKey: "fontStyle.elegant", labelFallback: "优雅衬线体" },
	{ value: "bold", labelKey: "fontStyle.bold", labelFallback: "力量粗体/营销体" },
	{ value: "handwritten", labelKey: "fontStyle.handwritten", labelFallback: "手写/书法体" },
	{ value: "custom", labelKey: "common.custom", labelFallback: "自定义" },
]

const CUSTOM_STYLE_TYPE_OPTIONS = [
	{ value: "main", labelKey: "customStyleType.main", labelFallback: "主图/辅图" },
	{ value: "detail", labelKey: "customStyleType.detail", labelFallback: "详情页图" },
	{ value: "selling", labelKey: "customStyleType.selling", labelFallback: "卖点图" },
	{ value: "other", labelKey: "customStyleType.other", labelFallback: "其他" },
]

function createId(prefix) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/* create default more settings */
function createDefaultMoreSettings() {
	return {
		targetMarkets: ["cn"],
		customTargetMarket: "",
		copyLanguage: "zh",
		customCopyLanguage: "",
		targetPlatforms: ["taobao"],
		themeMode: "smart",
		themeColor: THEME_COLOR_OPTIONS[0],
		fontStyle: "smart",
		customFontStyle: "",
		extraDescription: "",
	}
}

function createDefaultSmartComposition() {
	return { hero: 0, selling: 0, detail: 0 }
}

function createDefaultCustomStyle() {
	return {
		id: createId("style"),
		kind: "custom-style",
		name: "",
		styleType: "main",
		typeDescription: "",
		ratioKey: "",
		count: 1,
		subjectConsistency: true,
		smartCopy: true,
		faceRefs: [],
		otherRefs: [],
	}
}

function cloneStyleItem(item) {
	return {
		...item,
		id: createId("style"),
		faceRefs: [...(item.faceRefs ?? [])],
		otherRefs: [...(item.otherRefs ?? [])],
	}
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 5
}

function getLabelByValue(options, value, t) {
	const matched = options.find((item) => item.value === value)
	return matched ? t(matched.labelKey, matched.labelFallback) : value
}

function getLabelsByValues(options, values, t) {
	return values.map((value) => getLabelByValue(options, value, t)).filter(Boolean)
}

function getResolvedSettingValue(options, value, customValue, t) {
	if (value === "custom") return String(customValue ?? "").trim()
	return getLabelByValue(options, value, t)
}

function getResolvedSettingValues(options, values, customValue, t) {
	return values
		.map((value) => getResolvedSettingValue(options, value, customValue, t))
		.filter(Boolean)
}

function getUploadedStyleCount(styleItems) {
	return styleItems.filter((item) => item.kind === "uploaded-style").length
}

function getStyleItemReferenceImages(styleItem) {
	if (!styleItem) return []
	if (styleItem.kind === "uploaded-style") {
		return styleItem.coverImage ? [styleItem.coverImage] : []
	}
	return [...(styleItem.faceRefs ?? []), ...(styleItem.otherRefs ?? [])]
}

function getStyleItemTitle(styleItem, t) {
	if (styleItem.kind === "uploaded-style") {
		return styleItem.label?.trim() || t("style.uploaded.defaultName", "上传样式")
	}
	return styleItem.name?.trim() || t("style.custom.defaultName", "自定义样式")
}

function normalizeSmartComposition(composition) {
	return {
		hero: Math.max(0, Number(composition?.hero) || 0),
		selling: Math.max(0, Number(composition?.selling) || 0),
		detail: Math.max(0, Number(composition?.detail) || 0),
	}
}

function getSmartCompositionCounts(state) {
	return normalizeSmartComposition({
		...createDefaultSmartComposition(),
		...(state.smartComposition ?? {}),
	})
}

function getSmartShotCount(state) {
	const composition = getSmartCompositionCounts(state)
	return SMART_SHOT_TYPE_OPTIONS.reduce((total, option) => total + composition[option.value], 0)
}

function buildSmartShotPlan(state) {
	const composition = getSmartCompositionCounts(state)
	const plan = []
	SMART_SHOT_TYPE_OPTIONS.forEach((option) => {
		for (let index = 0; index < composition[option.value]; index += 1) {
			plan.push({
				shotType: option.value,
				shotTypeIndex: index + 1,
				shotTypeTotal: composition[option.value],
			})
		}
	})
	return plan.map((item, index, list) => ({
		...item,
		shotIndex: index + 1,
		shotTotal: list.length,
	}))
}

function getSmartShotDefinition(shotType) {
	return (
		SMART_SHOT_TYPE_OPTIONS.find((option) => option.value === shotType) ??
		SMART_SHOT_TYPE_OPTIONS[0]
	)
}

function parseRatioLabel(ratioLabel) {
	if (!ratioLabel || typeof ratioLabel !== "string") return null
	const match = ratioLabel.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
	if (!match) return null
	const width = Number(match[1])
	const height = Number(match[2])
	if (!width || !height) return null
	return width / height
}

function normalizeResolvedSize(sizeItem, helpers) {
	const parsedSize = helpers.parseSizeValue(sizeItem?.value)
	if (!parsedSize) return null
	return {
		...sizeItem,
		genW: parsedSize.width,
		genH: parsedSize.height,
	}
}

/**
 * 每张样式卡按自己的比例去当前模型里找尺寸；如果模型不支持，就自动降级到最接近的可用比例
 * @param {*} state
 * @param {*} styleItem
 * @param {*} helpers
 * @returns
 */
function resolveCustomStyleSize(state, styleItem, helpers) {
	const fallbackSize = helpers.getSelectedSize(state)
	const visibleSizes = helpers.getVisibleSizes(state) ?? []
	if (!visibleSizes.length) return fallbackSize

	const exactMatch = visibleSizes.find((item) => item.label === styleItem?.ratioKey)
	if (exactMatch) {
		return normalizeResolvedSize(exactMatch, helpers) ?? fallbackSize
	}

	const targetRatio = parseRatioLabel(styleItem?.ratioKey)
	if (!targetRatio) {
		return normalizeResolvedSize(visibleSizes[0], helpers) ?? fallbackSize
	}

	//
	let closestSize = null
	let closestDistance = Infinity
	visibleSizes.forEach((item) => {
		const parsedSize = helpers.parseSizeValue(item.value)
		if (!parsedSize) return
		const currentRatio = parsedSize.width / parsedSize.height
		const distance = Math.abs(currentRatio - targetRatio)
		if (distance < closestDistance) {
			closestDistance = distance
			closestSize = item
		}
	})

	return normalizeResolvedSize(closestSize ?? visibleSizes[0]) ?? fallbackSize
}

/* summarize more settings */
function summarizeMoreSettings(settings, t) {
	const markets = getResolvedSettingValues(
		MARKET_OPTIONS,
		settings.targetMarkets,
		settings.customTargetMarket,
		t,
	).slice(0, 2)
	const platforms = getLabelsByValues(PLATFORM_OPTIONS, settings.targetPlatforms, t).slice(0, 2)
	const language = getResolvedSettingValue(
		COPY_LANGUAGE_OPTIONS,
		settings.copyLanguage,
		settings.customCopyLanguage,
		t,
	)
	const fontStyle = getResolvedSettingValue(
		FONT_STYLE_OPTIONS,
		settings.fontStyle,
		settings.customFontStyle,
		t,
	)
	const theme =
		settings.themeMode === "smart"
			? t("themeMode.smart", "智能主题色")
			: `${t("themeMode.custom", "自定义颜色")} ${settings.themeColor}`

	return [markets.join("/"), language, platforms.join("/"), theme, fontStyle]
		.filter(Boolean)
		.join(" · ")
}

function createSectionNode(title, suffix, required = false, requiredLabel = "必填") {
	const section = document.createElement("section")
	section.className = "mpk-section"
	const header = document.createElement("div")
	header.className = "mpk-section-header"
	const titleEl = document.createElement("label")
	titleEl.className = "mpk-section-title"
	titleEl.append(document.createTextNode(title))
	if (required) {
		const requiredEl = document.createElement("span")
		requiredEl.className = "mpk-section-required"
		requiredEl.textContent = requiredLabel
		titleEl.append(requiredEl)
	}
	header.append(titleEl)
	if (suffix) {
		const suffixEl = document.createElement("span")
		suffixEl.className = "mpk-section-suffix"
		suffixEl.textContent = suffix
		header.append(suffixEl)
	}
	section.append(header)
	return section
}

function createPillButton(label, isActive, onClick) {
	const button = document.createElement("button")
	button.type = "button"
	button.className = `pis-pill${isActive ? " is-active" : ""}`
	button.textContent = label
	button.addEventListener("click", onClick)
	return button
}

function createIconButton(label, onClick) {
	const button = document.createElement("button")
	button.type = "button"
	button.className = "pis-icon-btn"
	button.textContent = label
	button.addEventListener("click", onClick)
	return button
}

function createCounterControl(value, onChange) {
	const wrap = document.createElement("div")
	wrap.className = "pis-counter"
	const minus = document.createElement("button")
	minus.type = "button"
	minus.className = "pis-counter-btn"
	minus.textContent = "−"
	minus.disabled = value <= 0
	minus.addEventListener("click", () => onChange(Math.max(0, value - 1)))
	const valueEl = document.createElement("span")
	valueEl.className = "pis-counter-value"
	valueEl.textContent = String(value)
	const plus = document.createElement("button")
	plus.type = "button"
	plus.className = "pis-counter-btn"
	plus.textContent = "+"
	plus.addEventListener("click", () => onChange(Math.min(10, value + 1)))
	wrap.append(minus, valueEl, plus)
	return wrap
}

function createImageBadge(image, helpers, alt) {
	const item = document.createElement("div")
	item.className = "pis-image-badge"
	const img = document.createElement("img")
	img.className = "pis-image-badge-thumb"
	img.alt = alt
	img.src = helpers.getImageUrl(image)
	item.append(img)
	return item
}

const MoreSettingsUI = (() => {
	function createDrawer(panelEl, t, onConfirm) {
		const drawer = document.createElement("div")
		drawer.className = "pis-drawer"

		const header = document.createElement("div")
		header.className = "pis-drawer-header"
		const backBtn = document.createElement("button")
		backBtn.type = "button"
		backBtn.className = "pis-drawer-back"
		backBtn.textContent = "←"
		const title = document.createElement("span")
		title.className = "pis-drawer-title"
		title.textContent = t("moreSettings.title", "更多设置")
		header.append(backBtn, title)

		const body = document.createElement("div")
		body.className = "pis-drawer-body"

		const footer = document.createElement("div")
		footer.className = "pis-drawer-footer"
		const confirmBtn = document.createElement("button")
		confirmBtn.type = "button"
		confirmBtn.className = "pis-primary-btn"
		confirmBtn.textContent = t("common.confirm", "确认")
		footer.append(confirmBtn)

		drawer.append(header, body, footer)
		panelEl.style.position = "relative"
		panelEl.append(drawer)

		let draft = createDefaultMoreSettings()

		function close() {
			drawer.classList.remove("is-open")
		}

		function renderMultiSelectSection(titleText, options, selectedValues, onToggle) {
			const section = document.createElement("section")
			section.className = "pis-drawer-section"
			const titleEl = document.createElement("h4")
			titleEl.className = "pis-drawer-section-title"
			titleEl.textContent = titleText
			const grid = document.createElement("div")
			grid.className = "pis-pill-grid"
			options.forEach((option) => {
				grid.append(
					createPillButton(
						t(option.labelKey, option.labelFallback),
						selectedValues.includes(option.value),
						() => onToggle(option.value),
					),
				)
			})
			section.append(titleEl, grid)
			return section
		}

		function renderSingleSelectSection(titleText, options, selectedValue, onSelect) {
			const section = document.createElement("section")
			section.className = "pis-drawer-section"
			const titleEl = document.createElement("h4")
			titleEl.className = "pis-drawer-section-title"
			titleEl.textContent = titleText
			const grid = document.createElement("div")
			grid.className = "pis-pill-grid"
			options.forEach((option) => {
				grid.append(
					createPillButton(
						t(option.labelKey, option.labelFallback),
						selectedValue === option.value,
						() => onSelect(option.value),
					),
				)
			})
			section.append(titleEl, grid)
			return section
		}

		function renderCustomField({ titleText, placeholder, value, onInput }) {
			const section = document.createElement("section")
			section.className = "pis-drawer-section"
			const titleEl = document.createElement("h4")
			titleEl.className = "pis-drawer-section-title"
			titleEl.textContent = titleText
			const input = document.createElement("input")
			input.className = "pis-input pis-custom-field"
			input.type = "text"
			input.placeholder = placeholder
			input.value = value
			input.addEventListener("input", () => onInput(input.value))
			section.append(titleEl, input)
			return section
		}

		function renderThemeSection() {
			const section = document.createElement("section")
			section.className = "pis-drawer-section"
			const titleEl = document.createElement("h4")
			titleEl.className = "pis-drawer-section-title"
			titleEl.textContent = t("moreSettings.themeColor", "主题色")
			const modeGrid = document.createElement("div")
			modeGrid.className = "pis-pill-grid"
			THEME_MODE_OPTIONS.forEach((option) => {
				modeGrid.append(
					createPillButton(
						t(option.labelKey, option.labelFallback),
						draft.themeMode === option.value,
						() => {
							draft = { ...draft, themeMode: option.value }
							renderAll()
						},
					),
				)
			})
			section.append(titleEl, modeGrid)
			if (draft.themeMode === "custom") {
				const colorRow = document.createElement("div")
				colorRow.className = "pis-theme-color-row"
				const isCustomThemeColor = !THEME_COLOR_OPTIONS.includes(draft.themeColor)
				const presetSwatches = []

				const customSwatch = document.createElement("button")
				customSwatch.type = "button"
				customSwatch.className = `pis-color-swatch${isCustomThemeColor ? " is-active" : ""}`
				customSwatch.style.background = draft.themeColor

				const syncThemeColorSelection = (nextColor) => {
					const isPresetThemeColor = THEME_COLOR_OPTIONS.includes(nextColor)
					customSwatch.style.background = nextColor
					customSwatch.classList.toggle("is-active", !isPresetThemeColor)
					presetSwatches.forEach(({ color, element }) => {
						element.classList.toggle("is-active", color === nextColor)
					})
				}

				const colorInput = document.createElement("input")
				colorInput.className = "pis-color-input"
				colorInput.type = "color"
				colorInput.value = draft.themeColor
				colorInput.addEventListener("input", () => {
					const nextColor = colorInput.value.toUpperCase()
					draft = { ...draft, themeColor: nextColor }
					syncThemeColorSelection(nextColor)
				})

				customSwatch.append(colorInput)

				THEME_COLOR_OPTIONS.forEach((color) => {
					const swatch = document.createElement("button")
					swatch.type = "button"
					swatch.className = `pis-color-swatch${draft.themeColor === color ? " is-active" : ""}`
					swatch.style.background = color
					presetSwatches.push({ color, element: swatch })
					swatch.addEventListener("click", () => {
						draft = { ...draft, themeColor: color }
						syncThemeColorSelection(color)
					})
					colorRow.append(swatch)
				})

				colorRow.append(customSwatch)
				section.append(colorRow)
			}
			return section
		}

		function renderDescriptionSection() {
			const section = document.createElement("section")
			section.className = "pis-drawer-section"
			const titleEl = document.createElement("h4")
			titleEl.className = "pis-drawer-section-title"
			titleEl.textContent = t("moreSettings.extraDescription", "额外描述")
			const textarea = document.createElement("textarea")
			textarea.className = "pis-textarea"
			textarea.rows = 4
			textarea.maxLength = 600
			textarea.placeholder = t(
				"moreSettings.extraDescription.placeholder",
				"您可以在此处输入并设定您期望的设计风格",
			)
			textarea.value = draft.extraDescription
			textarea.addEventListener("input", () => {
				draft = {
					...draft,
					extraDescription: textarea.value.slice(0, 600),
				}
			})
			section.append(titleEl, textarea)
			return section
		}

		function renderAll() {
			const scrollTop = body.scrollTop
			const scrollLeft = body.scrollLeft
			const sections = [
				renderMultiSelectSection(
					t("moreSettings.targetMarkets", "目标销售国家/地区"),
					MARKET_OPTIONS,
					draft.targetMarkets,
					(value) => {
						const nextValues = draft.targetMarkets.includes(value)
							? draft.targetMarkets.filter((item) => item !== value)
							: [...draft.targetMarkets, value]
						draft = {
							...draft,
							targetMarkets: nextValues.length ? nextValues : [value],
						}
						renderAll()
					},
				),
			]
			if (draft.targetMarkets.includes("custom")) {
				sections.push(
					renderCustomField({
						titleText: t("moreSettings.customTargetMarket", "自定义目标销售国家/地区"),
						placeholder: t(
							"moreSettings.customTargetMarket.placeholder",
							"请输入自定义国家、地区或市场",
						),
						value: draft.customTargetMarket,
						onInput: (value) => {
							draft = { ...draft, customTargetMarket: value.slice(0, 100) }
						},
					}),
				)
			}

			sections.push(
				renderSingleSelectSection(
					t("moreSettings.copyLanguage", "图片文案语言"),
					COPY_LANGUAGE_OPTIONS,
					draft.copyLanguage,
					(value) => {
						draft = { ...draft, copyLanguage: value }
						renderAll()
					},
				),
			)
			if (draft.copyLanguage === "custom") {
				sections.push(
					renderCustomField({
						titleText: t("moreSettings.customCopyLanguage", "自定义图片文案语言"),
						placeholder: t(
							"moreSettings.customCopyLanguage.placeholder",
							"请输入自定义文案语言",
						),
						value: draft.customCopyLanguage,
						onInput: (value) => {
							draft = { ...draft, customCopyLanguage: value.slice(0, 100) }
						},
					}),
				)
			}

			sections.push(
				renderMultiSelectSection(
					t("moreSettings.targetPlatforms", "目标平台"),
					PLATFORM_OPTIONS,
					draft.targetPlatforms,
					(value) => {
						const nextValues = draft.targetPlatforms.includes(value)
							? draft.targetPlatforms.filter((item) => item !== value)
							: [...draft.targetPlatforms, value]
						draft = {
							...draft,
							targetPlatforms: nextValues.length ? nextValues : [value],
						}
						renderAll()
					},
				),
				renderThemeSection(),
				renderSingleSelectSection(
					t("moreSettings.fontStyle", "字体风格"),
					FONT_STYLE_OPTIONS,
					draft.fontStyle,
					(value) => {
						draft = { ...draft, fontStyle: value }
						renderAll()
					},
				),
			)
			if (draft.fontStyle === "custom") {
				sections.push(
					renderCustomField({
						titleText: t("moreSettings.customFontStyle", "自定义字体风格"),
						placeholder: t(
							"moreSettings.customFontStyle.placeholder",
							"请输入自定义字体风格说明",
						),
						value: draft.customFontStyle,
						onInput: (value) => {
							draft = { ...draft, customFontStyle: value.slice(0, 100) }
						},
					}),
				)
			}

			sections.push(renderDescriptionSection())
			body.replaceChildren(...sections)
			body.scrollTop = scrollTop
			body.scrollLeft = scrollLeft
		}

		function open(settings) {
			draft = {
				...createDefaultMoreSettings(),
				...settings,
				targetMarkets: [...(settings?.targetMarkets ?? ["cn"])],
				targetPlatforms: [...(settings?.targetPlatforms ?? ["taobao"])],
			}
			renderAll()
			requestAnimationFrame(() => drawer.classList.add("is-open"))
		}

		backBtn.addEventListener("click", close)
		confirmBtn.addEventListener("click", () => {
			onConfirm({
				...draft,
				targetMarkets: [...draft.targetMarkets],
				targetPlatforms: [...draft.targetPlatforms],
			})
			close()
		})

		function destroy() {
			drawer.remove()
		}

		return { open, close, destroy }
	}

	function createSection({ state, t, getDrawer }) {
		const section = createSectionNode(t("section.moreSettings", "更多设置"))
		const button = document.createElement("button")
		button.type = "button"
		button.className = "pis-summary-btn"
		const content = document.createElement("div")
		content.className = "pis-summary-content"
		const title = document.createElement("span")
		title.className = "pis-summary-title"
		title.textContent = t("section.moreSettings", "更多设置")
		const summary = document.createElement("span")
		summary.className = "pis-summary-text"
		summary.textContent =
			summarizeMoreSettings(state.moreSettings, t) ||
			t("moreSettings.empty", "点击设置业务参数")
		content.append(title, summary)
		const arrow = document.createElement("span")
		arrow.className = "pis-summary-arrow"
		arrow.textContent = "›"
		button.append(content, arrow)
		button.addEventListener("click", () => getDrawer().open(state.moreSettings))
		section.append(button)
		return section
	}

	return { createDrawer, createSection }
})()

const StyleEditorUI = (() => {
	function createStyleCard(styleItem, context) {
		const { state, setState, t, getStyleEditor, helpers } = context
		const card = document.createElement("article")
		card.className = "pis-style-card"
		const media = document.createElement("div")
		media.className = "pis-style-card-media"
		if (styleItem.kind === "uploaded-style" && styleItem.coverImage) {
			media.append(
				createImageBadge(styleItem.coverImage, helpers, getStyleItemTitle(styleItem, t)),
			)
		} else if (styleItem.faceRefs?.length || styleItem.otherRefs?.length) {
			media.append(
				createImageBadge(
					styleItem.faceRefs?.length ? styleItem.faceRefs[0] : styleItem.otherRefs[0],
					helpers,
					getStyleItemTitle(styleItem, t),
				),
			)
		} else {
			const placeholder = document.createElement("div")
			placeholder.className = "pis-style-placeholder"
			placeholder.textContent =
				styleItem.kind === "uploaded-style"
					? t("style.uploaded.defaultName", "上传样式")
					: t("style.custom.defaultName", "自定义样式")
			media.append(placeholder)
		}
		const content = document.createElement("div")
		content.className = "pis-style-card-content"
		const title = document.createElement("h4")
		title.className = "pis-style-card-title"
		title.textContent = getStyleItemTitle(styleItem, t)
		const meta = document.createElement("p")
		meta.className = "pis-style-card-meta"
		meta.textContent =
			styleItem.kind === "uploaded-style"
				? `${styleItem.ratioKey || t("common.followModel", "跟随当前画布")} · ${styleItem.count}${t("common.imagesSuffix", "张")}`
				: `${getLabelByValue(CUSTOM_STYLE_TYPE_OPTIONS, styleItem.styleType, t)} · ${styleItem.ratioKey || t("common.followModel", "跟随当前画布")} · ${styleItem.count}${t("common.imagesSuffix", "张")}`
		content.append(title, meta)
		if (styleItem.kind === "custom-style" && styleItem.typeDescription) {
			const desc = document.createElement("p")
			desc.className = "pis-style-card-desc"
			desc.textContent = styleItem.typeDescription
			content.append(desc)
		}
		if (styleItem.kind === "uploaded-style" && styleItem.notes) {
			const desc = document.createElement("p")
			desc.className = "pis-style-card-desc"
			desc.textContent = styleItem.notes
			content.append(desc)
		}
		const actions = document.createElement("div")
		actions.className = "pis-style-card-actions"
		actions.append(
			createIconButton(t("common.edit", "编辑"), () =>
				getStyleEditor().open(styleItem, "edit"),
			),
			createIconButton(t("common.duplicate", "复制"), () => {
				setState({ styleItems: [...state.styleItems, cloneStyleItem(styleItem)] })
			}),
			createIconButton(t("common.delete", "删除"), () => {
				setState({
					styleItems: state.styleItems.filter((item) => item.id !== styleItem.id),
				})
			}),
		)
		content.append(actions)
		card.append(media, content)
		return card
	}

	function createEditor(panelEl, t, dependencies) {
		const { pickImageFiles, getRatioOptions, onSave, helpers } = dependencies
		const modal = document.createElement("div")
		modal.className = "pis-style-editor"

		panelEl.append(modal)

		let draft = null
		let mode = "create"

		function close() {
			modal.classList.remove("is-open")
		}

		async function pickRefs(key) {
			try {
				const images = await pickImageFiles({ multiple: true, maxCount: 6 })
				if (!images?.length) return
				draft = {
					...draft,
					[key]: [...draft[key], ...images].slice(0, 6),
				}
				renderAll()
			} catch {
				// Keep editor state stable when user cancels picker.
			}
		}

		function renderImageBucket(titleText, key) {
			const section = document.createElement("div")
			section.className = "pis-style-editor-field"
			const label = document.createElement("label")
			label.className = "pis-style-editor-label"
			label.textContent = titleText
			const bucket = document.createElement("div")
			bucket.className = "pis-ref-bucket"
			const grid = document.createElement("div")
			grid.className = "pis-ref-grid"
			;(draft[key] ?? []).forEach((image, index) => {
				const item = document.createElement("div")
				item.className = "pis-ref-item"
				item.append(createImageBadge(image, helpers, titleText))
				const remove = document.createElement("button")
				remove.type = "button"
				remove.className = "pis-ref-remove"
				remove.textContent = "×"
				remove.addEventListener("click", () => {
					draft = {
						...draft,
						[key]: draft[key].filter((_, currentIndex) => currentIndex !== index),
					}
					renderAll()
				})
				item.append(remove)
				grid.append(item)
			})
			const add = document.createElement("button")
			add.type = "button"
			add.className = "pis-ref-add"
			add.textContent = t("styleEditor.uploadRefs", "上传 / 拖拽【图片】")
			add.addEventListener("click", () => {
				void pickRefs(key)
			})
			bucket.append(grid, add)
			section.append(label, bucket)
			return section
		}

		function renderAll() {
			const previousBody = modal.querySelector(".pis-style-editor-body")
			const scrollTop = previousBody?.scrollTop ?? 0
			const scrollLeft = previousBody?.scrollLeft ?? 0
			modal.replaceChildren()
			const header = document.createElement("div")
			header.className = "pis-drawer-header"
			const backBtn = document.createElement("button")
			backBtn.type = "button"
			backBtn.className = "pis-drawer-back"
			backBtn.textContent = "←"
			backBtn.addEventListener("click", close)
			const title = document.createElement("span")
			title.className = "pis-drawer-title"
			title.textContent =
				draft.kind === "uploaded-style"
					? t("styleEditor.uploadedTitle", "上传样式设置")
					: t("styleEditor.customTitle", "自定义样式设置")
			header.append(backBtn, title)

			const body = document.createElement("div")
			body.className = "pis-style-editor-body"

			const nameField = document.createElement("div")
			nameField.className = "pis-style-editor-field"
			const nameLabel = document.createElement("label")
			nameLabel.className = "pis-style-editor-label"
			nameLabel.textContent = t("styleEditor.name", "样式名称")
			const nameInput = document.createElement("input")
			nameInput.className = "pis-input"
			nameInput.maxLength = 20
			nameInput.value = draft.name || draft.label || ""
			nameInput.placeholder = t("styleEditor.name.placeholder", "请输入样式名称")
			nameInput.addEventListener("input", () => {
				const nextValue = nameInput.value.slice(0, 20)
				draft =
					draft.kind === "uploaded-style"
						? { ...draft, label: nextValue }
						: { ...draft, name: nextValue }
			})
			nameField.append(nameLabel, nameInput)
			body.append(nameField)

			if (draft.kind === "custom-style") {
				const typeField = document.createElement("div")
				typeField.className = "pis-style-editor-field"
				const typeLabel = document.createElement("label")
				typeLabel.className = "pis-style-editor-label"
				typeLabel.textContent = t("styleEditor.type", "样式类型")
				const typeGrid = document.createElement("div")
				typeGrid.className = "pis-pill-grid pis-pill-grid-compact"
				CUSTOM_STYLE_TYPE_OPTIONS.forEach((option) => {
					typeGrid.append(
						createPillButton(
							t(option.labelKey, option.labelFallback),
							draft.styleType === option.value,
							() => {
								draft = { ...draft, styleType: option.value }
								renderAll()
							},
						),
					)
				})
				typeField.append(typeLabel, typeGrid)
				body.append(typeField)

				const descField = document.createElement("div")
				descField.className = "pis-style-editor-field"
				const descLabel = document.createElement("label")
				descLabel.className = "pis-style-editor-label"
				descLabel.textContent = t("styleEditor.typeDescription", "类型描述")
				const descInput = document.createElement("textarea")
				descInput.className = "pis-textarea"
				descInput.rows = 3
				descInput.maxLength = 600
				descInput.placeholder = t(
					"styleEditor.typeDescription.placeholder",
					"请输入类型描述",
				)
				descInput.value = draft.typeDescription
				descInput.addEventListener("input", () => {
					draft = { ...draft, typeDescription: descInput.value.slice(0, 600) }
				})
				descField.append(descLabel, descInput)
				body.append(descField)
			}

			const ratioField = document.createElement("div")
			ratioField.className = "pis-style-editor-field"
			const ratioLabel = document.createElement("label")
			ratioLabel.className = "pis-style-editor-label"
			ratioLabel.textContent = t("styleEditor.ratio", "生成比例")
			const ratioGrid = document.createElement("div")
			ratioGrid.className = "pis-pill-grid pis-pill-grid-compact"
			getRatioOptions().forEach((option) => {
				ratioGrid.append(
					createPillButton(option.label, draft.ratioKey === option.label, () => {
						draft = { ...draft, ratioKey: option.label }
						renderAll()
					}),
				)
			})
			ratioField.append(ratioLabel, ratioGrid)
			body.append(ratioField)

			const countField = document.createElement("div")
			countField.className = "pis-style-editor-field"
			const countLabel = document.createElement("label")
			countLabel.className = "pis-style-editor-label"
			countLabel.textContent = t("styleEditor.count", "生成数量")
			countField.append(
				countLabel,
				createCounterControl(draft.count, (value) => {
					draft = { ...draft, count: value }
					renderAll()
				}),
			)
			body.append(countField)

			if (draft.kind === "custom-style") {
				const toggleGrid = document.createElement("div")
				toggleGrid.className = "pis-style-editor-toggle-grid"
				const subjectField = document.createElement("div")
				subjectField.className = "pis-toggle-card"
				const subjectLabel = document.createElement("span")
				subjectLabel.textContent = t("styleEditor.subjectConsistency", "主体一致性")
				const subjectToggle = document.createElement("input")
				subjectToggle.type = "checkbox"
				subjectToggle.className = "pis-toggle"
				subjectToggle.checked = draft.subjectConsistency
				subjectToggle.addEventListener("change", () => {
					draft = { ...draft, subjectConsistency: subjectToggle.checked }
				})
				subjectField.append(subjectLabel, subjectToggle)
				const copyField = document.createElement("div")
				copyField.className = "pis-toggle-card"
				const copyLabel = document.createElement("span")
				copyLabel.textContent = t("styleEditor.smartCopy", "智能文案")
				const copyToggle = document.createElement("input")
				copyToggle.type = "checkbox"
				copyToggle.className = "pis-toggle"
				copyToggle.checked = draft.smartCopy
				copyToggle.addEventListener("change", () => {
					draft = { ...draft, smartCopy: copyToggle.checked }
				})
				copyField.append(copyLabel, copyToggle)
				toggleGrid.append(subjectField, copyField)
				body.append(toggleGrid)

				body.append(
					renderImageBucket(
						t("styleEditor.faceRefs", "人脸/模特参考图（非必填）"),
						"faceRefs",
					),
					renderImageBucket(
						t("styleEditor.otherRefs", "其它参考图（非必填）"),
						"otherRefs",
					),
				)
			} else {
				const noteField = document.createElement("div")
				noteField.className = "pis-style-editor-field"
				const noteLabel = document.createElement("label")
				noteLabel.className = "pis-style-editor-label"
				noteLabel.textContent = t("styleEditor.notes", "样式说明")
				const noteInput = document.createElement("textarea")
				noteInput.className = "pis-textarea"
				noteInput.rows = 3
				noteInput.maxLength = 600
				noteInput.placeholder = t(
					"styleEditor.notes.placeholder",
					"描述该上传样式要如何被复用",
				)
				noteInput.value = draft.notes || ""
				noteInput.addEventListener("input", () => {
					draft = { ...draft, notes: noteInput.value.slice(0, 600) }
				})
				noteField.append(noteLabel, noteInput)
				body.append(noteField)
			}

			const footer = document.createElement("div")
			footer.className = "pis-drawer-footer"
			const confirmBtn = document.createElement("button")
			confirmBtn.type = "button"
			confirmBtn.className = "pis-primary-btn"
			confirmBtn.textContent =
				mode === "edit" ? t("common.save", "保存") : t("common.confirm", "确认")
			confirmBtn.addEventListener("click", () => {
				onSave(draft)
				close()
			})
			footer.append(confirmBtn)

			modal.append(header, body, footer)
			body.scrollTop = scrollTop
			body.scrollLeft = scrollLeft
		}

		function open(styleItem, nextMode) {
			mode = nextMode || "create"
			draft = {
				...(styleItem?.kind === "uploaded-style"
					? {
							id: styleItem.id,
							kind: "uploaded-style",
							coverImage: styleItem.coverImage,
							label: styleItem.label || "",
							ratioKey: styleItem.ratioKey || getRatioOptions()[0]?.label || "",
							count: styleItem.count || 1,
							notes: styleItem.notes || "",
						}
					: styleItem
						? {
								...styleItem,
								faceRefs: [...(styleItem.faceRefs ?? [])],
								otherRefs: [...(styleItem.otherRefs ?? [])],
								ratioKey: styleItem.ratioKey || getRatioOptions()[0]?.label || "",
							}
						: {
								...createDefaultCustomStyle(),
								ratioKey: getRatioOptions()[0]?.label || "",
							}),
			}
			renderAll()
			requestAnimationFrame(() => modal.classList.add("is-open"))
		}

		function destroy() {
			modal.remove()
		}

		return { open, close, destroy }
	}

	function createConfigSection(context) {
		const { state, setState, t, pickImageFiles, getStyleEditor, helpers } = context
		const section = createSectionNode(
			t("section.creationConfig", "套图配置"),
			t("custom.mode.countHint", "按每张样式卡的数量执行"),
			true,
		)
		const wrap = document.createElement("div")
		wrap.className = "pis-custom-mode"
		const header = document.createElement("div")
		header.className = "pis-custom-mode-header"
		const selected = document.createElement("span")
		selected.className = "pis-custom-mode-count"
		selected.textContent = `${t("custom.mode.selectedCount", "已选样式")}${state.styleItems.length}`
		const actions = document.createElement("div")
		actions.className = "pis-custom-mode-actions"
		const addUpload = document.createElement("button")
		addUpload.type = "button"
		addUpload.className = "pis-secondary-btn"
		addUpload.textContent = t("custom.mode.addUploadStyle", "上传样式图")
		addUpload.addEventListener("click", async () => {
			const remaining = MAX_UPLOADED_STYLE_IMAGES - getUploadedStyleCount(state.styleItems)
			if (remaining <= 0) return
			try {
				const images = await pickImageFiles({ multiple: true, maxCount: remaining })
				if (!images?.length) return
				setState({
					styleItems: [
						...state.styleItems,
						...images.map((image, index) => ({
							id: createId("style"),
							kind: "uploaded-style",
							coverImage: image,
							label: `${t("style.uploaded.defaultName", "上传样式")} ${getUploadedStyleCount(state.styleItems) + index + 1}`,
							ratioKey: helpers.getSelectedSize(state)?.label || state.ratioKey || "",
							count: 1,
							notes: "",
						})),
					],
				})
			} catch {
				// User may cancel file picking.
			}
		})
		const addCustom = document.createElement("button")
		addCustom.type = "button"
		addCustom.className = "pis-secondary-btn"
		addCustom.textContent = t("custom.mode.addCustomStyle", "新增自定义样式")
		addCustom.addEventListener("click", () => getStyleEditor().open(null, "create"))
		actions.append(addUpload, addCustom)
		header.append(selected, actions)
		wrap.append(header)

		const list = document.createElement("div")
		list.className = "pis-style-card-list"
		if (!state.styleItems.length) {
			const empty = document.createElement("div")
			empty.className = "pis-style-empty"
			empty.textContent = t("custom.mode.empty", "请先上传样式图或新增自定义样式")
			list.append(empty)
		} else {
			state.styleItems.forEach((item) => {
				list.append(createStyleCard(item, context))
			})
		}
		wrap.append(list)
		section.append(wrap)
		return section
	}

	return { createEditor, createConfigSection }
})()

function createSmartCompositionSection({ state, setState, t }) {
	const section = createSectionNode(t("section.creationConfig", "套图配置"), undefined, true)
	const composition = getSmartCompositionCounts(state)
	const wrap = document.createElement("div")
	wrap.className = "pis-mode-config"
	SMART_SHOT_TYPE_OPTIONS.forEach((option) => {
		const row = document.createElement("div")
		row.className = "pis-toggle-row"
		const label = document.createElement("span")
		label.className = "pis-toggle-label"
		label.textContent = t(option.labelKey, option.labelFallback)
		row.append(
			label,
			createCounterControl(composition[option.value], (value) => {
				setState({
					smartComposition: normalizeSmartComposition({
						...composition,
						[option.value]: value,
					}),
				})
			}),
		)
		wrap.append(row)
	})
	section.append(wrap)
	return section
}

function createSmartCountReadonlySection({ state, t }) {
	const section = createSectionNode(t("section.count", "生成数量"))
	const input = document.createElement("input")
	input.className = "pis-input"
	input.readOnly = true
	input.value = `${getSmartShotCount(state)}${t("common.imagesSuffix", "张")}`
	section.append(input)
	return section
}

function createInitialState() {
	return {
		productImages: [],
		productInfo: "",
		moreSettings: createDefaultMoreSettings(),
		creationMode: "smart",
		smartComposition: createDefaultSmartComposition(),
		smartCopyEnabled: true,
		smartExtraPrompt: "",
		styleItems: [],
		generationMode: "standard",
	}
}

function buildBusinessSettingPrompt(settings, locale, t) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const markets = getResolvedSettingValues(
		MARKET_OPTIONS,
		settings.targetMarkets,
		settings.customTargetMarket,
		t,
	).join("/")
	const platforms = getLabelsByValues(PLATFORM_OPTIONS, settings.targetPlatforms, t).join("/")
	const language =
		getResolvedSettingValue(
			COPY_LANGUAGE_OPTIONS,
			settings.copyLanguage,
			settings.customCopyLanguage,
			t,
		) || (isChinese ? "未指定" : "unspecified")
	const fontStyle =
		getResolvedSettingValue(
			FONT_STYLE_OPTIONS,
			settings.fontStyle,
			settings.customFontStyle,
			t,
		) || (isChinese ? "未指定" : "unspecified")
	const themeText =
		settings.themeMode === "smart"
			? t("themeMode.smart", "智能主题色")
			: `${t("themeMode.custom", "自定义颜色")} ${settings.themeColor}`
	const extraText = settings.extraDescription?.trim()

	if (isChinese) {
		return (
			`目标销售国家/地区：${markets || "未指定"}。` +
			`目标平台：${platforms || "未指定"}。` +
			`图片文案语言：${language}。` +
			`主题色策略：${themeText}。` +
			`字体风格：${fontStyle}。` +
			(extraText ? `更多业务要求：${extraText}。` : "")
		)
	}

	return (
		`Target markets: ${markets || "unspecified"}. ` +
		`Target platforms: ${platforms || "unspecified"}. ` +
		`Copy language: ${language}. ` +
		`Theme strategy: ${themeText}. ` +
		`Font style: ${fontStyle}. ` +
		(extraText ? `Additional business requirements: ${extraText}. ` : "")
	)
}

function buildProductInfoCompletionUserPrompt({ currentText, imageCount }) {
	const currentValue = String(currentText ?? "").trim()
	return [
		"任务目标：基于已上传的商品图，为“商品信息”输入框生成或补全一段适合商品套图生成的商品信息。",
		`已上传商品图数量：${imageCount} 张。`,
		`当前输入：${currentValue || "用户当前未填写。"}`,
		"请综合分析商品名称、品类、核心卖点、材质、规格特征、适用人群、使用场景与营销表达重点。",
		"仅输出适合直接填入“商品信息”文本框的内容，不要添加标题、列表符号或解释说明。",
	].join("\n")
}

function buildSmartExtraPromptCompletionUserPrompt({ state, currentText, t }) {
	const currentValue = String(currentText ?? "").trim()
	const composition = getSmartCompositionCounts(state)
	const businessSummary =
		summarizeMoreSettings(
			{
				...createDefaultMoreSettings(),
				...(state.moreSettings ?? {}),
			},
			t,
		) || "未额外设置"
	return [
		"任务目标：为商品套图插件智能模式下的“额外描述”输入框生成或补全一段可直接用于生成的附加要求。",
		`当前输入：${currentValue || "用户当前未填写。"}`,
		`当前套图规划：主图/模特图 ${composition.hero} 张，卖点图 ${composition.selling} 张，详情图/A+图 ${composition.detail} 张。`,
		`当前更多设置摘要：${businessSummary}。`,
		"补全方向：可以补充视觉风格、镜头语言、模特气质、版式偏好、文案密度、品牌氛围或创意要求，但不要与当前套图张数或图片类型规划冲突。",
		"仅输出适合直接填入“额外描述”输入框的内容，不要添加标题、解释或多余前后缀。",
	].join("\n")
}

function getShotFocusOptions(shotType) {
	if (shotType === "detail") {
		return [
			{ zh: "材质质感", en: "material texture" },
			{ zh: "结构设计", en: "structural design" },
			{ zh: "尺寸规格", en: "dimensions and specifications" },
			{ zh: "工艺细节", en: "craftsmanship details" },
			{ zh: "功能说明", en: "functional explanation" },
			{ zh: "使用方式", en: "usage guidance" },
			{ zh: "局部特写", en: "close-up detail" },
			{ zh: "场景适配", en: "scenario fit" },
			{ zh: "安装或收纳方式", en: "installation or storage method" },
			{ zh: "品质可靠性", en: "quality and reliability" },
		]
	}
	if (shotType === "selling") {
		return [
			{ zh: "功能亮点", en: "functional highlight" },
			{ zh: "用户利益", en: "customer benefit" },
			{ zh: "对比优势", en: "comparison advantage" },
			{ zh: "结构优势", en: "structural advantage" },
			{ zh: "使用价值", en: "usage value" },
			{ zh: "材质或工艺卖点", en: "material or craftsmanship selling point" },
			{ zh: "场景痛点解决", en: "scenario pain-point solution" },
			{ zh: "便捷性或效率", en: "convenience or efficiency" },
			{ zh: "品质信任感", en: "quality trust" },
			{ zh: "目标人群适配", en: "target audience fit" },
		]
	}
	if (shotType === "hero" || shotType === "main") {
		return [
			{ zh: "商品标准主视觉", en: "standard product hero visual" },
			{ zh: "模特或使用场景主视觉", en: "model or usage-scene hero visual" },
			{ zh: "品牌氛围主视觉", en: "brand mood hero visual" },
			{ zh: "活动入口视觉", en: "campaign entry visual" },
			{ zh: "商品角度变化", en: "product angle variation" },
			{ zh: "局部质感辅助主视觉", en: "texture-led supporting hero visual" },
			{ zh: "平台列表图视觉", en: "platform listing visual" },
			{ zh: "简洁留白主视觉", en: "minimal copy-space hero visual" },
			{ zh: "场景氛围变化", en: "scenario mood variation" },
			{ zh: "核心人群表达", en: "core audience expression" },
		]
	}
	return [
		{ zh: "商品主体", en: "product subject" },
		{ zh: "场景氛围", en: "scene mood" },
		{ zh: "卖点表达", en: "selling-point expression" },
		{ zh: "细节说明", en: "detail explanation" },
		{ zh: "构图变化", en: "composition variation" },
		{ zh: "文案信息", en: "copy information" },
		{ zh: "目标人群", en: "target audience" },
		{ zh: "使用方式", en: "usage method" },
		{ zh: "品牌调性", en: "brand tone" },
		{ zh: "平台适配", en: "platform fit" },
	]
}

function buildSmartShotFocusInstruction(shotPlanItem, locale) {
	const shotTypeTotal = shotPlanItem?.shotTypeTotal ?? 1
	const shotType = shotPlanItem?.shotType
	if (shotTypeTotal <= 1 && shotType !== "detail" && shotType !== "selling") return ""
	const isChinese = MagicPromptLocale.isChinese(locale)
	const focusOptions = getShotFocusOptions(shotType)
	const focus = MagicPromptLocale.pickText(
		focusOptions[(Math.max(shotPlanItem?.shotTypeIndex ?? 1, 1) - 1) % focusOptions.length],
		locale,
	)
	const isSingleTypeShot = shotTypeTotal <= 1

	if (isChinese) {
		if (isSingleTypeShot) {
			return (
				`这是当前图片类型的唯一一张。` +
				`本张默认主题槽位：${focus}；如果额外描述另有明确详情或卖点主题，以额外描述为准。` +
				"请把画面做成单图单主题的信息说明图，不要做成居中商品展示、整体氛围海报或主图版式。" +
				"如果商品信息偏向主图描述，请只把它作为商品外观参考，不要沿用其中的主图构图和背景表达。"
			)
		}
		return (
			`这是当前图片类型中的第 ${shotPlanItem.shotTypeIndex}/${shotTypeTotal} 张。` +
			`本张的主题槽位：${focus}。` +
			"请围绕这个主题槽位生成单图单主题内容，并与同类型的其它图片保持主题不重复。" +
			"如果额外描述已经指定了具体主题，则保持该主题，但从不同证据、场景、角度或版式重点切入，不要只是生成近似变体。"
		)
	}

	if (isSingleTypeShot) {
		return (
			"This is the only image for the current image type. " +
			`Default theme slot for this image: ${focus}; if the extra prompt specifies a concrete detail or selling-point topic, follow the extra prompt instead. ` +
			"Create a single-topic informational image, not a centered product showcase, atmospheric poster, or hero-image layout. " +
			"If the product information reads like a hero-image description, use it only as product appearance reference and do not follow its hero composition or background direction. "
		)
	}

	return (
		`This is image ${shotPlanItem.shotTypeIndex}/${shotTypeTotal} within the current image type. ` +
		`Theme slot for this image: ${focus}. ` +
		"Create a single-topic image around this theme slot, and keep it distinct from the other images of the same type. " +
		"If the extra prompt already specifies a concrete topic, keep that topic but use a different proof point, scenario, angle, or layout emphasis instead of producing a near-duplicate variation. "
	)
}

function buildSmartModePrompt({ state, shotPlanItem, locale, t }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const productReferences = MagicPromptLocale.joinReferenceLabels(
		state.productImages.length,
		locale,
	)
	const shotDefinition = getSmartShotDefinition(shotPlanItem?.shotType)
	const imageType = MagicPromptLocale.pickText(shotDefinition.promptLabel, locale)
	const generationMode =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === state.generationMode) ??
		GENERATION_MODE_DEFINITIONS[0]
	const generationSuffix = MagicPromptLocale.pickText(generationMode.promptSuffix, locale)
	const businessText = buildBusinessSettingPrompt(state.moreSettings, locale, t)
	const extraPrompt = state.smartExtraPrompt?.trim()
	const extraProductInfo = state.productInfo.trim()
	const shotInstruction = MagicPromptLocale.pickText(shotDefinition.promptInstruction, locale)
	const shotFocusInstruction = buildSmartShotFocusInstruction(shotPlanItem, locale)
	const shotIndex = shotPlanItem?.shotIndex ?? 1
	const shotTotal = shotPlanItem?.shotTotal ?? getSmartShotCount(state)

	if (isChinese) {
		return (
			`使用${productReferences}中的全部商品图，生成套图中的第 ${shotIndex}/${shotTotal} 张图片。` +
			(extraProductInfo ? `商品信息如下：${extraProductInfo}。` : "") +
			`当前图片类型：${imageType}。` +
			shotInstruction +
			shotFocusInstruction +
			(state.smartCopyEnabled
				? "请自动生成适合营销传播与平台展示的文案元素。"
				: "不要自动添加营销文案，除非额外描述中明确要求。") +
			businessText +
			(extraPrompt ? `额外要求：${extraPrompt}。` : "") +
			"如果额外描述中包含与当前图片数量或类型冲突的要求，以当前图片任务为准。" +
			"保证商品主体、材质、颜色、轮廓与关键卖点准确，同时让整组套图在视觉风格上保持统一。" +
			generationSuffix
		)
	}

	return (
		`Use all product references from ${productReferences} to generate image ${shotIndex}/${shotTotal} in the planned image set. ` +
		(extraProductInfo ? `Product information: ${extraProductInfo}. ` : "") +
		`Current image type: ${imageType}. ` +
		`${shotInstruction} ` +
		shotFocusInstruction +
		(state.smartCopyEnabled
			? "Generate suitable marketing copy elements when helpful for the target platforms. "
			: "Do not add marketing copy unless explicitly requested in the extra prompt. ") +
		businessText +
		(extraPrompt ? `Additional instructions: ${extraPrompt}. ` : "") +
		"If the extra prompt conflicts with the current image type or quantity, follow the current single-image task. " +
		"Keep the product shape, materials, colors, silhouette, and key selling points accurate while maintaining a cohesive visual language across the full image set. " +
		generationSuffix
	)
}

function buildCustomReferenceConstraintPrompt(styleItem, locale) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const hasFaceRefs = Boolean(styleItem.faceRefs?.length)
	const hasOtherRefs = Boolean(styleItem.otherRefs?.length)

	if (!hasFaceRefs && !hasOtherRefs) {
		return isChinese
			? "参考图仅作为风格或人物辅助信息，不应改变商品本身的关键外观。"
			: "Reference images should only help with style or supporting context and must not alter the key product appearance. "
	}

	if (isChinese) {
		const parts = []
		if (hasFaceRefs) {
			parts.push("人脸/模特参考图仅用于约束人物身份、脸部特征、发型妆容、肤感与出镜气质")
		}
		if (hasOtherRefs) {
			parts.push("其它参考图仅用于补充姿态、构图、景别、场景氛围、灯光、道具或版式方向")
		}
		return (
			parts.join("，") +
			"；除非样式描述明确要求，不要照搬参考图中的其它商品、服饰或主体元素，也不要让这些参考图覆盖商品图定义的商品外观。"
		)
	}

	const parts = []
	if (hasFaceRefs) {
		parts.push(
			"Face or model references should only constrain identity, facial features, hairstyle, makeup, skin feel, and on-camera presence",
		)
	}
	if (hasOtherRefs) {
		parts.push(
			"Other references should only guide pose, composition, shot distance, scene mood, lighting, props, or layout direction",
		)
	}
	return (
		`${parts.join(", ")}. ` +
		"Unless the style description explicitly asks for it, do not copy unrelated products, outfits, or dominant subjects from those references, and do not let them override the product appearance defined by the product references. "
	)
}

function buildCustomStyleTypeInstruction(styleItem, locale, t) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const styleTypeLabel = getLabelByValue(CUSTOM_STYLE_TYPE_OPTIONS, styleItem.styleType, t)

	if (isChinese) {
		if (styleItem.styleType === "detail") {
			return (
				`当前图片类型：${styleTypeLabel}。` +
				"这张图只讲一个详情主题。若样式描述已指定主题，以该主题为准；否则从材质、结构、尺寸、工艺、功能说明、使用方式、局部特写或场景说明中选择一个最适合商品的信息点。" +
				"可以围绕这个主题做少量分区、局部放大、标注或图文说明，但不要把多个详情主题、多个参数和多个场景堆在同一张图里，也不要做成单一主图海报。"
			)
		}
		if (styleItem.styleType === "selling") {
			return (
				`当前图片类型：${styleTypeLabel}。` +
				"这张图只表达一个核心卖点。若样式描述已指定卖点，以该卖点为准；否则从功能亮点、利益点、对比关系、结构优势或使用价值中选择一个最有营销价值的点。" +
				"可以使用局部放大、标注、图文组合、对比区域或小范围信息模块，但所有内容都必须服务同一个卖点，不要在一张图里堆叠多个卖点，也不要做成单纯主视觉海报。"
			)
		}
		if (styleItem.styleType === "main") {
			return (
				`当前图片类型：${styleTypeLabel}。` +
				"以商品主体、模特展示或核心场景为主视觉，构图简洁、主体突出，适合商品首图、列表图、活动入口或营销首屏。" +
				"允许少量辅助文案、局部细节或功能提示，但不要做成信息密集的卖点图或多分区详情页。"
			)
		}
		return (
			`当前图片类型：${styleTypeLabel}。` +
			"按照样式描述确定画面用途，但仍需保持商品主体清晰、版式目标明确，避免同时混合主图、卖点图和详情页图的表达方式。"
		)
	}

	if (styleItem.styleType === "detail") {
		return (
			`Current image type: ${styleTypeLabel}. ` +
			"This image should explain only one detail topic. If the style description specifies a topic, follow it; otherwise choose one suitable information point from material, structure, dimensions, craftsmanship, functional explanation, usage guidance, close-up detail, or scenario note. " +
			"Small sections, close-ups, labels, or image-and-text explanations are allowed when they support that topic, but do not pack multiple detail topics, specifications, and scenarios into one image, and do not make it a simple hero poster. "
		)
	}
	if (styleItem.styleType === "selling") {
		return (
			`Current image type: ${styleTypeLabel}. ` +
			"This image should communicate only one core selling point. If the style description specifies a benefit, follow it; otherwise choose one strongest marketing point from a functional highlight, customer benefit, comparison, structural advantage, or usage value. " +
			"Close-up callouts, labels, image-and-text composition, comparison zones, or small information modules are allowed, but every element must support the same selling point. Do not stack multiple benefits in one image, and do not make it a pure hero poster. "
		)
	}
	if (styleItem.styleType === "main") {
		return (
			`Current image type: ${styleTypeLabel}. ` +
			"Create a clear hero or support image led by the product, model presentation, or core usage scene. Keep the composition focused and suitable for a listing image, first product image, campaign entry, or marketing opening visual. " +
			"Small supporting copy, detail highlights, or feature cues are allowed, but do not turn it into an information-heavy selling-point image or a multi-section detail page. "
		)
	}
	return (
		`Current image type: ${styleTypeLabel}. ` +
		"Use the style description to determine the image purpose while keeping the product clear and the layout goal specific. Avoid mixing hero, selling-point, and detail-page expressions in the same image. "
	)
}

function getCustomStyleFocusOptions(styleItem) {
	return getShotFocusOptions(styleItem.styleType)
}

function buildCustomStyleShotInstruction({ styleItem, shotIndex, shotTotal, locale }) {
	if (styleItem.kind !== "custom-style") return ""
	if (!shotTotal || shotTotal <= 1) return ""
	const isChinese = MagicPromptLocale.isChinese(locale)
	const focusOptions = getCustomStyleFocusOptions(styleItem)
	const focus = MagicPromptLocale.pickText(
		focusOptions[(Math.max(shotIndex, 1) - 1) % focusOptions.length],
		locale,
	)

	if (isChinese) {
		return (
			`这是该样式卡的第 ${shotIndex}/${shotTotal} 张。` +
			`本张的主题槽位：${focus}。` +
			"请围绕这个主题槽位生成单图单主题内容，并与同一样式卡里的其它图片保持主题不重复。" +
			"如果样式描述已经指定了一个很具体的主题，则保持该主题，但从不同证据、场景、角度或版式重点切入，不要只是生成同一主题的近似变体。"
		)
	}

	return (
		`This is image ${shotIndex}/${shotTotal} for this style card. ` +
		`Theme slot for this image: ${focus}. ` +
		"Create a single-topic image around this theme slot, and keep it distinct from the other images in the same style card. " +
		"If the style description already specifies one very specific topic, keep that topic but use a different proof point, scenario, angle, or layout emphasis instead of producing a near-duplicate variation. "
	)
}

function buildCustomStylePrompt({ state, styleItem, locale, t, shotIndex = 1, shotTotal = 1 }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const baseReferenceCount = state.productImages.length
	const productReferences = MagicPromptLocale.joinReferenceLabels(baseReferenceCount, locale)
	const styleRefs = getStyleItemReferenceImages(styleItem)
	const styleReferenceLabels = styleRefs.length
		? MagicPromptLocale.joinReferenceLabels(styleRefs.length, locale)
		: ""
	const generationMode =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === state.generationMode) ??
		GENERATION_MODE_DEFINITIONS[0]
	const generationSuffix = MagicPromptLocale.pickText(generationMode.promptSuffix, locale)
	const businessText = buildBusinessSettingPrompt(state.moreSettings, locale, t)
	const extraProductInfo = state.productInfo.trim()
	const customReferenceConstraint = buildCustomReferenceConstraintPrompt(styleItem, locale)
	const customStyleTypeInstruction = buildCustomStyleTypeInstruction(styleItem, locale, t)
	const customStyleShotInstruction = buildCustomStyleShotInstruction({
		styleItem,
		shotIndex,
		shotTotal,
		locale,
	})

	if (isChinese) {
		if (styleItem.kind === "uploaded-style") {
			return (
				`使用${productReferences}中的商品图生成商品营销图，并参考上传样式图完成版式与视觉风格迁移。` +
				customStyleShotInstruction +
				(extraProductInfo ? `商品信息如下：${extraProductInfo}。` : "") +
				`样式参考图：${styleReferenceLabels}。` +
				(styleItem.notes ? `样式说明：${styleItem.notes}。` : "") +
				businessText +
				"保留商品主体准确性，同时尽量匹配参考样式中的构图、文字留白、信息层次和营销气质。" +
				generationSuffix
			)
		}

		return (
			`使用${productReferences}中的商品图，生成一张商品营销图。` +
			customStyleTypeInstruction +
			customStyleShotInstruction +
			(extraProductInfo ? `商品信息如下：${extraProductInfo}。` : "") +
			(styleItem.typeDescription ? `样式描述：${styleItem.typeDescription}。` : "") +
			(styleItem.subjectConsistency
				? "保持主体商品在整组图中的视觉一致性。"
				: "允许根据样式需求做更灵活的主体呈现。") +
			(styleItem.smartCopy ? "允许自动生成适合版式的营销文案。" : "不要自动生成营销文案。") +
			businessText +
			customReferenceConstraint +
			generationSuffix
		)
	}

	if (styleItem.kind === "uploaded-style") {
		return (
			`Use the product references from ${productReferences} to generate a marketing image that follows the uploaded style reference. ` +
			customStyleShotInstruction +
			(extraProductInfo ? `Product information: ${extraProductInfo}. ` : "") +
			`Style reference images: ${styleReferenceLabels}. ` +
			(styleItem.notes ? `Style notes: ${styleItem.notes}. ` : "") +
			businessText +
			"Preserve product accuracy while matching the layout rhythm, whitespace, typography placement, and overall marketing tone of the style reference. " +
			generationSuffix
		)
	}

	return (
		`Use the product references from ${productReferences} to generate a product marketing image. ` +
		customStyleTypeInstruction +
		customStyleShotInstruction +
		(extraProductInfo ? `Product information: ${extraProductInfo}. ` : "") +
		(styleItem.typeDescription ? `Style description: ${styleItem.typeDescription}. ` : "") +
		(styleItem.subjectConsistency
			? "Keep the subject presentation consistent with the rest of the image set. "
			: "Allow more flexible subject presentation when needed for the style. ") +
		(styleItem.smartCopy
			? "Marketing copy can be generated when it helps the design. "
			: "Do not add marketing copy automatically. ") +
		businessText +
		customReferenceConstraint +
		generationSuffix
	)
}

function buildSmartModeRequest({
	state,
	shotPlanItem,
	helpers,
	locale,
	width,
	height,
	t,
	select = false,
}) {
	return {
		model_id: state.modelId,
		prompt: buildSmartModePrompt({
			state,
			shotPlanItem,
			locale,
			t,
		}),
		reference_images: helpers.collectReferenceIds(state.productImages),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: 1,
		select,
	}
}

function buildCustomStyleRequest({
	state,
	styleItem,
	helpers,
	locale,
	width,
	height,
	t,
	resolution,
	shotIndex,
	shotTotal,
	count = 1,
	select = false,
}) {
	return {
		model_id: state.modelId,
		prompt: buildCustomStylePrompt({
			state,
			styleItem,
			locale,
			t,
			shotIndex,
			shotTotal,
		}),
		reference_images: helpers.collectReferenceIds([
			...state.productImages,
			...getStyleItemReferenceImages(styleItem),
		]),
		size: `${width}x${height}`,
		resolution: resolution || state.scale || undefined,
		width,
		height,
		count,
		select,
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
		const promptLocale = MagicPromptLocale.resolveLocale(ctx)
		const creationModes = CREATION_MODE_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))
		const generationModes = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		let panelEl = null
		let setPluginState = null
		let moreSettingsDrawer = null
		let styleEditor = null

		const getPanelEl = () => panelEl || root

		const pickImageFiles = async (options) => {
			if (ctx.assets?.pickFiles) {
				return ctx.assets.pickFiles({ ...options, type: "image" })
			}
			throw new Error("ctx.assets.pickFiles is not connected yet.")
		}

		const getMoreSettingsDrawer = () => {
			if (!moreSettingsDrawer) {
				moreSettingsDrawer = MoreSettingsUI.createDrawer(getPanelEl(), t, (value) => {
					setPluginState?.({ moreSettings: value })
				})
			}
			return moreSettingsDrawer
		}

		const getStyleEditor = () => {
			if (!styleEditor) {
				styleEditor = StyleEditorUI.createEditor(getPanelEl(), t, {
					pickImageFiles,
					helpers: {
						getImageUrl(image) {
							return image?.url ?? image?.src ?? image?.previewUrl ?? ""
						},
					},
					getRatioOptions: () => {
						const sizes = setPluginState
							? (currentHelpers?.getVisibleSizes(currentStateRef) ?? [])
							: []
						if (sizes.length) {
							return sizes.map((item) => ({ label: item.label, value: item.value }))
						}
						return [
							{ label: "1:1", value: "1:1" },
							{ label: "3:4", value: "3:4" },
							{ label: "4:5", value: "4:5" },
							{ label: "9:16", value: "9:16" },
						]
					},
					onSave: (draftStyle) => {
						const nextStyle =
							draftStyle.kind === "custom-style"
								? {
										...draftStyle,
										name:
											draftStyle.name?.trim() ||
											t("style.custom.defaultName", "自定义样式"),
									}
								: {
										...draftStyle,
										label:
											draftStyle.label?.trim() ||
											t("style.uploaded.defaultName", "上传样式"),
									}
						setPluginState?.({
							styleItems: currentStateRef.styleItems.some(
								(item) => item.id === nextStyle.id,
							)
								? currentStateRef.styleItems.map((item) =>
										item.id === nextStyle.id ? nextStyle : item,
									)
								: [...currentStateRef.styleItems, nextStyle],
						})
					},
				})
			}
			return styleEditor
		}

		let currentHelpers = null
		let currentStateRef = null

		const view = ctx.panel.render(root, {
			panelClassName: "product-image-set",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: t("section.productImages", "商品图"),
					required: true,
					alt: t("section.productImages", "商品图"),
					addLabel: "+",
					help: t(
						"section.productImages.help",
						"支持上传多张商品图，建议包含正面、侧面、细节与材质信息。",
					),
					maxCount: MAX_PRODUCT_IMAGES,
				},
				{
					id: "productInfo",
					kind: "textarea",
					stateKey: "productInfo",
					title: t("section.productInfo", "商品信息"),
					deps: ["productImages"],
					placeholder: t(
						"section.productInfo.placeholder",
						"请输入商品卖点、材质、规格、目标人群等信息",
					),
					rows: 4,
					maxLength: 2000,
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.productImages.length,
						completeImagePrompt: {
							referenceImages: ({ state }) => state.productImages,
							referencesMessage: t("empty.productImages", "请先上传至少 1 张商品图"),
							userPrompt: ({ state }) =>
								buildProductInfoCompletionUserPrompt({
									currentText: state.productInfo,
									imageCount: state.productImages.length,
								}),
						},
					},
				},
				{
					id: "moreSettings",
					kind: "custom",
					deps: ["moreSettings"],
					render: ({ state, setState, elements }) => {
						panelEl = elements.panel || panelEl || root
						setPluginState = setState
						return MoreSettingsUI.createSection({
							state,
							t,
							getDrawer: getMoreSettingsDrawer,
						})
					},
				},
				{
					id: "creationMode",
					kind: "tabs",
					stateKey: "creationMode",
					required: true,
					title: t("section.creationMode", "创作模式"),
					options: creationModes,
				},
				{
					id: "smartComposition",
					kind: "custom",
					stateKey: "smartComposition",
					deps: ["creationMode", "smartComposition"],
					when: ({ state }) => state.creationMode === "smart",
					render: ({ state, setState }) =>
						createSmartCompositionSection({ state, setState, t }),
				},
				{
					id: "smartCopyEnabled",
					kind: "toggle",
					stateKey: "smartCopyEnabled",
					title: t("smart.section.smartCopy", "智能文案"),
					deps: ["creationMode"],
					when: ({ state }) => state.creationMode === "smart",
				},
				{
					id: "smartExtraPrompt",
					kind: "textarea",
					stateKey: "smartExtraPrompt",
					title: t("smart.section.extraPrompt", "额外描述"),
					deps: ["creationMode", "productImages", "smartComposition", "moreSettings"],
					placeholder: t(
						"smart.extraPrompt.placeholder",
						"您可以在此处输入其它需求，例如：生成的套图中需要有3张模特图、1张卖点图，模特图要拼贴式的lookbook风格，模特图不要带文案",
					),
					rows: 4,
					maxLength: 2000,
					when: ({ state }) => state.creationMode === "smart",
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.productImages.length,
						completeImagePrompt: {
							referenceImages: ({ state }) => state.productImages,
							referencesMessage: t("empty.productImages", "请先上传至少 1 张商品图"),
							userPrompt: ({ state }) =>
								buildSmartExtraPromptCompletionUserPrompt({
									state,
									currentText: state.smartExtraPrompt,
									t,
								}),
						},
					},
				},
				{
					id: "creationConfig",
					kind: "custom",
					stateKey: "styleItems",
					deps: ["creationMode", "styleItems", "ratioKey", "scale"],
					when: ({ state }) => state.creationMode === "custom",
					render: ({ state, setState, helpers, elements }) => {
						currentHelpers = helpers
						currentStateRef = state
						setPluginState = setState
						panelEl = elements.panel || panelEl || root
						return StyleEditorUI.createConfigSection({
							state,
							setState,
							t,
							helpers,
							pickImageFiles,
							getStyleEditor,
						})
					},
				},
				{
					id: "generationMode",
					kind: "option-group",
					stateKey: "generationMode",
					title: t("section.generationMode", "生成模式"),
					showDescriptionOnHover: true,
					options: generationModes,
				},
				{
					id: "modelSelect",
					kind: "model-select",
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "canvasSize",
					kind: "size-control",
					title: t("section.canvasSize", "宽高比"),
					deps: ["modelId", "modelOptions", "creationMode"],
					when: ({ state }) => state.creationMode === "smart",
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "尺寸倍数"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "count",
					kind: "custom",
					deps: ["creationMode", "smartComposition"],
					when: ({ state }) => state.creationMode === "smart",
					render: ({ state }) => createSmartCountReadonlySection({ state, t }),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成商品套图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImages.length) {
						return t("empty.productImages", "请先上传至少 1 张商品图")
					}
					if (state.creationMode === "smart" && !getSmartShotCount(state)) {
						return t("empty.smartComposition", "请至少配置 1 张套图")
					}
					if (
						state.creationMode === "smart" &&
						getSmartShotCount(state) > MAX_SMART_SHOTS
					) {
						return t(
							"error.smartCompositionLimit",
							`智能套图最多支持 ${MAX_SMART_SHOTS} 张`,
						)
					}
					if (state.creationMode === "custom" && !state.styleItems.length) {
						return t("empty.styleItems", "请先添加样式卡片")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.productImages.length ||
					(state.creationMode === "smart" &&
						(!getSmartShotCount(state) ||
							getSmartShotCount(state) > MAX_SMART_SHOTS)) ||
					(state.creationMode === "custom" && !state.styleItems.length),
				validate: ({ state, helpers }) => {
					if (
						helpers.collectReferenceIds(state.productImages).length !==
						state.productImages.length
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (state.creationMode === "smart") {
						const selectedSize = helpers.getSelectedSize(state)
						if (!selectedSize?.genW || !selectedSize?.genH) {
							return t("error.noSize", "当前模型缺少可用尺寸配置")
						}
						if (!getSmartShotCount(state)) {
							return t("empty.smartComposition", "请至少配置 1 张套图")
						}
						if (getSmartShotCount(state) > MAX_SMART_SHOTS) {
							return t(
								"error.smartCompositionLimit",
								`智能套图最多支持 ${MAX_SMART_SHOTS} 张`,
							)
						}
						if (state.productImages.length > getMaxReferenceImages(state, helpers)) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					}
					if (!state.styleItems.length) {
						return t("empty.styleItems", "请先添加样式卡片")
					}
					for (const styleItem of state.styleItems) {
						const resolvedSize = resolveCustomStyleSize(state, styleItem, helpers)
						if (!resolvedSize?.genW || !resolvedSize?.genH) {
							return t("error.noSize", "当前模型缺少可用尺寸配置")
						}
						const refs = getStyleItemReferenceImages(styleItem)
						if (helpers.collectReferenceIds(refs).length !== refs.length) {
							return t("error.styleReferences", "样式卡片中存在缺少资源标识的参考图")
						}
						if (
							state.productImages.length + refs.length >
							getMaxReferenceImages(state, helpers)
						) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					if (state.creationMode === "smart") {
						const selectedSize = helpers.getSelectedSize(state)
						const width = selectedSize.genW
						const height = selectedSize.genH
						const results = []
						const shotPlan = buildSmartShotPlan(state)
						for (let index = 0; index < shotPlan.length; index += 1) {
							const shotPlanItem = shotPlan[index]
							results.push(
								await generateAndPlace(
									buildSmartModeRequest({
										state,
										shotPlanItem,
										helpers,
										locale: promptLocale,
										width,
										height,
										t,
										select: index === shotPlan.length - 1,
									}),
								),
							)
						}
						return results
					}
					const results = []
					let lastGeneratableStyleIndex = -1
					state.styleItems.forEach((styleItem, index) => {
						if (Math.max(0, Number(styleItem.count) || 0) > 0) {
							lastGeneratableStyleIndex = index
						}
					})
					for (
						let styleIndex = 0;
						styleIndex < state.styleItems.length;
						styleIndex += 1
					) {
						const styleItem = state.styleItems[styleIndex]
						const resolvedSize = resolveCustomStyleSize(state, styleItem, helpers)
						if (!resolvedSize?.genW || !resolvedSize?.genH) {
							throw new Error(t("error.noSize", "当前模型缺少可用尺寸配置"))
						}
						const shotTotal = Math.max(0, Number(styleItem.count) || 0)
						if (!shotTotal) continue
						const shouldSelectStyle = styleIndex === lastGeneratableStyleIndex
						if (styleItem.kind === "uploaded-style") {
							results.push(
								await generateAndPlace(
									buildCustomStyleRequest({
										state,
										styleItem,
										helpers,
										locale: promptLocale,
										width: resolvedSize.genW,
										height: resolvedSize.genH,
										t,
										resolution: resolvedSize.scale,
										count: shotTotal,
										select: shouldSelectStyle,
									}),
								),
							)
							continue
						}
						for (let shotIndex = 1; shotIndex <= shotTotal; shotIndex += 1) {
							results.push(
								await generateAndPlace(
									buildCustomStyleRequest({
										state,
										styleItem,
										helpers,
										locale: promptLocale,
										width: resolvedSize.genW,
										height: resolvedSize.genH,
										t,
										resolution: resolvedSize.scale,
										shotIndex,
										shotTotal,
										select: shouldSelectStyle && shotIndex === shotTotal,
									}),
								),
							)
						}
					}
					return results
				},
			},
		})

		return {
			update(change) {
				return view?.update?.(change)
			},
			activate(nextScope) {
				return view?.activate?.(nextScope)
			},
			deactivate(nextScope) {
				return view?.deactivate?.(nextScope)
			},
			dispose(reason) {
				moreSettingsDrawer?.destroy()
				moreSettingsDrawer = null
				styleEditor?.destroy()
				styleEditor = null
				setPluginState = null
				currentHelpers = null
				currentStateRef = null
				view?.dispose?.(reason)
			},
		}
	},
})
