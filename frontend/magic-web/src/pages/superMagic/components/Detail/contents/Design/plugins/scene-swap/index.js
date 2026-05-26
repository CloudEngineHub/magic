/* global MagicPluginKit, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "scene-swap",
			initialState: {
				modelImages: [],
				backgroundMode: "image",
				backgroundImage: null,
				backgroundPrompt: "",
				copyBackgroundImage: null,
				canvasRatioKey: "",
				qualityMode: "",
				genCount: 1,
			},
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

					const seenRatios = new Set()
					const firstRatio = (model?.image_size_config?.sizes ?? []).find((size) => {
						if (!size.label || seenRatios.has(size.label)) return false
						seenRatios.add(size.label)
						return true
					})

					return {
						...defaults,
						qualityMode,
						canvasRatioKey: firstRatio?.label ?? "",
						imageGenerationConfig: qualityMode
							? { ...defaults.imageGenerationConfig, quality: qualityMode }
							: defaults.imageGenerationConfig,
					}
				},
			},
			sections: [
				{
					id: "modelImages",
					kind: "image-grid",
					stateKey: "modelImages",
					title: t("section.modelImages", "模特图"),
					help: t(
						"upload.modelImageTip",
						"支持上传多张模特图，建议主体清晰、姿态稳定，便于换景生成。",
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
					placeholder: t(
						"placeholder.backgroundPrompt",
						"描述你想要生成的背景场景，例如：高级服装广告棚景，暖色调橱窗光，城市街道夜景。",
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
					id: "canvasSize",
					kind: "size-control",
					title: t("section.canvasSize", "画布尺寸"),
					ratioStateKey: "canvasRatioKey",
					deps: ["backgroundMode", "modelId", "modelOptions"],
					when: ({ state }) => state.backgroundMode === "copy",
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
					title: t("section.modelSelect", "AI 模型"),
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
				buttonLabel: `✨ ${t("button.generate", "生成模拍换景图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.modelImages.length) {
						return t("empty.modelImages", "请先上传至少 1 张模特图")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.modelImages.length ||
					!state.backgroundMode ||
					(state.backgroundMode === "image" && !state.backgroundImage) ||
					(state.backgroundMode === "copy" && !state.copyBackgroundImage) ||
					(state.backgroundMode === "prompt" && !state.backgroundPrompt.trim()),
				validate: ({ state, helpers }) => {
					if (!state.modelImages.length) {
						return t("empty.modelImages", "请先上传至少 1 张模特图")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
					if (state.backgroundMode === "image" && !state.backgroundImage) {
						return t("error.backgroundImageRequired", "请选择背景图")
					}
					if (state.backgroundMode === "prompt" && !state.backgroundPrompt.trim()) {
						return t("error.backgroundPromptRequired", "请输入背景描述")
					}
					if (state.backgroundMode === "copy" && !state.copyBackgroundImage) {
						return t("error.copyBackgroundRequired", "请选择复制背景参考图")
					}
					const selectedSize = resolveOutputSize(state, helpers)
					if (!selectedSize?.width || !selectedSize?.height) {
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
					const selectedSize = resolveOutputSize(state, helpers)
					if (state.modelImages.length <= 1) {
						return generateAndPlace(
							buildSceneSwapRequest({
								state,
								helpers,
								baseImage: state.modelImages[0],
								selectedSize,
								count: state.genCount,
							}),
						)
					}

					const results = []
					for (let index = 0; index < state.genCount; index += 1) {
						const baseImage = state.modelImages[index % state.modelImages.length]
						results.push(
							await generateAndPlace(
								buildSceneSwapRequest({
									state,
									helpers,
									baseImage,
									selectedSize,
									count: 1,
								}),
							),
						)
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "模拍换景图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function buildBackgroundModeOptions(t) {
	return [
		{
			value: "image",
			label: t("backgroundMode.image", "选择背景图"),
			description: t(
				"backgroundMode.image.desc",
				"上传单张背景图，直接参考其环境、布光和场景布局。",
			),
		},
		{
			value: "copy",
			label: t("backgroundMode.copy", "复制背景"),
			description: t(
				"backgroundMode.copy.desc",
				"上传参考图复制其背景语言，并选择画布比例。",
			),
		},
		{
			value: "prompt",
			label: t("backgroundMode.prompt", "文生背景"),
			description: t(
				"backgroundMode.prompt.desc",
				"用文字描述生成新的背景场景，适合快速试不同氛围。",
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
	const assets = [...state.modelImages]
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

function parseSizeValue(sizeValue) {
	const [width, height] = String(sizeValue ?? "")
		.split("x")
		.map(Number)
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null
	}
	return { width, height }
}

function resolveOutputSize(state, helpers) {
	const sizes = helpers
		.getModelSizes(state)
		.map((size) => {
			const parsedSize = parseSizeValue(size.value)
			if (!parsedSize) return null
			return {
				label: size.label,
				scale: size.scale,
				width: parsedSize.width,
				height: parsedSize.height,
			}
		})
		.filter(Boolean)

	if (!sizes.length) return null

	if (state.backgroundMode !== "copy") {
		const selectedSize = helpers.getSelectedSize(state)
		if (selectedSize?.genW && selectedSize?.genH) {
			return {
				label: selectedSize.label,
				scale: selectedSize.scale,
				width: selectedSize.genW,
				height: selectedSize.genH,
			}
		}
		return sizes[0]
	}

	const ratioKey = state.canvasRatioKey || null
	const matchedSizes = ratioKey ? sizes.filter((size) => size.label === ratioKey) : sizes
	return matchedSizes[0] ?? sizes[0]
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

function buildSceneSwapRequest({ state, helpers, baseImage, selectedSize, count }) {
	const referenceAssets = getReferenceAssetsForBaseImage(state, baseImage)
	const referenceImages = helpers.collectReferenceIds(referenceAssets)
	const imageGenerationConfig = state.qualityMode
		? { ...state.imageGenerationConfig, quality: state.qualityMode }
		: state.imageGenerationConfig

	return {
		model_id: state.modelId,
		prompt: buildSceneSwapPrompt({
			backgroundMode: state.backgroundMode,
			backgroundPrompt: state.backgroundPrompt,
			modelImageCount: 1,
		}),
		reference_images: referenceImages,
		size: `${selectedSize.width}x${selectedSize.height}`,
		resolution: selectedSize.scale || undefined,
		image_generation_config: Object.keys(imageGenerationConfig ?? {}).length
			? imageGenerationConfig
			: undefined,
		width: selectedSize.width,
		height: selectedSize.height,
		count,
		select: false,
	}
}

function buildReferenceLabelList(count) {
	return Array.from({ length: count }, (_, index) => `reference image ${index + 1}`).join(", ")
}

function buildSceneSwapPrompt({ backgroundMode, backgroundPrompt, modelImageCount }) {
	const modelReferences = buildReferenceLabelList(modelImageCount)
	const backgroundReference = `reference image ${modelImageCount + 1}`

	if (backgroundMode === "image") {
		return (
			`Create a commercial fashion scene swap result using ${modelImageCount} model reference image${modelImageCount > 1 ? "s" : ""}: ${modelReferences}. ` +
			"Preserve the person identity, outfit, pose, proportions, and overall fashion-shoot realism from the model references. " +
			`Replace the environment so it follows ${backgroundReference}, reusing its scene structure, depth, lighting mood, color palette, and major background elements while keeping the subject clean and realistic.`
		)
	}

	if (backgroundMode === "prompt") {
		return (
			`Create a commercial fashion scene swap result using ${modelImageCount} model reference image${modelImageCount > 1 ? "s" : ""}: ${modelReferences}. ` +
			"Preserve the person identity, outfit, pose, proportions, and fashion photography realism from the model references. " +
			`Generate a brand-new background based on this direction: ${backgroundPrompt.trim()}. ` +
			"Make the final scene coherent in perspective, lighting, shadow, and atmosphere while keeping the person prominent."
		)
	}

	return (
		`Create a commercial fashion scene swap result. Use ${modelImageCount} model reference image${modelImageCount > 1 ? "s" : ""} (${modelReferences}) as the ONLY source for the person: preserve identity, outfit, pose, body proportions, and fashion-shoot realism from those images. ` +
		`${backgroundReference} is a full-scene style reference used ONLY for background extraction. Extract and reuse its environment, scene layout, background objects, depth, perspective, lighting direction, color grading, shadow behavior, and overall atmosphere. ` +
		`Do NOT copy the person, face, body, pose, clothing, or identity from ${backgroundReference}. Do NOT merge or duplicate any subject from ${backgroundReference} into the final image. ` +
		`Composite the model from ${modelReferences} naturally into a new background inspired by ${backgroundReference}, with coherent lighting, contact shadows, and clean edge blending.`
	)
}
