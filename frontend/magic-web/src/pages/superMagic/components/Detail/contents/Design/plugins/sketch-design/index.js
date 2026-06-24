/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const MODE = {
	IMAGE_TO_SKETCH: "imageToSketch",
	EXTEND: "extend",
	SKETCH_TO_IMAGE: "sketchToImage",
}

const SKETCH_TYPE = {
	SINGLE: "single",
	FRONT_BACK: "frontBack",
}

const DETAIL_LEVEL = {
	CLEAN: "clean",
	STANDARD: "standard",
	FINE: "fine",
}

const EXTENSION_DIRECTION = {
	DETAILS: "details",
	FUSION: "fusion",
	SERIES: "series",
}

const GARMENT_RENDER_STYLE = {
	STUDIO_3D: "studio3d",
	FLAT: "flat",
	MANNEQUIN: "mannequin",
	MODEL: "model",
}

const MODE_OPTIONS = [
	{
		value: MODE.IMAGE_TO_SKETCH,
		labelKey: "mode.imageToSketch",
		labelFallback: "图转线稿",
	},
	{
		value: MODE.EXTEND,
		labelKey: "mode.extend",
		labelFallback: "线稿延伸",
	},
	{
		value: MODE.SKETCH_TO_IMAGE,
		labelKey: "mode.sketchToImage",
		labelFallback: "线稿转图",
	},
]

const SKETCH_TYPE_OPTIONS = [
	{
		value: SKETCH_TYPE.SINGLE,
		labelKey: "sketchType.single",
		labelFallback: "单面线稿",
		promptText: {
			zh: "输出单面服装线稿，使用最能表达款式结构的正面或主要视角",
			en: "output a single-view apparel line drawing using the front or main view that best communicates the garment structure",
		},
	},
	{
		value: SKETCH_TYPE.FRONT_BACK,
		labelKey: "sketchType.frontBack",
		labelFallback: "正背面线稿",
		promptText: {
			zh: "在同一画面中输出正面和背面服装线稿，比例一致、结构对应清晰",
			en: "output front and back apparel line drawings in the same image with consistent proportions and clearly matched construction",
		},
	},
]

const DETAIL_LEVEL_OPTIONS = [
	{
		value: DETAIL_LEVEL.CLEAN,
		labelKey: "detailLevel.clean",
		labelFallback: "简洁结构",
		promptText: {
			zh: "只保留大轮廓、主要结构线和关键分割线，线条干净克制",
			en: "keep only the main silhouette, primary construction lines, and key panel breaks with clean restrained lines",
		},
	},
	{
		value: DETAIL_LEVEL.STANDARD,
		labelKey: "detailLevel.standard",
		labelFallback: "标准款式图",
		promptText: {
			zh: "保留领口、袖型、门襟、口袋、褶裥、腰线、下摆、拼接线等标准款式图细节",
			en: "preserve standard flat-sketch details such as neckline, sleeves, placket, pockets, pleats, waistline, hem, and panel seams",
		},
	},
	{
		value: DETAIL_LEVEL.FINE,
		labelKey: "detailLevel.fine",
		labelFallback: "精细工艺线",
		promptText: {
			zh: "进一步表现明线、压线、拉链、纽扣、腰袢、装饰线和细部工艺结构",
			en: "also show stitch lines, topstitching, zippers, buttons, belt loops, decorative lines, and detailed construction features",
		},
	},
]

const EXTENSION_DIRECTION_OPTIONS = [
	{
		value: EXTENSION_DIRECTION.DETAILS,
		labelKey: "extensionDirection.details",
		labelFallback: "保留版型，延伸细节",
		promptText: {
			zh: "严格保留线稿图的基础版型、比例和轮廓，只在领口、袖口、门襟、口袋、褶裥、拼接线或装饰结构上做合理延伸",
			en: "strictly keep the base pattern, proportions, and silhouette from the sketch image; only extend details such as neckline, cuffs, placket, pockets, pleats, panel seams, or decorative construction",
		},
	},
	{
		value: EXTENSION_DIRECTION.FUSION,
		labelKey: "extensionDirection.fusion",
		labelFallback: "参考图融合",
		promptText: {
			zh: "以线稿图为主结构，将参考图中的领型、袖型、口袋、拼接、装饰、工艺语言或局部设计点融合进新线稿",
			en: "use the sketch image as the primary structure and fuse in collar, sleeve, pocket, paneling, decoration, construction language, or local design details from the reference image",
		},
	},
	{
		value: EXTENSION_DIRECTION.SERIES,
		labelKey: "extensionDirection.series",
		labelFallback: "系列款变化",
		promptText: {
			zh: "保留原线稿的品类和核心风格，生成同系列但有明确差异的新款线稿",
			en: "preserve the category and core style of the original sketch while generating a clearly differentiated line drawing from the same collection",
		},
	},
]

const GARMENT_RENDER_STYLE_OPTIONS = [
	{
		value: GARMENT_RENDER_STYLE.STUDIO_3D,
		labelKey: "renderStyle.studio3d",
		labelFallback: "3D棚拍",
		promptText: {
			zh: "生成独立服装 3D 棚拍效果图，白色或浅灰摄影棚背景，立体廓形清晰，干净商业光影",
			en: "generate a standalone 3D studio apparel product image with a white or light gray studio background, clear dimensional silhouette, and clean commercial lighting",
		},
	},
	{
		value: GARMENT_RENDER_STYLE.FLAT,
		labelKey: "renderStyle.flat",
		labelFallback: "平铺商品图",
		promptText: {
			zh: "生成平铺商品图，服装自然平铺，俯视或接近俯视角度，背景干净",
			en: "generate a flat lay product image with the garment laid naturally, top-down or near top-down view, and clean background",
		},
	},
	{
		value: GARMENT_RENDER_STYLE.MANNEQUIN,
		labelKey: "renderStyle.mannequin",
		labelFallback: "人台展示",
		promptText: {
			zh: "生成白色人台穿着展示图，全身或完整服装可见，纯净棚拍背景，不出现真人",
			en: "generate a white mannequin display image with the full garment clearly visible, clean studio background, and no real person",
		},
	},
	{
		value: GARMENT_RENDER_STYLE.MODEL,
		labelKey: "renderStyle.model",
		labelFallback: "真人试穿",
		promptText: {
			zh: "生成真人模特试穿效果图，服装为画面核心，模特自然简洁，背景干净",
			en: "generate a real model try-on image with the garment as the visual focus, natural minimal model styling, and clean background",
		},
	},
]

function createInitialState() {
	return {
		mode: MODE.IMAGE_TO_SKETCH,
		styleImage: null,
		sketchImage: null,
		referenceImage: null,
		extensionDirection: EXTENSION_DIRECTION.DETAILS,
		renderStyle: GARMENT_RENDER_STYLE.STUDIO_3D,
		materialDescription: "",
		sketchType: SKETCH_TYPE.SINGLE,
		detailLevel: DETAIL_LEVEL.STANDARD,
		extra: "",
		genCount: 1,
	}
}

function mapOptions(options, t) {
	return options.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
	}))
}

function getSelectedOption(options, value) {
	return options.find((item) => item.value === value) ?? options[0]
}

function pickPromptText(option, locale) {
	return MagicPromptLocale.pickText(option.promptText, locale)
}

function getReferenceImages(state) {
	if (state.mode === MODE.IMAGE_TO_SKETCH) return [state.styleImage].filter(Boolean)
	return [state.sketchImage, state.referenceImage].filter(Boolean)
}

function isSketchOutputMode(state) {
	return state.mode !== MODE.SKETCH_TO_IMAGE
}

function buildExtraClause(extra, locale) {
	const normalizedExtra = String(extra ?? "").trim()
	if (!normalizedExtra) return ""
	return MagicPromptLocale.isChinese(locale)
		? `额外要求：${normalizedExtra}。`
		: `Additional requirements: ${normalizedExtra}. `
}

function buildImageToSketchPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const styleReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const sketchTypeText = pickPromptText(
		getSelectedOption(SKETCH_TYPE_OPTIONS, state.sketchType),
		locale,
	)
	const detailLevelText = pickPromptText(
		getSelectedOption(DETAIL_LEVEL_OPTIONS, state.detailLevel),
		locale,
	)
	const extraClause = buildExtraClause(state.extra, locale)

	if (isChinese) {
		return (
			`基于${styleReference}的服装实拍款式图生成标准服装线稿图。` +
			`线稿类型：${sketchTypeText}。细节程度：${detailLevelText}。` +
			extraClause +
			"请识别服装的品类、版型、廓形、比例、领口、袖型、门襟、口袋、褶裥、腰线、下摆、拼接线和关键工艺结构，并转换为干净的黑白服装技术线稿。" +
			"去除真人模特、人体、背景、光影、阴影、面料照片质感、颜色、复杂纹理、噪点、文字、水印和多余道具。" +
			"输出应像服装款式图/技术平面图：白底、黑色或深灰线条、线宽均匀、结构清晰、左右比例准确、适合设计沟通和打版参考。"
		)
	}

	return (
		`Generate a standard apparel line drawing from the garment product photo ${styleReference}. ` +
		`Sketch type: ${sketchTypeText}. Detail level: ${detailLevelText}. ` +
		extraClause +
		"Identify the garment category, pattern, silhouette, proportions, neckline, sleeves, placket, pockets, pleats, waistline, hem, panel seams, and key construction details, then convert them into clean black-and-white technical fashion line art. " +
		"Remove the model, body, background, lighting, shadows, photographic fabric texture, colors, complex texture noise, text, watermark, and extra props. " +
		"The result should look like a fashion flat sketch or technical drawing: white background, black or dark gray lines, even line weight, clear construction, accurate left-right proportions, suitable for design communication and pattern-making reference."
	)
}

function buildExtendPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const sketchReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const referenceImage = state.referenceImage
		? MagicPromptLocale.getReferenceLabel(2, locale)
		: ""
	const extensionText = pickPromptText(
		getSelectedOption(EXTENSION_DIRECTION_OPTIONS, state.extensionDirection),
		locale,
	)
	const sketchTypeText = pickPromptText(
		getSelectedOption(SKETCH_TYPE_OPTIONS, state.sketchType),
		locale,
	)
	const detailLevelText = pickPromptText(
		getSelectedOption(DETAIL_LEVEL_OPTIONS, state.detailLevel),
		locale,
	)
	const extraClause = buildExtraClause(state.extra, locale)

	if (isChinese) {
		return (
			`基于${sketchReference}的线稿图进行服装线稿延伸。` +
			`${sketchReference}是主结构参考，必须优先保留其服装品类、比例、基础版型、轮廓、结构线位置和线稿风格。` +
			(referenceImage
				? `${referenceImage}是辅助参考图，只用于借鉴设计元素、局部结构、工艺语言或风格方向，不要直接复制照片质感。`
				: "未提供辅助参考图，请基于原线稿进行合理延伸。") +
			`延伸方向：${extensionText}。线稿类型：${sketchTypeText}。细节程度：${detailLevelText}。` +
			extraClause +
			"输出必须仍然是标准服装线稿图，而不是照片、彩色插画或真人试穿图。" +
			"不要生成真人模特、人体、背景、光影、阴影、面料照片质感、颜色、复杂纹理、文字、水印或多余道具。" +
			"保持白底、黑色或深灰线条、线宽均匀、结构清楚、比例准确，适合服装设计沟通和打版参考。"
		)
	}

	return (
		`Extend the apparel line drawing based on sketch reference ${sketchReference}. ` +
		`${sketchReference} is the primary structural reference; prioritize its garment category, proportions, base pattern, silhouette, construction-line placement, and line-art style. ` +
		(referenceImage
			? `${referenceImage} is a secondary reference. Borrow only design elements, local construction, construction language, or style direction from it; do not copy photographic texture. `
			: "No secondary reference image is provided; extend the original sketch in a reasonable way. ") +
		`Extension direction: ${extensionText}. Sketch type: ${sketchTypeText}. Detail level: ${detailLevelText}. ` +
		extraClause +
		"The output must remain a standard apparel line drawing, not a photo, colored illustration, or model try-on image. " +
		"Do not generate a model, body, background, lighting, shadows, photographic fabric texture, color, complex texture noise, text, watermark, or extra props. " +
		"Keep a white background, black or dark gray lines, even line weight, clear construction, and accurate proportions suitable for fashion design communication and pattern-making reference."
	)
}

function buildMaterialClause(materialDescription, locale) {
	const normalizedText = String(materialDescription ?? "").trim()
	if (!normalizedText) return ""
	return MagicPromptLocale.isChinese(locale)
		? `材质/颜色描述：${normalizedText}。`
		: `Material and color description: ${normalizedText}. `
}

function buildSketchToImagePrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const sketchReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const referenceImage = state.referenceImage
		? MagicPromptLocale.getReferenceLabel(2, locale)
		: ""
	const renderStyleText = pickPromptText(
		getSelectedOption(GARMENT_RENDER_STYLE_OPTIONS, state.renderStyle),
		locale,
	)
	const materialClause = buildMaterialClause(state.materialDescription, locale)
	const extraClause = buildExtraClause(state.extra, locale)

	if (isChinese) {
		return (
			`基于${sketchReference}的服装线稿/草图生成成衣效果图。` +
			`${sketchReference}是最高优先级结构参考，必须保留其中的服装品类、廓形、比例、领口、袖型、门襟、口袋、褶裥、腰线、下摆、拼接线和关键设计点。` +
			(referenceImage
				? `${referenceImage}是辅助参考图，只用于借鉴面料、颜色、纹理、工艺质感、局部细节或品牌风格，不要覆盖线稿结构。`
				: "未提供辅助参考图，请根据线稿结构生成合理成衣材质和商业展示效果。") +
			`成衣展示类型：${renderStyleText}。` +
			materialClause +
			extraClause +
			"输出必须是真实可信的成衣效果图，不要再输出线稿、手绘草图或技术图。" +
			"不要随意改变线稿中的核心版型和关键结构；不要添加文字、水印、logo、吊牌或多余道具。"
		)
	}

	return (
		`Generate a finished garment image from apparel sketch or line drawing ${sketchReference}. ` +
		`${sketchReference} is the highest-priority structural reference. Preserve its garment category, silhouette, proportions, neckline, sleeves, placket, pockets, pleats, waistline, hem, panel seams, and key design details. ` +
		(referenceImage
			? `${referenceImage} is a secondary reference. Borrow only fabric, color, texture, construction feel, local details, or brand style from it; do not override the sketch structure. `
			: "No secondary reference image is provided; infer a reasonable garment material and commercial presentation from the sketch structure. ") +
		`Garment presentation style: ${renderStyleText}. ` +
		materialClause +
		extraClause +
		"The output must be a realistic finished garment image, not another sketch, hand drawing, or technical line drawing. " +
		"Do not arbitrarily change the core pattern or key construction from the sketch. Do not add text, watermark, logo, hangtag, or extra props."
	)
}

function buildPrompt({ state, locale }) {
	if (state.mode === MODE.SKETCH_TO_IMAGE) return buildSketchToImagePrompt({ state, locale })
	if (state.mode === MODE.EXTEND) return buildExtendPrompt({ state, locale })
	return buildImageToSketchPrompt({ state, locale })
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
			panelClassName: "sketch-design",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "mode",
					kind: "tabs",
					stateKey: "mode",
					title: t("section.mode", "类型"),
					options: mapOptions(MODE_OPTIONS, t),
					panels: [
						{
							value: MODE.IMAGE_TO_SKETCH,
							sections: [
								{
									id: "styleImage",
									kind: "image-slot",
									stateKey: "styleImage",
									title: t("section.styleImage", "款式图"),
									required: true,
									uploadLabel: t("upload.styleImage", "点击上传款式图"),
									alt: t("section.styleImage", "款式图"),
									help: t(
										"upload.styleImage.help",
										"上传 1 张服装实拍款式图或 look 图，AI 将去除模特、背景、光影和面料照片质感，生成标准服装线稿。",
									),
								},
							],
						},
						{
							value: MODE.SKETCH_TO_IMAGE,
							sections: [
								{
									id: "sketchImageToRender",
									kind: "image-slot",
									stateKey: "sketchImage",
									title: t("section.sketchImage", "线稿图"),
									required: true,
									uploadLabel: t("upload.sketchImage", "点击上传线稿图"),
									alt: t("section.sketchImage", "线稿图"),
									help: t(
										"upload.sketchImageToImage.help",
										"上传 1 张服装线稿、手绘草图或款式平面图，AI 将严格参考其版型和结构生成成衣效果图。",
									),
									deps: ["referenceImage", "modelId", "modelOptions"],
									beforePick: ({ state, helpers }) => {
										const maxReferenceImages =
											helpers.getSelectedModel(state)?.image_size_config
												?.max_reference_images ?? 2
										if (
											!state.sketchImage &&
											getReferenceImages(state).length >= maxReferenceImages
										) {
											return t(
												"error.referenceLimit",
												"参考图数量已达当前模型上限",
											)
										}
										return null
									},
								},
								{
									id: "referenceImageToRender",
									kind: "image-slot",
									stateKey: "referenceImage",
									title: t("section.referenceImage", "参考图"),
									uploadLabel: t("upload.referenceImage", "点击上传参考图"),
									alt: t("section.referenceImage", "参考图"),
									help: t(
										"upload.referenceImageToImage.help",
										"可选。支持上传面料图、颜色图、实拍款式图、局部细节图或品牌风格图，用于提供材质、颜色、纹理和风格方向。",
									),
									deps: ["sketchImage", "modelId", "modelOptions"],
									beforePick: ({ state, helpers }) => {
										const maxReferenceImages =
											helpers.getSelectedModel(state)?.image_size_config
												?.max_reference_images ?? 2
										if (
											!state.referenceImage &&
											getReferenceImages(state).length >= maxReferenceImages
										) {
											return t(
												"error.referenceLimit",
												"参考图数量已达当前模型上限",
											)
										}
										return null
									},
								},
								{
									id: "renderStyle",
									kind: "option-group",
									stateKey: "renderStyle",
									title: t("section.renderStyle", "成衣展示类型"),
									groupClassName: "sketch-design-two-grid",
									options: mapOptions(GARMENT_RENDER_STYLE_OPTIONS, t),
								},
								{
									id: "materialDescription",
									kind: "textarea",
									stateKey: "materialDescription",
									title: t("section.materialDescription", "材质/颜色描述"),
									placeholder: t(
										"placeholder.materialDescription",
										"如：黑色羊毛呢，哑光质感，银色拉链",
									),
									rows: 2,
								},
							],
						},
						{
							value: MODE.EXTEND,
							sections: [
								{
									id: "sketchImage",
									kind: "image-slot",
									stateKey: "sketchImage",
									title: t("section.sketchImage", "线稿图"),
									required: true,
									uploadLabel: t("upload.sketchImage", "点击上传线稿图"),
									alt: t("section.sketchImage", "线稿图"),
									help: t(
										"upload.sketchImage.help",
										"上传 1 张已有线稿图，AI 将保留其品类、比例、版型和线稿风格。",
									),
									deps: ["referenceImage", "modelId", "modelOptions"],
									beforePick: ({ state, helpers }) => {
										const maxReferenceImages =
											helpers.getSelectedModel(state)?.image_size_config
												?.max_reference_images ?? 2
										if (
											!state.sketchImage &&
											getReferenceImages(state).length >= maxReferenceImages
										) {
											return t(
												"error.referenceLimit",
												"参考图数量已达当前模型上限",
											)
										}
										return null
									},
								},
								{
									id: "referenceImage",
									kind: "image-slot",
									stateKey: "referenceImage",
									title: t("section.referenceImage", "参考图"),
									uploadLabel: t("upload.referenceImage", "点击上传参考图"),
									alt: t("section.referenceImage", "参考图"),
									help: t(
										"upload.referenceImage.help",
										"可选。支持上传实拍款式图、局部细节图、灵感图、面料图或图案参考图，AI 将借鉴设计元素，但以线稿图结构为主。",
									),
									deps: ["sketchImage", "modelId", "modelOptions"],
									beforePick: ({ state, helpers }) => {
										const maxReferenceImages =
											helpers.getSelectedModel(state)?.image_size_config
												?.max_reference_images ?? 2
										if (
											!state.referenceImage &&
											getReferenceImages(state).length >= maxReferenceImages
										) {
											return t(
												"error.referenceLimit",
												"参考图数量已达当前模型上限",
											)
										}
										return null
									},
								},
								{
									id: "extensionDirection",
									kind: "option-group",
									stateKey: "extensionDirection",
									title: t("section.extensionDirection", "延伸方向"),
									groupClassName: "sketch-design-three-grid",
									options: mapOptions(EXTENSION_DIRECTION_OPTIONS, t),
								},
							],
						},
					],
				},
				{
					id: "sketchType",
					kind: "option-group",
					stateKey: "sketchType",
					title: t("section.sketchType", "线稿类型"),
					groupClassName: "sketch-design-two-grid",
					options: mapOptions(SKETCH_TYPE_OPTIONS, t),
					deps: ["mode"],
					when: ({ state }) => isSketchOutputMode(state),
				},
				{
					id: "detailLevel",
					kind: "option-group",
					stateKey: "detailLevel",
					title: t("section.detailLevel", "细节程度"),
					groupClassName: "sketch-design-three-grid",
					options: mapOptions(DETAIL_LEVEL_OPTIONS, t),
					deps: ["mode"],
					when: ({ state }) => isSketchOutputMode(state),
				},
				{
					id: "extra",
					kind: "textarea",
					stateKey: "extra",
					title: t("section.extra", "额外要求"),
					placeholder: t("placeholder.extra", "如：突出领口和口袋结构，保持干净黑白线稿"),
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
					title: t("section.count", "生成数量"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成服装线稿")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (state.mode !== MODE.IMAGE_TO_SKETCH && !state.sketchImage) {
						return t("empty.sketchImage", "请先上传线稿图")
					}
					if (state.mode === MODE.IMAGE_TO_SKETCH && !state.styleImage) {
						return t("empty.styleImage", "请先上传款式图")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					state.mode === MODE.IMAGE_TO_SKETCH ? !state.styleImage : !state.sketchImage,
				validate: ({ state, helpers }) => {
					if (state.mode !== MODE.IMAGE_TO_SKETCH && !state.sketchImage) {
						return t("empty.sketchImage", "请先上传线稿图")
					}
					if (state.mode === MODE.IMAGE_TO_SKETCH && !state.styleImage) {
						return t("empty.styleImage", "请先上传款式图")
					}

					const referenceImages = getReferenceImages(state)
					const maxReferenceImages =
						helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ??
						referenceImages.length
					if (referenceImages.length > maxReferenceImages) {
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
				buildRequest: ({ state, helpers }) => {
					const selectedSize = helpers.getSelectedSize(state)
					const width = selectedSize.genW
					const height = selectedSize.genH
					const referenceImages = getReferenceImages(state)

					return {
						model_id: state.modelId,
						prompt: buildPrompt({
							state,
							locale: promptLocale,
						}),
						reference_images: helpers.collectReferenceIds(referenceImages),
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						width,
						height,
						count: state.genCount,
						select: false,
					}
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "服装线稿生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
