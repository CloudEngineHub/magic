/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

function createInitialState() {
	return {
		productImages: [],
		backgroundMode: "image",
		backgroundImage: null,
		backgroundPrompt: "",
		copyBackgroundImage: null,
		qualityMode: "",
		genCount: 1,
	}
}

function buildBackgroundModeOptions(t) {
	return [
		{
			value: "image",
			label: t("backgroundMode.image", "选择背景图"),
			description: t(
				"backgroundMode.image.desc",
				"上传单张背景图，识别商品后复用其环境、布光和场景布局。",
			),
		},
		{
			value: "copy",
			label: t("backgroundMode.copy", "复制背景"),
			description: t(
				"backgroundMode.copy.desc",
				"上传全场景参考图，识别商品后复用展示关系与背景语言，并替换其中原商品。",
			),
		},
		{
			value: "prompt",
			label: t("backgroundMode.prompt", "文生背景"),
			description: t(
				"backgroundMode.prompt.desc",
				"先识别商品，再用文字描述生成新的背景场景。",
			),
		},
	]
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 6
}

function getBackgroundReferenceCount(state) {
	if (state.backgroundMode === "image" && state.backgroundImage) return 1
	if (state.backgroundMode === "copy" && state.copyBackgroundImage) return 1
	return 0
}

function getReferenceAssetsForMode(state) {
	const assets = [...state.productImages]
	if (state.backgroundMode === "image" && state.backgroundImage) {
		assets.push(state.backgroundImage)
	}
	if (state.backgroundMode === "copy" && state.copyBackgroundImage) {
		assets.push(state.copyBackgroundImage)
	}
	return assets
}

function getReferenceAssetsForBaseImage(state, baseImage) {
	const assets = [baseImage]
	if (state.backgroundMode === "image" && state.backgroundImage) {
		assets.push(state.backgroundImage)
	}
	if (state.backgroundMode === "copy" && state.copyBackgroundImage) {
		assets.push(state.copyBackgroundImage)
	}
	return assets
}

function getQualitySetting(model) {
	return (model?.image_size_config?.image_settings ?? []).find((setting) => {
		const key = setting?.key ?? ""
		return (
			key === "quality" ||
			key === "image_generation_config.quality" ||
			key.endsWith(".quality")
		)
	})
}

function getQualityOptionsForModel(model) {
	const qualitySetting = getQualitySetting(model)
	return (qualitySetting?.options ?? [])
		.filter((option) => option?.value)
		.map((option) => ({
			value: option.value,
			label: option.label || option.value,
		}))
}

function getQualityOptions(state, helpers) {
	return getQualityOptionsForModel(helpers.getSelectedModel(state))
}

function resolveSelectedQualityValue(state, helpers) {
	const options = getQualityOptions(state, helpers)
	if (!options.length) return undefined
	return options.some((option) => option.value === state.qualityMode)
		? state.qualityMode
		: options[0].value
}

function buildProductBackgroundSwapRequest({
	state,
	helpers,
	baseImage,
	locale,
	selectedSize,
	count,
}) {
	const referenceAssets = getReferenceAssetsForBaseImage(state, baseImage)
	const referenceImages = helpers.collectReferenceIds(referenceAssets)
	const imageGenerationConfig = state.qualityMode
		? { ...state.imageGenerationConfig, quality: state.qualityMode }
		: state.imageGenerationConfig
	const width = selectedSize.genW
	const height = selectedSize.genH

	return {
		model_id: state.modelId,
		prompt: buildProductBackgroundSwapPrompt({
			backgroundMode: state.backgroundMode,
			backgroundPrompt: state.backgroundPrompt,
			locale,
			productImageCount: 1,
		}),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		image_generation_config: Object.keys(imageGenerationConfig ?? {}).length
			? imageGenerationConfig
			: undefined,
		width,
		height,
		count,
		select: false,
	}
}

function buildProductBackgroundSwapPrompt({
	backgroundMode,
	backgroundPrompt,
	locale,
	productImageCount,
}) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const productReferences = MagicPromptLocale.joinReferenceLabels(productImageCount, locale)
	const backgroundReference = MagicPromptLocale.getReferenceLabel(productImageCount + 1, locale)

	if (isChinese) {
		const productIdentityInstruction =
			`先读取 ${productImageCount} 张商品参考图：${productReferences}，识别商品类型、结构组成、轮廓比例、材质、颜色、图案细节、拍摄角度与摆放方向。` +
			"将这些商品参考图作为最终结果中商品主体的唯一来源，保持商品外观、结构细节、材质质感、颜色和方向一致，不要改成其他商品。"

		if (backgroundMode === "image") {
			return (
				`生成商品换背景图。${productIdentityInstruction}` +
				`${backgroundReference} 仅作为背景参考图，复用其环境、空间结构、景深层次、布光氛围、色彩基调和主要背景元素。` +
				"只替换背景与环境，不改变商品本体；保证商品与新背景的透视、接触阴影、反射关系和边缘融合自然一致。"
			)
		}

		if (backgroundMode === "prompt") {
			return (
				`生成商品换背景图。${productIdentityInstruction}` +
				`根据以下描述生成全新背景：${backgroundPrompt.trim()}。` +
				"只生成新的背景环境，不改变商品本体；保证最终画面的透视、光线、阴影、反射和氛围一致，让商品自然融入场景。"
			)
		}

		return (
			`生成商品换背景图。${productIdentityInstruction}` +
			`${backgroundReference} 是全场景复制参考图，可保留其中的人物主体、姿态、手持或穿着关系、构图、镜头视角、背景布局、空间深度、光线方向、色彩氛围和阴影表现。` +
			`先识别 ${backgroundReference} 中被展示、被穿戴或被持有的目标商品位置，再把其中原有商品替换为 ${productReferences} 定义的当前商品。` +
			"不要保留参考图里原商品或其它品牌商品的关键外观特征；最终画面中出现的商品只能来自当前商品图，并与人物或场景形成自然真实的融合。"
		)
	}

	const productIdentityInstruction =
		`First read ${productImageCount} product reference image${productImageCount > 1 ? "s" : ""}: ${productReferences}, and identify the product category, construction, silhouette, material, color, pattern details, camera angle, and placement direction. ` +
		"Use those product references as the ONLY source of the product in the final image. Preserve the product appearance, structure, material feel, color, and orientation. Do not turn it into a different product. "

	if (backgroundMode === "image") {
		return (
			`Create a product background swap image. ${productIdentityInstruction}` +
			`${backgroundReference} is ONLY a background reference. Reuse its environment, spatial structure, depth layering, lighting mood, color palette, and major background elements. ` +
			"Change only the background and environment while keeping the product itself unchanged. Ensure perspective, contact shadows, reflections, and edge blending stay coherent and natural."
		)
	}

	if (backgroundMode === "prompt") {
		return (
			`Create a product background swap image. ${productIdentityInstruction}` +
			`Generate a brand-new background based on this direction: ${backgroundPrompt.trim()}. ` +
			"Generate only the background environment while keeping the product itself unchanged. Make the final image consistent in perspective, lighting, shadow, reflection, and atmosphere so the product blends naturally into the scene."
		)
	}

	return (
		`Create a product background swap image. ${productIdentityInstruction}` +
		`${backgroundReference} is a full-scene copy reference. You may preserve the person, pose, hand-held or worn relationship, composition, camera view, background layout, spatial depth, lighting direction, color atmosphere, and shadow behavior from that reference. ` +
		`First locate the product being displayed, worn, or held inside ${backgroundReference}, then replace that original product with the current product defined by ${productReferences}. ` +
		"Do not keep the key appearance traits of the original product or any other brand product from the reference. The only product that may appear in the final image is the current product from the uploaded product image, integrated naturally with the subject and scene."
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

		return ctx.panel.render(root, {
			panelClassName: "product-background-swap",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
				mapModelDefaults(model, defaults) {
					const qualityOptions = getQualityOptionsForModel(model)
					const configuredQuality = defaults.imageGenerationConfig?.quality
					const qualityMode =
						configuredQuality &&
						qualityOptions.some((option) => option.value === configuredQuality)
							? configuredQuality
							: (qualityOptions[0]?.value ?? "")

					return {
						...defaults,
						qualityMode,
						imageGenerationConfig: qualityMode
							? { ...defaults.imageGenerationConfig, quality: qualityMode }
							: defaults.imageGenerationConfig,
					}
				},
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: t("section.productImages", "商品图"),
					required: true,
					help: t(
						"upload.productImageTip",
						"支持上传多张商品图，建议主体清晰、角度稳定，便于识别商品后完成换背景。",
					),
					deps: [
						"backgroundMode",
						"backgroundImage",
						"copyBackgroundImage",
						"modelId",
						"modelOptions",
					],
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const extraCount = getBackgroundReferenceCount(state)
						return Math.max(1, Math.min(10, maxReferenceImages - extraCount))
					},
				},
				{
					id: "backgroundMode",
					kind: "option-group",
					stateKey: "backgroundMode",
					title: t("section.backgroundMode", "选择背景"),
					variant: "card",
					descriptionMode: "inline",
					options: buildBackgroundModeOptions(t),
				},
				{
					id: "backgroundImage",
					kind: "image-slot",
					stateKey: "backgroundImage",
					deps: ["backgroundMode"],
					title: t("section.backgroundImage", "背景图"),
					required: true,
					uploadLabel: t("upload.backgroundImage", "点击上传单张背景图"),
					alt: t("section.backgroundImage", "背景图"),
					when: ({ state }) => state.backgroundMode === "image",
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const currentCount = getReferenceAssetsForMode(state).length
						if (!state.backgroundImage && currentCount >= maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "backgroundPrompt",
					kind: "textarea",
					stateKey: "backgroundPrompt",
					deps: ["backgroundMode"],
					title: t("section.backgroundPrompt", "背景描述"),
					required: true,
					placeholder: t(
						"placeholder.backgroundPrompt",
						"描述你想要生成的背景场景，例如：高级珠宝广告棚景、自然木质桌面布景、城市街头运动氛围。",
					),
					rows: 3,
					maxLength: 2000,
					when: ({ state }) => state.backgroundMode === "prompt",
				},
				{
					id: "copyBackgroundImage",
					kind: "image-slot",
					stateKey: "copyBackgroundImage",
					deps: ["backgroundMode"],
					title: t("section.copyBackgroundImage", "复制背景参考图"),
					required: true,
					uploadLabel: t("upload.copyBackgroundImage", "点击上传要复制背景的参考图"),
					alt: t("section.copyBackgroundImage", "复制背景参考图"),
					when: ({ state }) => state.backgroundMode === "copy",
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const currentCount = getReferenceAssetsForMode(state).length
						if (!state.copyBackgroundImage && currentCount >= maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "quality",
					kind: "option-group",
					stateKey: "qualityMode",
					title: t("section.quality", "生成配置"),
					deps: ["modelId", "modelOptions", "qualityMode"],
					when: ({ state, helpers }) =>
						Boolean(
							state.modelId && getQualitySetting(helpers.getSelectedModel(state)),
						),
					options: ({ state, helpers }) => getQualityOptions(state, helpers),
				},
				{
					id: "modelSelect",
					kind: "model-select",
					required: true,
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "resolution",
					kind: "resolution-select",
					required: true,
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "canvasSize",
					kind: "size-control",
					required: true,
					title: t("section.canvasSize", "画布尺寸"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成数量"),
					options: GENERATION_COUNT_GROUP_OPTIONS,
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成商品换背景图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					return ""
				},
				isDisabled: ({ state }) =>
					!state.productImages.length ||
					!state.backgroundMode ||
					(state.backgroundMode === "image" && !state.backgroundImage) ||
					(state.backgroundMode === "copy" && !state.copyBackgroundImage) ||
					(state.backgroundMode === "prompt" && !state.backgroundPrompt.trim()),
				validate: ({ state, helpers }) => {
					const selectedSize = helpers.getSelectedSize(state)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					const referenceAssets = getReferenceAssetsForMode(state)
					const referenceIds = helpers.collectReferenceIds(referenceAssets)
					if (referenceIds.length !== referenceAssets.length) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
						getQualityOptions(state, helpers).length &&
						!resolveSelectedQualityValue(state, helpers)
					) {
						return t("error.qualityUnavailable", "当前模型缺少可用清晰度配置")
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = helpers.getSelectedSize(state)
					if (state.productImages.length <= 1) {
						return generateAndPlace(
							buildProductBackgroundSwapRequest({
								state,
								helpers,
								baseImage: state.productImages[0],
								locale: promptLocale,
								selectedSize,
								count: state.genCount,
							}),
						)
					}

					const results = []
					for (let index = 0; index < state.genCount; index += 1) {
						const baseImage = state.productImages[index % state.productImages.length]
						results.push(
							await generateAndPlace(
								buildProductBackgroundSwapRequest({
									state,
									helpers,
									baseImage,
									locale: promptLocale,
									selectedSize,
									count: 1,
								}),
							),
						)
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "商品换背景图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
