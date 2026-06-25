/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const VIEW_MODE = {
	FRONT: "front",
	BACK: "back",
	SIDE: "side",
	THREE_QUARTER: "threeQuarter",
	TOP: "top",
	LOW_ANGLE: "lowAngle",
	DETAIL: "detail",
	MULTIVIEW: "multiview",
	CUSTOM: "custom",
}

const COMPLETION_MODE = {
	CONSERVATIVE: "conservative",
	REASONABLE: "reasonable",
	ENHANCED: "enhanced",
	CLEAN: "clean",
}

const OUTPUT_STYLE = {
	ECOMMERCE_WHITE: "ecommerceWhite",
	GRAY_STUDIO: "grayStudio",
	TRANSPARENT: "transparent",
	PREMIUM_STUDIO: "premiumStudio",
	TOP_DOWN: "topDown",
}

const VIEW_MODE_OPTIONS = [
	{
		value: VIEW_MODE.FRONT,
		labelKey: "view.front",
		labelFallback: "正面",
		promptText: {
			zh: "正面视角，商品主体完整面向镜头，轮廓端正清晰",
			en: "front view, the full product faces the camera with a straight, clear silhouette",
		},
	},
	{
		value: VIEW_MODE.BACK,
		labelKey: "view.back",
		labelFallback: "背面",
		promptText: {
			zh: "背面视角，展示商品背部、背标、后片、后袋、接口或背部结构",
			en:
				"back view, showing the product rear, back label area, rear panels, back pockets, ports, or rear structure",
		},
	},
	{
		value: VIEW_MODE.SIDE,
		labelKey: "view.side",
		labelFallback: "侧面",
		promptText: {
			zh: "侧面视角，展示商品厚度、侧边轮廓、侧袋、接口、鞋底侧墙或侧面结构",
			en:
				"side view, showing product thickness, side silhouette, side pockets, ports, sole sidewall, or side construction",
		},
	},
	{
		value: VIEW_MODE.THREE_QUARTER,
		labelKey: "view.threeQuarter",
		labelFallback: "45度斜侧",
		promptText: {
			zh: "45 度斜侧视角，同时展示正面和侧面，具有自然商品棚拍透视",
			en:
				"45-degree three-quarter view, showing both front and side with natural product photography perspective",
		},
	},
	{
		value: VIEW_MODE.TOP,
		labelKey: "view.top",
		labelFallback: "俯视",
		promptText: {
			zh: "俯视视角，从上方观察商品，展示顶部结构、开口、平铺形态或包装顶面",
			en:
				"top view from above, showing the product top structure, opening, flat-lay form, or package top",
		},
	},
	{
		value: VIEW_MODE.LOW_ANGLE,
		labelKey: "view.lowAngle",
		labelFallback: "低机位",
		promptText: {
			zh: "低机位视角，从略低角度拍摄，展示商品体积感、底部边缘或立体高度",
			en:
				"low-angle view, photographed from a slightly lower camera angle to show volume, bottom edge, or height",
		},
	},
	{
		value: VIEW_MODE.DETAIL,
		labelKey: "view.detail",
		labelFallback: "局部特写",
		promptText: {
			zh: "局部特写视角，放大展示商品关键结构、材质纹理、五金、接口、鞋底、背标或工艺细节",
			en:
				"detail close-up view, enlarging key construction, material texture, hardware, ports, sole, back label area, or craftsmanship details",
		},
	},
	{
		value: VIEW_MODE.MULTIVIEW,
		labelKey: "view.multiview",
		labelFallback: "多视角套图",
		promptText: {
			zh: "多视角套图，在同一张图中清晰排列同一商品的正面、背面、侧面和 45 度斜侧视角，各视角必须是同一个商品",
			en:
				"multi-view set arranged in one image, clearly showing the same product from front, back, side, and 45-degree views; every view must be the same product",
		},
	},
	{
		value: VIEW_MODE.CUSTOM,
		labelKey: "view.custom",
		labelFallback: "自定义",
		promptText: {
			zh: "用户自定义视角",
			en: "user-defined target view",
		},
	},
]

const COMPLETION_MODE_OPTIONS = [
	{
		value: COMPLETION_MODE.CONSERVATIVE,
		labelKey: "completion.conservative",
		labelFallback: "保守还原",
		promptText: {
			zh: "保守还原不可见区域，只做必要且简洁的延续，不主动增加复杂设计点",
			en:
				"conservatively restore hidden areas with only necessary, simple continuation; do not proactively add complex new design details",
		},
	},
	{
		value: COMPLETION_MODE.REASONABLE,
		labelKey: "completion.reasonable",
		labelFallback: "合理补全",
		promptText: {
			zh: "根据原商品的结构、材质、比例和设计语言合理补全背面、侧面、顶部或底部",
			en:
				"reasonably complete the back, side, top, or bottom based on the original product structure, material, proportions, and design language",
		},
	},
	{
		value: COMPLETION_MODE.ENHANCED,
		labelKey: "completion.enhanced",
		labelFallback: "强化结构",
		promptText: {
			zh: "强化结构可读性，适度表现背标区域、接口、瓶盖、包带、鞋底、服装后片、缝线或功能部件，但必须符合原商品逻辑",
			en:
				"emphasize structural readability, moderately showing back-label areas, ports, caps, straps, soles, rear garment panels, stitching, or functional parts while staying consistent with the original product",
		},
	},
	{
		value: COMPLETION_MODE.CLEAN,
		labelKey: "completion.clean",
		labelFallback: "保持纯净",
		promptText: {
			zh: "优先生成干净可售卖的商品图，不强调复杂补全，避免新增不确定文字和装饰",
			en:
				"prioritize a clean sellable product image without complex completion; avoid adding uncertain text or decoration",
		},
	},
]

const OUTPUT_STYLE_OPTIONS = [
	{
		value: OUTPUT_STYLE.ECOMMERCE_WHITE,
		labelKey: "output.ecommerceWhite",
		labelFallback: "电商白底",
		promptText: {
			zh: "电商白底商品图，纯白背景，商品边缘干净，柔和自然阴影",
			en: "e-commerce white-background product image, pure white background, clean edges, soft natural shadow",
		},
	},
	{
		value: OUTPUT_STYLE.GRAY_STUDIO,
		labelKey: "output.grayStudio",
		labelFallback: "浅灰棚拍",
		promptText: {
			zh: "浅灰棚拍商品图，干净背景，柔和摄影棚布光，真实接触阴影",
			en: "light gray studio product image, clean background, soft studio lighting, realistic contact shadow",
		},
	},
	{
		value: OUTPUT_STYLE.TRANSPARENT,
		labelKey: "output.transparent",
		labelFallback: "透明底抠图",
		promptText: {
			zh: "透明底抠图效果，商品边缘清晰干净；如模型不支持透明通道则使用纯白背景",
			en:
				"transparent cutout effect with crisp clean product edges; if alpha transparency is unavailable, use a pure white background",
		},
	},
	{
		value: OUTPUT_STYLE.PREMIUM_STUDIO,
		labelKey: "output.premiumStudio",
		labelFallback: "质感棚拍",
		promptText: {
			zh: "质感棚拍商品图，精致布光，高级材质表现，背景简洁但有自然空间感",
			en:
				"premium studio product image with refined lighting, elevated material rendering, and a simple background with natural depth",
		},
	},
	{
		value: OUTPUT_STYLE.TOP_DOWN,
		labelKey: "output.topDown",
		labelFallback: "平铺俯拍",
		promptText: {
			zh: "平铺俯拍商品图，商品自然摆放，从上方或接近上方拍摄，适合服饰、配饰、小物件或包装",
			en:
				"flat overhead product image, naturally arranged and photographed from above or near above, suitable for apparel, accessories, small goods, or packaging",
		},
	},
]

function createInitialState() {
	return {
		productImage: null,
		subjectDescription: "",
		viewModes: [VIEW_MODE.THREE_QUARTER],
		customView: "",
		completionMode: COMPLETION_MODE.REASONABLE,
		outputStyle: OUTPUT_STYLE.ECOMMERCE_WHITE,
		extra: "",
		genCount: 1,
	}
}

function getSelectedOption(options, value) {
	return options.find((item) => item.value === value) ?? options[0]
}

function mapOptions(options, t) {
	return options.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
	}))
}

function pickPromptText(option, locale) {
	return MagicPromptLocale.pickText(option.promptText, locale)
}

function buildOptionalClause({ value, zhPrefix, enPrefix, locale }) {
	const normalizedText = String(value ?? "").trim()
	if (!normalizedText) return ""
	return MagicPromptLocale.isChinese(locale)
		? `${zhPrefix}${normalizedText}。`
		: `${enPrefix}${normalizedText}. `
}

function buildTargetViewText({ state, viewMode, locale }) {
	const selectedView = getSelectedOption(VIEW_MODE_OPTIONS, viewMode)
	const baseText = pickPromptText(selectedView, locale)
	const customText = String(state.customView ?? "").trim()

	if (viewMode !== VIEW_MODE.CUSTOM || !customText) return baseText

	return MagicPromptLocale.isChinese(locale)
		? `${baseText}：${customText}`
		: `${baseText}: ${customText}`
}

function buildPrompt({ state, viewMode, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const reference = MagicPromptLocale.getReferenceLabel(1, locale)
	const targetViewText = buildTargetViewText({ state, viewMode, locale })
	const completionText = pickPromptText(
		getSelectedOption(COMPLETION_MODE_OPTIONS, state.completionMode),
		locale,
	)
	const outputStyleText = pickPromptText(
		getSelectedOption(OUTPUT_STYLE_OPTIONS, state.outputStyle),
		locale,
	)
	const subjectDescriptionClause = buildOptionalClause({
		value: state.subjectDescription,
		zhPrefix: "用户指定主体：",
		enPrefix: "User-specified subject: ",
		locale,
	})
	const extraClause = buildOptionalClause({
		value: state.extra,
		zhPrefix: "额外要求：",
		enPrefix: "Extra requirements: ",
		locale,
	})

	if (isChinese) {
		return (
			`基于${reference}的商品参考图生成同一商品的变视角图。` +
			"请先自动识别参考图中的主要商品主体、品类、结构比例、颜色、材质、纹理、品牌标识位置、标签区域、关键零件、装饰和可见细节。" +
			subjectDescriptionClause +
			`目标视角：${targetViewText}。` +
			`不可见面处理：${completionText}。` +
			`成片类型：${outputStyleText}。` +
			extraClause +
			"最终结果必须表现为同一个商品，只改变相机视角、商品朝向或局部观看角度，不要改变商品品类、核心造型、颜色、材质、比例、结构、品牌标识位置、图案、标签区域和关键功能部件。" +
			"如果目标视角包含原图不可见的背面、侧面、顶部或底部，可以按原商品设计语言合理补全，但不要凭空改款、不要新增与原商品不一致的装饰、配件、文字、logo 或复杂图案。" +
			"对于包装、瓶罐、3C、家电或带标签商品，不要编造新的可读文字；无法确认的文字应保持抽象、模糊或不可读，但标签位置和视觉层次应合理。" +
			"不要添加真人模特、手、衣架、道具、无关背景杂物、水印、多余文字或对比说明。画面应清晰、真实、适合电商展示和商品设计沟通。"
		)
	}

	return (
		`Generate a changed-view image of the same product based on the product reference ${reference}. ` +
		"First auto-detect the main product subject, category, structural proportions, colors, materials, textures, brand-mark placement, label areas, key parts, decoration, and visible details from the reference. " +
		subjectDescriptionClause +
		`Target view: ${targetViewText}. ` +
		`Hidden-side handling: ${completionText}. ` +
		`Output type: ${outputStyleText}. ` +
		extraClause +
		"The final result must depict the same product. Only change the camera angle, product orientation, or local viewing angle. Do not change the product category, core shape, color, material, proportions, structure, brand-mark placement, pattern, label areas, or key functional parts. " +
		"If the target view includes hidden back, side, top, or bottom areas, complete them reasonably according to the original product design language, but do not redesign the product or add inconsistent decoration, accessories, text, logos, or complex patterns. " +
		"For packaging, bottles, electronics, appliances, or labeled goods, do not invent new readable text. Unconfirmed text should remain abstract, blurred, or unreadable while preserving plausible label placement and visual hierarchy. " +
		"Do not add real models, hands, hangers, props, unrelated background clutter, watermarks, extra text, or comparison captions. The image should be clear, realistic, and suitable for e-commerce display and product design communication."
	)
}

function getSelectedViewModes(state) {
	const values = Array.isArray(state.viewModes) ? state.viewModes : []
	const validValues = new Set(VIEW_MODE_OPTIONS.map((item) => item.value))
	return values.filter((value) => validValues.has(value))
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

		return ctx.panel.render(root, {
			panelClassName: "product-multiview",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "productImage",
					kind: "image-slot",
					stateKey: "productImage",
					title: t("section.productImage", "商品图"),
					required: true,
					uploadLabel: t("upload.productImage", "点击上传商品图"),
					alt: t("section.productImage", "商品图"),
					help: t(
						"upload.productImage.help",
						"支持上传商品、服饰、鞋靴、包袋、包装、小家电、家具或配饰图。不填写主体描述时，AI 会自动识别主体。",
					),
				},
				{
					id: "subjectDescription",
					kind: "textarea",
					stateKey: "subjectDescription",
					title: t("section.subjectDescription", "主体描述"),
					placeholder: t(
						"placeholder.subjectDescription",
						"如：黑色短靴、香水瓶、双肩包、白色小家电。不填则由 AI 自动识别。",
					),
					rows: 2,
				},
				{
					id: "viewMode",
					kind: "option-group",
					stateKey: "viewModes",
					title: t("section.viewMode", "目标视角"),
					groupClassName: "product-multiview-three-grid",
					multiple: true,
					options: mapOptions(VIEW_MODE_OPTIONS, t),
				},
				{
					id: "customView",
					kind: "textarea",
					stateKey: "customView",
					deps: ["viewModes"],
					title: t("section.customView", "自定义视角"),
					placeholder: t(
						"placeholder.customView",
						"如：商品向右旋转一点，展示背标区域",
					),
					rows: 2,
					when: ({ state }) => getSelectedViewModes(state).includes(VIEW_MODE.CUSTOM),
				},
				{
					id: "completionMode",
					kind: "option-group",
					stateKey: "completionMode",
					title: t("section.completionMode", "不可见面处理"),
					groupClassName: "product-multiview-two-grid",
					options: mapOptions(COMPLETION_MODE_OPTIONS, t),
				},
				{
					id: "outputStyle",
					kind: "option-group",
					stateKey: "outputStyle",
					title: t("section.outputStyle", "成片类型"),
					groupClassName: "product-multiview-two-grid",
					options: mapOptions(OUTPUT_STYLE_OPTIONS, t),
				},
				{
					id: "extra",
					kind: "textarea",
					stateKey: "extra",
					title: t("section.extra", "额外要求"),
					placeholder: t(
						"placeholder.extra",
						"如：保留标签位置，不要编造可读文字，突出侧面厚度",
					),
					rows: 2,
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
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "尺寸倍数"),
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "每个视角生成数量"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成多视角图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImage) return t("empty.productImage", "请先上传商品图")
					if (!getSelectedViewModes(state).length) {
						return t("empty.viewMode", "请至少选择 1 个目标视角")
					}
					if (
						getSelectedViewModes(state).includes(VIEW_MODE.CUSTOM) &&
						!String(state.customView ?? "").trim()
					) {
						return t("empty.customView", "请输入自定义目标视角")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.productImage ||
					!getSelectedViewModes(state).length ||
					(getSelectedViewModes(state).includes(VIEW_MODE.CUSTOM) &&
						!String(state.customView ?? "").trim()),
				validate: ({ state, helpers }) => {
					if (!state.productImage) return t("empty.productImage", "请先上传商品图")
					if (!getSelectedViewModes(state).length) {
						return t("empty.viewMode", "请至少选择 1 个目标视角")
					}

					const maxReferenceImages =
						helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 1
					if (maxReferenceImages < 1) {
						return t("error.referenceLimit", "参考图数量已达当前模型上限")
					}
					if (helpers.collectReferenceIds([state.productImage]).length !== 1) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}

					const selectedSize = helpers.getSelectedSize(state)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					if (
						getSelectedViewModes(state).includes(VIEW_MODE.CUSTOM) &&
						!String(state.customView ?? "").trim()
					) {
						return t("empty.customView", "请输入自定义目标视角")
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = helpers.getSelectedSize(state)
					const width = selectedSize.genW
					const height = selectedSize.genH
					const referenceImages = helpers.collectReferenceIds([state.productImage])
					const requests = getSelectedViewModes(state).map((viewMode) => ({
						model_id: state.modelId,
						prompt: buildPrompt({
							state,
							viewMode,
							locale: promptLocale,
						}),
						reference_images: referenceImages,
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						width,
						height,
						count: state.genCount,
						select: false,
					}))

					if (requests.length === 1) return generateAndPlace(requests[0])
					return Promise.all(requests.map((request) => generateAndPlace(request)))
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "商品多视角图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
