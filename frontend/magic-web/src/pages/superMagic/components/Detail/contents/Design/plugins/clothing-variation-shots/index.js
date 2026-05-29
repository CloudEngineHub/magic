/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const GARMENT_TYPE_DEFINITIONS = [
	{
		value: "top",
		labelKey: "type.top",
		labelFallback: "上装",
		promptText: {
			zh: "上装服饰",
			en: "top garment",
		},
	},
	{
		value: "bottom",
		labelKey: "type.bottom",
		labelFallback: "下装",
		promptText: {
			zh: "下装服饰",
			en: "bottom garment",
		},
	},
	{
		value: "onePiece",
		labelKey: "type.onePiece",
		labelFallback: "连体衣",
		promptText: {
			zh: "连体服饰",
			en: "one-piece garment",
		},
	},
	{
		value: "outfit",
		labelKey: "type.outfit",
		labelFallback: "上装+下装",
		promptText: {
			zh: "上装+下装",
			en: "top and bottom garments",
		},
	},
]

const GENERATION_STYLE_DEFINITIONS = [
	{
		value: "reference",
		labelKey: "generationMode.reference",
		labelFallback: "推荐样式",
		descriptionKey: "generationMode.reference.desc",
		descriptionFallback: "支持上传多张样式参考图，生成时会参考其平铺陈列方式、细节展示重点与画面表达，但不会改变主服饰款式。",
	},
	{
		value: "custom",
		labelKey: "generationMode.custom",
		labelFallback: "自定义样式",
		descriptionKey: "generationMode.custom.desc",
		descriptionFallback: "用文字描述你想要的服饰展示效果。",
	},
]

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "平衡生成效率与营销展示完成度。",
		promptSuffix: {
			zh: "保持商业可用、稳定自然的营销展示效果。",
			en: "Keep the result commercially usable, stable, and naturally presented.",
		},
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback: "增强面料纹理、结构细节与营销成片质感。",
		promptSuffix: {
			zh: "增强面料纹理、织物组织、走线、纽扣、拉链、边缘、褶皱和垂坠细节，使结果更具营销成片质感与展示层次。",
			en:
				"Enhance fabric texture, weave structure, stitching, buttons, zippers, edges, folds, and drape so the result feels richer, more premium, and more marketing-ready.",
		},
	},
]

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const promptLocale = MagicPromptLocale.resolveLocale(ctx)
		const garmentTypeOptions = GARMENT_TYPE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
		}))
		const generationStyleOptions = GENERATION_STYLE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))
		const generationModeOptions = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "clothing-variation-shots",
			initialState: {
				garmentImage: null,
				garmentType: "top",
				generationStyle: "reference",
				styleReferenceImages: [],
				customStylePrompt: "",
				generationMode: "standard",
				genCount: 1,
			},
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "garmentImage",
					kind: "image-slot",
					stateKey: "garmentImage",
					title: t("section.garmentImage", "服饰图"),
					uploadLabel: t("upload.garmentImage", "点击上传服饰图"),
					alt: t("section.garmentImage", "服饰图"),
					help: t(
						"upload.garmentImage.help",
						"支持上传单张平铺图、人台图或模特图。AI 会保留服饰本身，只调整营销化展示方式。",
					),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const currentCount = countReferenceImages(state)
						if (!state.garmentImage && currentCount >= maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "garmentType",
					kind: "option-group",
					stateKey: "garmentType",
					title: t("section.garmentType", "服饰类型"),
					options: garmentTypeOptions,
				},
				{
					id: "generationStyle",
					kind: "option-group",
					stateKey: "generationStyle",
					title: t("section.generationStyle", "生成样式"),
					showDescriptionOnHover: true,
					groupClassName: "clothing-variation-style-grid",
					options: generationStyleOptions,
				},
				{
					id: "styleReferenceImages",
					kind: "image-grid",
					stateKey: "styleReferenceImages",
					title: t("section.styleReferenceImages", "样式参考图"),
					alt: t("section.styleReferenceImages", "样式参考图"),
					addLabel: "+",
					deps: ["generationStyle", "garmentImage", "modelId", "modelOptions"],
					when: ({ state }) => state.generationStyle === "reference",
					help: t(
						"upload.styleReferenceImages.help",
						"支持上传多张样式参考图，生成时会逐张参考其平铺陈列方式、细节展示重点与画面表达，但不会改变主服饰款式。",
					),
					maxCount: ({ state, helpers }) => {
						const garmentCount = state.garmentImage ? 1 : 0
						return Math.max(
							0,
							getMaxReferenceImages(state, helpers) - garmentCount,
						)
					},
				},
				{
					id: "customStylePrompt",
					kind: "textarea",
					stateKey: "customStylePrompt",
					title: t("section.customStylePrompt", "样式描述"),
					deps: ["generationStyle"],
					when: ({ state }) => state.generationStyle === "custom",
					placeholder: t(
						"placeholder.customStylePrompt",
						"输入样式描述内容，如：提取图中下装服饰，生成标准摆放的平铺图。背景为带褶皱的白布，并补充具有营销感的展示细节。",
					),
					rows: 4,
					maxLength: 2000,
				},
				{
					id: "generationMode",
					kind: "option-group",
					stateKey: "generationMode",
					title: t("section.generationMode", "生成模式"),
					showDescriptionOnHover: true,
					options: generationModeOptions,
				},
				{
					id: "canvasSize",
					kind: "size-control",
					title: t("section.canvasSize", "画布尺寸"),
					ratioStateKey: "ratioKey",
					deps: ["modelId", "modelOptions", "scale"],
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "modelSelect",
					kind: "model-select",
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成张数"),
					suffix: t("section.count.suffix", "每种样式生成数"),
					options: GENERATION_COUNT_GROUP_OPTIONS,
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成百变服饰图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.garmentImage) {
						return t("empty.garmentImage", "请先上传 1 张服饰图")
					}
					if (state.generationStyle === "reference" && !state.styleReferenceImages.length) {
						return t("empty.styleReferenceImages", "请先上传至少 1 张样式参考图")
					}
					if (state.generationStyle === "custom" && !state.customStylePrompt.trim()) {
						return t("empty.customStylePrompt", "请先输入样式描述")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.garmentImage ||
					(state.generationStyle === "reference" && !state.styleReferenceImages.length) ||
					(state.generationStyle === "custom" && !state.customStylePrompt.trim()),
				validate: ({ state, helpers }) => {
					if (!state.garmentImage) {
						return t("empty.garmentImage", "请先上传 1 张服饰图")
					}
					if (state.generationStyle === "reference" && !state.styleReferenceImages.length) {
						return t("empty.styleReferenceImages", "请先上传至少 1 张样式参考图")
					}
					if (state.generationStyle === "custom" && !state.customStylePrompt.trim()) {
						return t("empty.customStylePrompt", "请先输入样式描述")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
					const referenceImages = getReferenceImages(state)
					if (referenceImages.length > getMaxReferenceImages(state, helpers)) {
						return t("error.referenceLimit", "参考图数量已达当前模型上限")
					}
					if (
						helpers.collectReferenceIds(referenceImages).length !==
						referenceImages.length
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					const selectedSize = helpers.getSelectedSize(state)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = helpers.getSelectedSize(state)
					if (state.generationStyle !== "reference") {
						return generateAndPlace(
							buildClothingVariationRequest({
								state,
								helpers,
								locale: promptLocale,
								selectedSize,
								count: state.genCount,
							}),
						)
					}

					const requests = buildReferenceStyleRequests({
						state,
						helpers,
						locale: promptLocale,
						selectedSize,
					})
					const results = []
					for (const request of requests) {
						results.push(await generateAndPlace(request))
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "百变服饰图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function getReferenceImages(state) {
	return [state.garmentImage, ...(state.generationStyle === "reference" ? state.styleReferenceImages : [])].filter(Boolean)
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 6
}

function buildReferenceLabelList(startIndex, count, locale) {
	const labels = Array.from({ length: count }, (_, index) =>
		MagicPromptLocale.getReferenceLabel(startIndex + index, locale),
	)
	return MagicPromptLocale.isChinese(locale) ? labels.join("、") : labels.join(", ")
}

function buildClothingVariationRequest({
	state,
	helpers,
	locale,
	selectedSize,
	count,
	referenceImages: referenceImagesOverride,
	styleReferenceCount: styleReferenceCountOverride,
}) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const referenceImages = helpers.collectReferenceIds(getReferenceImages(state))

	return {
		model_id: state.modelId,
		prompt: buildClothingVariationPrompt({
			garmentType: state.garmentType,
			generationStyle: state.generationStyle,
			customStylePrompt: state.customStylePrompt,
			generationMode: state.generationMode,
			styleReferenceCount:
				typeof styleReferenceCountOverride === "number"
					? styleReferenceCountOverride
					: state.styleReferenceImages.length,
			locale,
		}),
		reference_images: referenceImagesOverride ?? referenceImages,
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count,
		select: false,
	}
}

function buildReferenceStyleRequests({ state, helpers, locale, selectedSize }) {
	const garmentReferenceId = helpers.collectReferenceIds([state.garmentImage])[0]
	const styleReferenceIds = helpers.collectReferenceIds(state.styleReferenceImages)

	return styleReferenceIds.map((_, index) =>
		buildClothingVariationRequest({
			state,
			helpers,
			locale,
			selectedSize,
			count: state.genCount,
			referenceImages: [garmentReferenceId, styleReferenceIds[index]],
			styleReferenceCount: 1,
		}),
	)
}

function buildClothingVariationPrompt({
	garmentType,
	generationStyle,
	customStylePrompt,
	generationMode,
	styleReferenceCount,
	locale,
}) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const isOutfit = garmentType === "outfit"
	const garmentTypeText = MagicPromptLocale.pickText(
		GARMENT_TYPE_DEFINITIONS.find((item) => item.value === garmentType)?.promptText ??
			GARMENT_TYPE_DEFINITIONS[0].promptText,
		locale,
	)
	const modeSuffix = MagicPromptLocale.pickText(
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode)?.promptSuffix ??
			GENERATION_MODE_DEFINITIONS[0].promptSuffix,
		locale,
	)

	if (isChinese) {
		const basePrompt =
			`先读取参考图 1，并从中准确识别、提取需要处理的${garmentTypeText}。参考图 1 可能是平铺图、人台图或模特图；如果画面中包含人体、其他服饰、搭配单品或背景元素，只保留目标${garmentTypeText}作为最终结果中的唯一服饰主体。` +
			"最终结果中的服饰主体必须完全来自参考图 1。必须严格保留该目标服饰原本的颜色、图案、面料、纹理、版型、轮廓、结构、辅料与关键设计细节，不得替换款式、改变结构，也不得混入其他服饰；参考图 2 和文字描述都只能影响展示方式，不能新增、替换、改写或扩展服饰主体本身。" +
			(isOutfit
				? "如果当前类型为上装+下装，必须同时完整保留上装和下装两件单品，缺一不可；不允许只展示其中一件，也不允许把两件拆成无关结果。"
				: "")

		if (generationStyle === "reference") {
			return (
				basePrompt +
				"参考图 2 仅作为展示方式参考，不提供任何新的商品主体信息。参考图 2 只能定义目标服饰在结果中的展示方式，包括主展示形态、构图、裁切重点、陈列关系、背景材质、布光氛围和镜头语言，不能影响服饰主体本身的品类、款式、版型、轮廓、结构、长度、袖型、裤型、辅料、图案、面料、纹理和关键设计细节。" +
				"需要将从参考图 1 中提取出的服饰主体，按照参考图 2 所体现的展示方式进行重组与呈现。输出应优先遵循参考图 2 的展示方法，但最终结果中的服饰仍必须被明确识别为参考图 1 中的同一件商品，只改变展示方式，不改变商品本身。即使参考图 2 中出现不同类型、不同结构、不同长度或不同廓形的服饰，也不得把这些服饰特征迁移到结果中。" +
				(isOutfit
					? "对于上装+下装，最终结果中必须让上装和下装同时完整出现，并作为一整套服饰按照参考图 2 的展示方式共同输出。"
					: "") +
				"不要复制或继承参考图 2 中的服饰主体、其他商品、人物、文字、水印、品牌元素或无关道具；只学习展示方法，不继承其中的商品内容。" +
                modeSuffix
			)
		}

		const normalizedPrompt = customStylePrompt.trim()
		return (
			basePrompt +
			`按以下样式要求生成：${normalizedPrompt}。` +
			(isOutfit
				? "文字描述只用于定义整套服饰的展示方式、背景、陈列语言、营销氛围和细节重点，不能新增、替换、改写或扩展服饰主体本身。不得让上装或下装缺失，也不得改变两件单品的品类、款式、版型、轮廓、结构、长度、辅料、图案、面料和材质特征。"
				: "文字描述只用于定义展示方式、背景、陈列语言、营销氛围和细节重点，不能新增、替换、改写或扩展服饰主体本身，不得改变主服饰的品类、款式、版型、轮廓、结构、长度、辅料、图案、面料和材质特征。") +
			modeSuffix
		)
	}

	const basePrompt =
		`First read reference image 1 and accurately identify and extract the target ${garmentTypeText} from it. Reference image 1 may be a flat-lay image, mannequin image, or model image. If the source contains a person, other garments, styling items, or background elements, keep ONLY the target ${garmentTypeText} as the garment subject in the final output. ` +
		"The garment subject in the final result must come entirely from reference image 1. You must strictly preserve the original color, pattern, material, texture, silhouette, construction, trims, and key design details of that garment. Do not replace the product style, alter its structure, or mix in any other garment content. Reference image 2 and text instructions may affect only the presentation, and must not add, replace, rewrite, or extend the garment subject itself. " +
		(isOutfit
			? "If the current type is top and bottom garments, both the top and the bottom must be preserved completely. Do not keep only one piece or split them into unrelated results. "
			: "")

	if (generationStyle === "reference") {
		return (
			basePrompt +
			"Reference image 2 is only a display-form reference and provides no new product-subject information. It may define only how the target garment is presented in the result, including the primary display form, composition, crop focus, arrangement, background material, lighting mood, and camera language. It must not affect the garment subject itself, including category, product type, silhouette, construction, length, sleeve shape, pant shape, trims, pattern, fabric, texture, or key design details. " +
			"You need to reorganize and present the garment extracted from reference image 1 according to the display method conveyed by reference image 2. The output should primarily follow the presentation method shown in reference image 2, but the garment in the final result must still be clearly recognizable as the same product from reference image 1. Change only the presentation, not the product itself. Even if reference image 2 contains a different type of garment or a different structure, length, or silhouette, those garment features must not be transferred into the result. " +
			(isOutfit
				? "For top and bottom garments, both pieces must appear together and be presented together as one outfit in the final result. "
				: "") +
			"Do not copy or inherit the garment subject, any other products, people, text, watermarks, brand elements, or irrelevant props from reference image 2. Learn only the display method, not the product content inside it. " +
			modeSuffix
		)
	}

	return (
		basePrompt +
		`Follow this custom style instruction: ${customStylePrompt.trim()}. ` +
		(isOutfit
			? "The text is used only to define the display form, background, arrangement language, marketing mood, and detail emphasis for the full outfit. It must not add, replace, rewrite, or extend the garment subject itself. Do not let either the top or the bottom disappear, and do not change the category, product style, silhouette, construction, length, trims, pattern, fabric, or material characteristics of either piece. "
			: "The text is used only to define the display form, background, arrangement language, marketing mood, and detail emphasis. It must not add, replace, rewrite, or extend the garment subject itself, and it must not change the garment's category, product style, silhouette, construction, length, trims, pattern, fabric, or material characteristics. ") +
		modeSuffix
	)
}