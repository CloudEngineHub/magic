/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

/* 展示样式 */
const DISPLAY_STYLE = {
	/* 平铺图 */
	FLAT: "flat",
	/* 人台图 */
	MANNEQUIN: "mannequin",
}

/* 换装模式 */
const GARMENT_MODE = {
	/* 换上下装 */
	SEPARATES: "separates",
	/* 换连体 */
	FULLBODY: "fullbody",
}

const DISPLAY_STYLE_OPTIONS = [
	{
		value: DISPLAY_STYLE.FLAT,
		labelKey: "displayStyle.flat",
		labelFallback: "平铺图",
		descriptionKey: "displayStyle.flat.desc",
		descriptionFallback: "服装平铺展示，干净白底",
	},
	{
		value: DISPLAY_STYLE.MANNEQUIN,
		labelKey: "displayStyle.mannequin",
		labelFallback: "人台图",
		descriptionKey: "displayStyle.mannequin.desc",
		descriptionFallback: "白色人台穿着展示",
	},
]

const GARMENT_MODE_OPTIONS = [
	{
		value: GARMENT_MODE.SEPARATES,
		labelKey: "garmentMode.separates",
		labelFallback: "换上下装",
	},
	{
		value: GARMENT_MODE.FULLBODY,
		labelKey: "garmentMode.fullbody",
		labelFallback: "换连体",
	},
]

const STYLE_SUFFIX = {
	[DISPLAY_STYLE.FLAT]: {
		zh: "平铺商品摄影，服装平铺在纯白背景上，俯视角度，干净摄影棚光线，无褶皱，高分辨率电商商品图。",
		en:
			"flat lay product photography, clothes laid flat on a pure white background, " +
			"top-down overhead shot, clean studio lighting, wrinkle-free, high resolution e-commerce product photo",
	},
	[DISPLAY_STYLE.MANNEQUIN]: {
		zh: "白色人台穿着展示，纯白背景，干净摄影棚光线，全身展示完整服装，高分辨率电商商品图。",
		en:
			"white mannequin wearing the clothing, pure white background, clean studio lighting, " +
			"full body shot showing entire garment, high resolution e-commerce product photo",
	},
}

function createInitialState() {
	return {
		displayStyle: DISPLAY_STYLE.FLAT,
		garmentMode: GARMENT_MODE.SEPARATES,
		topGarmentImage: null,
		bottomGarmentImage: null,
		fullbodyGarmentImage: null,
		poseReferenceImage: null,
		extra: "",
	}
}

function createBeforePickHandler(stateKey, t) {
	return ({ state, helpers }) => {
		const maxReferenceImages = getMaxReferenceImages(state, helpers)
		const currentCount = getReferenceImages(state).length
		if (!state[stateKey] && currentCount >= maxReferenceImages) {
			return t("error.referenceLimit", "参考图数量已达当前模型上限")
		}
		return null
	}
}

function getReferenceImages(state) {
	const garmentImages =
		state.garmentMode === GARMENT_MODE.FULLBODY
			? [state.fullbodyGarmentImage]
			: [state.topGarmentImage, state.bottomGarmentImage]
	const poseImages =
		state.displayStyle === DISPLAY_STYLE.MANNEQUIN ? [state.poseReferenceImage] : []
	return [...garmentImages, ...poseImages].filter(Boolean)
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 4
}

function buildExtraClause(extra, locale) {
	const normalizedExtra = String(extra ?? "").trim()
	if (!normalizedExtra) return ""
	return MagicPromptLocale.isChinese(locale)
		? `额外要求：${normalizedExtra}。`
		: `Additional requirements: ${normalizedExtra}. `
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) {
		return "用户当前未填写。"
	}
	return normalizedCurrentText
}

function getDisplayStyleLabel(displayStyle) {
	return (
		DISPLAY_STYLE_OPTIONS.find((item) => item.value === displayStyle)?.labelFallback ??
		DISPLAY_STYLE_OPTIONS[0].labelFallback
	)
}

function getGarmentModeLabel(garmentMode) {
	return (
		GARMENT_MODE_OPTIONS.find((item) => item.value === garmentMode)?.labelFallback ??
		GARMENT_MODE_OPTIONS[0].labelFallback
	)
}

function buildExtraPromptCompletionUserPrompt({
	displayStyle,
	garmentMode,
	hasTopGarment,
	hasBottomGarment,
	hasFullbodyGarment,
	hasPoseReference,
	currentText,
}) {
	const garmentSummary =
		garmentMode === GARMENT_MODE.FULLBODY
			? hasFullbodyGarment
				? "已上传全身 / 连体服饰图。"
				: "尚未上传全身 / 连体服饰图。"
			: [
					hasTopGarment ? "已上传上装。" : "未上传上装。",
					hasBottomGarment ? "已上传下装。" : "未上传下装。",
				].join("")
	const poseSummary =
		displayStyle === DISPLAY_STYLE.MANNEQUIN
			? hasPoseReference
				? "已上传姿势参考图，额外描述可补充姿态、人台比例或展示角度。"
				: "未上传姿势参考图，额外描述可补充人台姿态、身形比例和展示角度。"
			: "平铺图模式不需要模特或人台姿势。"

	return [
		"任务目标：为平铺/人台试衣插件的“额外描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		`当前成片类型：${getDisplayStyleLabel(displayStyle)}。`,
		`当前换装类型：${getGarmentModeLabel(garmentMode)}。${garmentSummary}${poseSummary}`,
		"补全方向：重点补充展示角度、光线、阴影、背景洁净度、服装平整度、陈列关系、姿态或人台比例。",
		"业务限制：不要改变服装颜色、图案、材质、logo、版型和关键结构；不要输出完整生成任务说明，只输出适合填入“额外描述”的短提示词。",
	].join("\n")
}

function buildSeparatesPrompt({
	displayStyle,
	hasTopGarment,
	hasBottomGarment,
	hasPoseReference,
	extra,
	locale,
}) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const styleSuffix = MagicPromptLocale.pickText(STYLE_SUFFIX[displayStyle], locale)
	const extraClause = buildExtraClause(extra, locale)
	const parts = []
	if (hasTopGarment) parts.push("top")
	if (hasBottomGarment) parts.push("bottom")
	const poseReferenceIndex = parts.length + 1

	if (isChinese) {
		if (displayStyle === DISPLAY_STYLE.FLAT) {
			if (hasTopGarment && hasBottomGarment) {
				return (
					"平铺商品摄影：将参考图 1 的上装放在参考图 2 的下装上方，二者平铺在纯白背景上，组合成完整套装。" +
					"每件服装都必须严格匹配其参考图中的颜色、图案、面料、纹理、版型和设计细节。" +
					"俯视角度，干净摄影棚光线，服装平整无褶皱，不出现模特或人台。" +
					extraClause +
					styleSuffix
				)
			}
			const garmentName = hasTopGarment ? "上装" : "下装"
			return (
				`平铺商品摄影：将参考图 1 的${garmentName}平铺在纯白背景上。` +
				"服装必须严格匹配参考图中的颜色、图案、面料、纹理、版型和设计细节。" +
				"俯视角度，干净摄影棚光线，服装平整无褶皱，不出现模特或人台。" +
				extraClause +
				styleSuffix
			)
		}

		const poseClause = hasPoseReference
			? `参考图 ${poseReferenceIndex} 是姿势和身形比例参考，用于生成人台的站姿、姿态和轮廓比例。`
			: ""
		if (hasTopGarment && hasBottomGarment) {
			return (
				"白色人台同时穿着参考图 1 的上装和参考图 2 的下装。" +
				"关键要求：两件服装都必须清晰可见，上装穿在人台上半身，下装穿在人台下半身。" +
				"每件服装都必须严格匹配其参考图中的颜色、图案、面料、纹理、版型和设计细节。" +
				poseClause +
				"纯白背景，全身展示，干净摄影棚光线。" +
				extraClause +
				styleSuffix
			)
		}
		const garmentName = hasTopGarment ? "上装" : "下装"
		const placement = hasTopGarment ? "上半身" : "下半身"
		return (
			`白色人台穿着参考图 1 的${garmentName}，服装位于人台${placement}。` +
			"服装必须严格匹配参考图中的颜色、图案、面料、纹理、版型和设计细节。" +
			poseClause +
			"纯白背景，全身展示，干净摄影棚光线。" +
			extraClause +
			styleSuffix
		)
	}

	const garmentDescriptions = parts
		.map((part, index) => `${part} garment (reference image ${index + 1})`)
		.join(" and ")
	if (displayStyle === DISPLAY_STYLE.FLAT) {
		if (hasTopGarment && hasBottomGarment) {
			return (
				"Flat lay product photography: top garment (reference image 1) placed above bottom garment (reference image 2), " +
				"both laid flat on a pure white background, arranged as a complete outfit set. " +
				"Each garment must exactly match its reference image in color, pattern, texture and design. " +
				"Top-down overhead shot, clean studio lighting, wrinkle-free, no model. " +
				extraClause +
				styleSuffix
			)
		}
		return (
			`Flat lay product photography: ${garmentDescriptions} laid flat on a pure white background. ` +
			"The garment must exactly match the reference image in color, pattern, texture and design. " +
			"Top-down overhead shot, clean studio lighting, wrinkle-free, no model. " +
			extraClause +
			styleSuffix
		)
	}

	const poseClause = hasPoseReference
		? `Use reference image ${poseReferenceIndex} as the pose and body proportion reference for the mannequin. Replicate its exact stance, posture and silhouette. `
		: ""
	if (hasTopGarment && hasBottomGarment) {
		return (
			"White mannequin wearing top garment (reference image 1) on upper body and bottom garment (reference image 2) on lower body simultaneously. " +
			"CRITICAL: Both garments must be clearly visible: the top item on the torso, the bottom item on the legs. " +
			"Each garment must exactly match its reference image in color, pattern, texture and design. " +
			poseClause +
			"Pure white background, full body shot, clean studio lighting. " +
			extraClause +
			styleSuffix
		)
	}
	const placement = hasTopGarment ? "on the upper body" : "on the lower body"
	return (
		`White mannequin wearing ${garmentDescriptions} ${placement}. ` +
		poseClause +
		"The garment must exactly match the reference image in color, pattern, texture and design. " +
		"Pure white background, full body shot, clean studio lighting. " +
		extraClause +
		styleSuffix
	)
}

function buildFullbodyPrompt({ displayStyle, hasPoseReference, extra, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const styleSuffix = MagicPromptLocale.pickText(STYLE_SUFFIX[displayStyle], locale)
	const extraClause = buildExtraClause(extra, locale)

	if (isChinese) {
		if (displayStyle === DISPLAY_STYLE.FLAT) {
			return (
				"平铺商品摄影：将参考图 1 的全身 / 连体服饰平铺在纯白背景上。" +
				"服装必须严格匹配参考图中的颜色、图案、面料、纹理、版型和设计细节。" +
				"俯视角度，干净摄影棚光线，服装平整无褶皱，不出现模特或人台。" +
				extraClause +
				styleSuffix
			)
		}
		const poseClause = hasPoseReference
			? "参考图 2 是姿势和身形比例参考，用于生成人台的站姿、姿态和轮廓比例。"
			: ""
		return (
			"白色人台穿着参考图 1 的全身 / 连体服饰。" +
			poseClause +
			"服装必须严格匹配参考图中的颜色、图案、面料、纹理、版型和设计细节。" +
			"纯白背景，全身展示，干净摄影棚光线。" +
			extraClause +
			styleSuffix
		)
	}

	if (displayStyle === DISPLAY_STYLE.FLAT) {
		return (
			"Flat lay product photography: full-body garment (reference image 1) laid flat on a pure white background. " +
			"The garment must exactly match the reference image in color, pattern, texture and design. " +
			"Top-down overhead shot, clean studio lighting, wrinkle-free, no model. " +
			extraClause +
			styleSuffix
		)
	}
	const poseClause = hasPoseReference
		? "Use reference image 2 as the pose and body proportion reference for the mannequin. Replicate its exact stance, posture and silhouette. "
		: ""
	return (
		"White mannequin wearing the full-body garment (reference image 1). " +
		poseClause +
		"The garment must exactly match the reference image in color, pattern, texture and design. " +
		"Pure white background, full body shot, clean studio lighting. " +
		extraClause +
		styleSuffix
	)
}

function buildDressUpTryOnPrompt({ state, locale }) {
	if (state.garmentMode === GARMENT_MODE.FULLBODY) {
		return buildFullbodyPrompt({
			displayStyle: state.displayStyle,
			hasPoseReference: Boolean(state.poseReferenceImage),
			extra: state.extra,
			locale,
		})
	}

	return buildSeparatesPrompt({
		displayStyle: state.displayStyle,
		hasTopGarment: Boolean(state.topGarmentImage),
		hasBottomGarment: Boolean(state.bottomGarmentImage),
		hasPoseReference: Boolean(state.poseReferenceImage),
		extra: state.extra,
		locale,
	})
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
		const displayStyleOptions = DISPLAY_STYLE_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))
		const garmentModes = GARMENT_MODE_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: item.descriptionKey
				? t(item.descriptionKey, item.descriptionFallback)
				: undefined,
		}))

		return ctx.panel.render(root, {
			panelClassName: "dress-up-tryon",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "displayStyle",
					kind: "tabs",
					stateKey: "displayStyle",
					tabsClassName: "dress-up-tryon-tabs",
					options: displayStyleOptions,
				},
				{
					id: "garmentMode",
					kind: "tabs",
					stateKey: "garmentMode",
					tabsClassName: "dress-up-tryon-tabs",
					options: garmentModes,
				},
				{
					id: "topGarmentImage",
					kind: "image-slot",
					stateKey: "topGarmentImage",
					title: t("section.topGarmentImage", "上装"),
					uploadLabel: t("upload.topGarmentImage", "点击上传上装"),
					alt: t("section.topGarmentImage", "上装"),
					deps: ["garmentMode"],
					when: ({ state }) => state.garmentMode === GARMENT_MODE.SEPARATES,
					beforePick: createBeforePickHandler("topGarmentImage", t),
				},
				{
					id: "bottomGarmentImage",
					kind: "image-slot",
					stateKey: "bottomGarmentImage",
					title: t("section.bottomGarmentImage", "下装"),
					uploadLabel: t("upload.bottomGarmentImage", "点击上传下装"),
					alt: t("section.bottomGarmentImage", "下装"),
					deps: ["garmentMode"],
					when: ({ state }) => state.garmentMode === GARMENT_MODE.SEPARATES,
					beforePick: createBeforePickHandler("bottomGarmentImage", t),
					help: `${t("tip.separates", "上装或下装至少提供其一")}\n${t("tip.garment", "款式图上传无遮挡、无褶皱，生成效果更好～")}`,
				},
				{
					id: "fullbodyGarmentImage",
					kind: "image-slot",
					stateKey: "fullbodyGarmentImage",
					title: t("section.fullbodyGarmentImage", "全身 / 连体"),
					required: true,
					uploadLabel: t("upload.fullbodyGarmentImage", "点击上传全身 / 连体"),
					alt: t("section.fullbodyGarmentImage", "全身 / 连体"),
					deps: ["garmentMode"],
					help: t("tip.garment", "款式图上传无遮挡、无褶皱，生成效果更好～"),
					when: ({ state }) => state.garmentMode === GARMENT_MODE.FULLBODY,
					beforePick: createBeforePickHandler("fullbodyGarmentImage", t),
				},
				{
					id: "poseReferenceImage",
					kind: "image-slot",
					stateKey: "poseReferenceImage",
					title: t("section.poseReferenceImage", "姿势参考图"),
					uploadLabel: t("upload.poseReferenceImage", "点击上传（可参考模特姿势与身形）"),
					alt: t("section.poseReferenceImage", "姿势参考图"),
					help: t(
						"upload.poseReferenceImage.help",
						"提供模特姿势图，AI 将参考其姿态与身形比例来生成人台",
					),
					deps: ["displayStyle"],
					when: ({ state }) => state.displayStyle === DISPLAY_STYLE.MANNEQUIN,
					beforePick: createBeforePickHandler("poseReferenceImage", t),
				},
				{
					id: "extra",
					kind: "textarea",
					stateKey: "extra",
					title: t("section.extra", "额外描述"),
					placeholder: t("extra.placeholder", "例如：增加阴影效果、俯视角度、暖色调…"),
					deps: [
						"displayStyle",
						"garmentMode",
						"topGarmentImage",
						"bottomGarmentImage",
						"fullbodyGarmentImage",
						"poseReferenceImage",
					],
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !getReferenceImages(state).length,
						completeImagePrompt: {
							referenceImages: ({ state }) => getReferenceImages(state),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									displayStyle: state.displayStyle,
									garmentMode: state.garmentMode,
									hasTopGarment: Boolean(state.topGarmentImage),
									hasBottomGarment: Boolean(state.bottomGarmentImage),
									hasFullbodyGarment: Boolean(state.fullbodyGarmentImage),
									hasPoseReference: Boolean(state.poseReferenceImage),
									currentText: state.extra,
								}),
						},
					},
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
				buttonLabel: `✨ ${t("button.generate", "一键生成")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (
						state.garmentMode === GARMENT_MODE.SEPARATES &&
						!state.topGarmentImage &&
						!state.bottomGarmentImage
					) {
						return t("empty.separatesGarmentImage", "请至少上传上装或下装")
					}
					if (
						state.garmentMode === GARMENT_MODE.FULLBODY &&
						!state.fullbodyGarmentImage
					) {
						return t("empty.fullbodyGarmentImage", "请上传全身 / 连体图")
					}
					return ""
				},
				isDisabled: ({ state }) => {
					if (state.garmentMode === GARMENT_MODE.SEPARATES) {
						return !state.topGarmentImage && !state.bottomGarmentImage
					}
					return !state.fullbodyGarmentImage
				},
				validate: ({ state, helpers }) => {
					const referenceImages = getReferenceImages(state)
					if (
						helpers.collectReferenceIds(referenceImages).length !==
						referenceImages.length
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (referenceImages.length > getMaxReferenceImages(state, helpers)) {
						return t("error.referenceLimit", "参考图数量已达当前模型上限")
					}
					const selectedSize = helpers.getSelectedSize(state)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					return null
				},
				buildRequest: ({ state, helpers }) => {
					const selectedSize = helpers.getSelectedSize(state)
					const referenceImages = helpers.collectReferenceIds(getReferenceImages(state))
					const width = selectedSize.genW
					const height = selectedSize.genH

					return {
						model_id: state.modelId,
						prompt: buildDressUpTryOnPrompt({
							state,
							locale: promptLocale,
						}),
						reference_images: referenceImages,
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						width,
						height,
						count: state.genCount,
						select: false,
					}
				},
			},
		})
	},
})
