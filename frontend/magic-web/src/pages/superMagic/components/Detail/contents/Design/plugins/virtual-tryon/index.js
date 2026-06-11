/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const MAX_GARMENTS = 5
const STYLE_OPTIONS = [
	{
		value: "realistic",
		labelKey: "style.realistic",
		labelFallback: "写实",
		descriptionKey: "style.realistic.desc",
		descriptionFallback: "自然真实的穿搭效果",
		promptSuffix: {
			zh: "自然真实的商业摄影效果，光线可信，成片质感高级。",
			en: "realistic fashion photography, natural lighting, believable styling, premium commercial finish",
		},
	},
	{
		value: "fashion",
		labelKey: "style.fashion",
		labelFallback: "时尚大片",
		descriptionKey: "style.fashion.desc",
		descriptionFallback: "杂志级别的时尚感",
		promptSuffix: {
			zh: "时尚大片风格，具备更强的编辑感、造型感和商业视觉张力。",
			en: "fashion magazine editorial style, stronger visual impact, elevated styling, high-end campaign photography",
		},
	},
	{
		value: "ecommerce",
		labelKey: "style.ecommerce",
		labelFallback: "电商白底",
		descriptionKey: "style.ecommerce.desc",
		descriptionFallback: "纯白背景，适合上架",
		promptSuffix: {
			zh: "纯白背景与干净棚拍光线，适合电商陈列与商品展示。",
			en: "pure white background, clean studio lighting, e-commerce ready product presentation",
		},
	},
	{
		value: "preserve",
		labelKey: "style.preserve",
		labelFallback: "保留原图",
		descriptionKey: "style.preserve.desc",
		descriptionFallback: "保持模特底图的场景与风格",
		promptSuffix: {
			zh: "完整保留模特底图的场景、背景、光线、色调和拍摄风格，只自然替换上身商品。",
			en: "preserve the exact scene, background, lighting, color grading, and photographic style of the reference model image, changing only the worn products naturally",
		},
	},
]

function createInitialState() {
	return {
		garments: [],
		modelImage: null,
		extra: "",
		style: "realistic",
		genCount: 1,
	}
}

function getReferenceImages(state) {
	return [...state.garments, state.modelImage].filter(Boolean)
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? MAX_GARMENTS
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) {
		return "用户当前未填写。"
	}

	return normalizedCurrentText
}

function getStyleLabel(style) {
	return (
		STYLE_OPTIONS.find((item) => item.value === style)?.labelFallback ??
		STYLE_OPTIONS[0].labelFallback
	)
}

function buildExtraPromptCompletionUserPrompt({
	garmentCount,
	hasModelImage,
	style,
	currentText,
}) {
	return [
		"任务目标：为万物上身插件的“额外描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		`参考图角色：共有 ${garmentCount} 张商品图，用于理解服装、鞋靴、帽子、包袋、配饰等商品的类型、颜色、材质、廓形和商业气质。${hasModelImage ? "另有 1 张模特底图，需要保留人物、姿态、场景和摄影风格。" : "当前没有模特底图，需要描述适合商品展示的模特与场景。"} `,
		`当前风格：${getStyleLabel(style)}。`,
		"补全方向：重点补充模特特征、姿态、拍摄场景、光线、色调、镜头距离、构图，以及商品穿戴和陈列关系。",
		"业务限制：不要改变商品本身颜色、款式、logo、图案、材质和关键结构；不要描述商品之间遗漏、合并或替换；不要输出完整生成任务说明，只输出适合填入“额外描述”的短提示词。",
	].join("\n")
}

function buildPrompt({ garmentCount, hasModelImage, style, extra, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const productReferences = MagicPromptLocale.joinReferenceLabels(garmentCount, locale)
	const modelReference = hasModelImage
		? MagicPromptLocale.getReferenceLabel(garmentCount + 1, locale)
		: null
	const styleDefinition = STYLE_OPTIONS.find((item) => item.value === style) ?? STYLE_OPTIONS[0]
	const styleSuffix =
		styleDefinition.value === "preserve" && !hasModelImage
			? MagicPromptLocale.pickText(STYLE_OPTIONS[0].promptSuffix, locale)
			: MagicPromptLocale.pickText(styleDefinition.promptSuffix, locale)
	const normalizedExtra = extra?.trim()

	if (isChinese) {
		const extraClause = normalizedExtra ? `额外要求：${normalizedExtra}。` : ""
		const basePrompt =
			`使用${productReferences}中的全部商品图生成同一张商业模特穿搭图。` +
			`所有${garmentCount}件商品都必须同时完整出现在结果里，不能遗漏、替换、合并，或只保留局部。` +
			"根据商品类型做自然穿搭：外套应穿在内搭外层，帽子应佩戴在头部，鞋履应穿在脚上，包袋应以手提、肩背或自然摆放方式合理呈现。" +
			`每件商品都必须严格匹配其参考图中的颜色、图案、材质、纹理、廓形与关键设计细节。`

		const modelClause = modelReference
			? `${modelReference}是模特底图。保留它的人物身份、体型、发型、场景、背景、光线、镜头视角与整体摄影风格，只自然替换穿搭商品。`
			: "如果没有模特底图，请生成一位适合商业服饰展示的单人模特，并确保所有商品都清晰可见。"

		return (
			basePrompt +
			modelClause +
			"输出必须是单人全身或足够展示全部商品的构图，保持真实比例、自然穿着关系和商业可用完成度。" +
			extraClause +
			styleSuffix
		)
	}

	const extraClause = normalizedExtra ? `Additional requirements: ${normalizedExtra}. ` : ""
	const basePrompt =
		`Create one commercial fashion try-on image using ALL product references from ${productReferences}. ` +
		`All ${garmentCount} item${garmentCount > 1 ? "s" : ""} must appear together in the same final image with no omission, substitution, merging, or partial-only rendering. ` +
		"Dress the items naturally according to category: outerwear should layer over inner garments, hats should be worn on the head, shoes on the feet, and bags carried or placed in a believable way. " +
		"Each item must match its reference exactly in color, pattern, material, texture, silhouette, and key design details. "

	const modelClause = modelReference
		? `Use ${modelReference} as the optional model base image. Preserve that person's identity, body type, hairstyle, scene, background, lighting, camera angle, and overall photographic style while replacing only the worn products naturally. `
		: "If no model base image is provided, generate a single fashion model suitable for commercial apparel display and make every product clearly visible. "

	return (
		basePrompt +
		modelClause +
		"The output must remain a single-person composition with believable proportions, natural wear relationships, and commercially usable polish. " +
		extraClause +
		styleSuffix
	)
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
		const styleOptions = STYLE_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return ctx.panel.render(root, {
			panelClassName: "virtual-tryon",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "garments",
					kind: "image-grid",
					stateKey: "garments",
					title: t("section.garments", "商品图"),
					required: true,
					alt: t("section.garments", "商品图"),
					addLabel: "+",
					help: t(
						"upload.garmentTip",
						"支持上衣、外套、裤子、裙子、鞋靴、帽子、包包等，AI 会自动识别并正确叠穿。",
					),
					maxCount: ({ state, helpers }) => {
						const modelCount = state.modelImage ? 1 : 0
						return Math.max(
							0,
							Math.min(
								MAX_GARMENTS,
								getMaxReferenceImages(state, helpers) - modelCount,
							),
						)
					},
				},
				{
					id: "modelImage",
					kind: "image-slot",
					stateKey: "modelImage",
					title: t("section.model", "模特底图"),
					uploadLabel: t("upload.model", "点击上传（不上传则 AI 自动生成模特）"),
					alt: t("section.model", "模特底图"),
					beforePick: ({ state, helpers }) => {
						if (state.modelImage) return null
						if (state.garments.length + 1 > getMaxReferenceImages(state, helpers)) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "extra",
					kind: "textarea",
					stateKey: "extra",
					title: t("section.extra", "额外描述"),
					placeholder: t(
						"extra.placeholder",
						"指定模特特征、场景、色调、风格等，例如：亚洲女性模特，25岁，身材高挑，站在时尚街头，暖色调，胶片感",
					),
					deps: ["garments", "modelImage", "style"],
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.garments?.length,
						completeImagePrompt: {
							referenceImages: ({ state }) => getReferenceImages(state),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									garmentCount: state.garments.length,
									hasModelImage: Boolean(state.modelImage),
									style: state.style,
									currentText: state.extra,
								}),
						},
					},
				},
				{
					id: "style",
					kind: "option-group",
					stateKey: "style",
					title: t("section.style", "风格"),
					showDescriptionOnHover: true,
					groupClassName: "virtual-tryon-style-grid",
					options: styleOptions,
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
				buttonLabel: `✨ ${t("button.generate", "一键生成穿搭图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					return ""
				},
				isDisabled: ({ state }) => !state.garments.length,
				validate: ({ state, helpers }) => {
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
				buildRequest: ({ state, helpers }) => {
					const selectedSize = helpers.getSelectedSize(state)
					const width = selectedSize.genW
					const height = selectedSize.genH
					const referenceImages = helpers.collectReferenceIds(getReferenceImages(state))

					return {
						model_id: state.modelId,
						prompt: buildPrompt({
							garmentCount: state.garments.length,
							hasModelImage: Boolean(state.modelImage),
							style: state.style,
							extra: state.extra,
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
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "穿搭图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
