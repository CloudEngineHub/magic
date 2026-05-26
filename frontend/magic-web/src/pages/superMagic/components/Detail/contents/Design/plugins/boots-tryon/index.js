/* global MagicPluginKit, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "fast",
		labelKey: "generationMode.fast",
		labelFallback: "快速模式",
		descriptionKey: "generationMode.fast.desc",
		descriptionFallback: "适合分辨率低于 2K 的全身图或低于 1K 的局部图，简单姿势。",
		promptSuffix:
			"Prioritize a fast, clean footwear try-on result for simple poses and lower-resolution references while preserving the shoe silhouette and key details.",
	},
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "适合分辨率高于 2K 的全身图或高于 1K 的局部图。",
		promptSuffix:
			"Generate a balanced footwear try-on result for standard production usage with stable realism and clean shoe fitting.",
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback:
			"适合分辨率高于 2K 的全身图或高于 1K 的局部图，且包含细密纹理复杂材质与复杂的姿势。",
		promptSuffix:
			"Optimize for high-detail footwear try-on with dense textures, complex materials, subtle highlights, shadows, and challenging foot or leg poses.",
	},
	{
		value: "pro",
		labelKey: "generationMode.pro",
		labelFallback: "专业模式",
		descriptionKey: "generationMode.pro.desc",
		descriptionFallback: "版型、材质还原效果更好。",
		promptSuffix:
			"Prioritize premium footwear fidelity, preserving the shoe shape, last proportions, material finish, construction details, and overall product accuracy as much as possible.",
	},
]

function getReferenceImages(state) {
	// Match UI upload order: product image first, then model images.
	return [state.productImage, ...state.modelImages].filter(Boolean)
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
}

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const generationModes = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "boots-tryon",
			initialState: {
				productImage: null,
				modelImages: [],
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
					id: "productImage",
					kind: "image-slot",
					stateKey: "productImage",
					title: t("section.products", "鞋履商品图"),
					uploadLabel: t("upload.product", "点击上传鞋履商品图"),
					help: t(
						"upload.productTip",
						"支持运动鞋、靴子、高跟鞋、平底鞋、凉鞋等，建议上传 1 张鞋履商品图。",
					),
					alt: t("section.products", "鞋履商品图"),
					beforePick: ({ state, helpers }) => {
						if (state.productImage) return null
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						if (!state.productImage && state.modelImages.length + 1 > maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "modelImages",
					kind: "image-grid",
					stateKey: "modelImages",
					title: t("section.model", "模特底图"),
					suffix: t("optional", "可选"),
					uploadLabel: t("upload.model", "点击上传带脚部/小腿的模特图"),
					alt: t("section.model", "模特底图"),
					help: t(
						"upload.model.help",
						"支持上传多张带脚部或小腿的模特图，便于按不同姿态分别生成鞋履试穿结果。",
					),
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const productCount = state.productImage ? 1 : 0
						return Math.max(1, Math.min(10, maxReferenceImages - productCount))
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
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "分辨率"),
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
				buttonLabel: `✨ ${t("button.generate", "生成鞋履试穿图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImage) {
						return t("empty.products", "请先上传鞋履商品图")
					}
					if (!state.modelImages.length) {
						return t("empty.models", "请先上传模特底图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.productImage || !state.modelImages.length,
				validate: ({ state, helpers }) => {
					if (!state.productImage) {
						return t("empty.products", "请先上传鞋履商品图")
					}

					if (!state.modelImages.length) {
						return t("empty.models", "请先上传模特底图")
					}

					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
					const referenceImages = getReferenceImages(state)
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
					const width = selectedSize.genW
					const height = selectedSize.genH

					if (state.modelImages.length <= 1) {
						return generateAndPlace(
							buildBootsRequest({
								state,
								helpers,
								modelImage: state.modelImages[0] ?? null,
								width,
								height,
								count: state.genCount,
							}),
						)
					}

					const results = []
					for (let index = 0; index < state.genCount; index += 1) {
						const modelImage = state.modelImages[index % state.modelImages.length]
						results.push(
							await generateAndPlace(
								buildBootsRequest({
									state,
									helpers,
									modelImage,
									width,
									height,
									count: 1,
								}),
							),
						)
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "鞋履试穿图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function getReferenceImagesForRequest(productImage, modelImage) {
	return [productImage, modelImage].filter(Boolean)
}

function buildBootsRequest({ state, helpers, modelImage, width, height, count }) {
	const referenceImages = helpers.collectReferenceIds(
		getReferenceImagesForRequest(state.productImage, modelImage),
	)

	return {
		model_id: state.modelId,
		prompt: buildBootsPrompt({
			generationMode: state.generationMode,
		}),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		reference_images: referenceImages,
		width,
		height,
		count,
		select: false,
	}
}

function buildBootsPrompt({ generationMode }) {
	const references = "reference image 1, reference image 2"
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[1]

	return (
		`Create a footwear try-on image using ${references}. Use reference image 1 as the only shoe product reference. ` +
		"Every visible shoe must match reference image 1 exactly in silhouette, color, material, texture, stitching, sole design, logo placement, and key hardware details. " +
		"The shoes must be worn naturally on the feet with convincing perspective, grounding shadow, contact with the surface, and anatomically correct foot placement. " +
		"Use reference image 2 as the model pose reference. Match its camera angle, leg position, scene, and lighting while keeping the focus on the shoes from reference image 1." +
		"Keep the image commercially usable, realistic, and focused on the footwear result. " +
		modeDefinition.promptSuffix
	)
}
