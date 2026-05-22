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
				productImages: [],
				modelImage: null,
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
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: t("section.products", "鞋履商品图"),
					help: t(
						"upload.productTip",
						"支持运动鞋、靴子、高跟鞋、平底鞋、凉鞋等，建议上传 1-2 张鞋履参考图。",
					),
					deps: ["modelImage", "modelId", "modelOptions"],
					addLabel: "+",
					alt: t("section.products", "鞋履商品图"),
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages =
							helpers.getSelectedModel(state)?.image_size_config
								?.max_reference_images ?? 2
						return Math.max(
							1,
							Math.min(14, maxReferenceImages - (state.modelImage ? 1 : 0)),
						)
					},
				},
				{
					id: "modelImage",
					kind: "image-slot",
					stateKey: "modelImage",
					title: t("section.model", "模特底图"),
					suffix: t("optional", "可选"),
					uploadLabel: t("upload.model", "点击上传带脚部/小腿的模特图"),
					alt: t("section.model", "模特底图"),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages =
							helpers.getSelectedModel(state)?.image_size_config
								?.max_reference_images ?? 2
						if (
							state.productImages.length + (state.modelImage ? 1 : 0) >=
							maxReferenceImages
						) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
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
					if (!state.productImages.length) {
						return t("empty.products", "请先上传至少 1 张鞋履商品图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.productImages.length,
				validate: ({ state, helpers }) => {
					if (!state.productImages.length) {
						return t("empty.products", "请先上传至少 1 张鞋履商品图")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
					if (!helpers.collectReferenceIds(getReferenceImages(state)).length) {
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
					const referenceImages = helpers.collectReferenceIds(getReferenceImages(state))
					const width = selectedSize.genW
					const height = selectedSize.genH

					return {
						model_id: state.modelId,
						prompt: buildBootsPrompt({
							generationMode: state.generationMode,
							productImages: state.productImages,
							hasModelImage: Boolean(state.modelImage),
						}),
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						reference_images: referenceImages,
						width,
						height,
						count: state.genCount,
						select: false,
					}
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "鞋履试穿图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function getReferenceImages(state) {
	return [...state.productImages, ...(state.modelImage ? [state.modelImage] : [])]
}

function buildBootsPrompt({ generationMode, productImages, hasModelImage }) {
	const referenceCount = productImages.length
	const references = Array.from(
		{ length: referenceCount },
		(_, index) => `reference image ${index + 1}`,
	).join(", ")
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[1]
	const modelGuidance = hasModelImage
		? "Match the pose, camera angle, leg position, scene, and lighting of the optional model reference image while keeping the focus on the shoes."
		: "Generate a clean commercial footwear try-on composition with natural foot posture, realistic stance, and clean framing."

	return (
		`Create a footwear try-on image using ${referenceCount} shoe reference image${referenceCount > 1 ? "s" : ""}: ${references}. ` +
		"Every visible shoe must match the reference product exactly in silhouette, color, material, texture, stitching, sole design, logo placement, and key hardware details. " +
		"The shoes must be worn naturally on the feet with convincing perspective, grounding shadow, contact with the surface, and anatomically correct foot placement. " +
		`${modelGuidance} ` +
		"Keep the image commercially usable, realistic, and focused on the footwear result. " +
		modeDefinition.promptSuffix
	)
}
