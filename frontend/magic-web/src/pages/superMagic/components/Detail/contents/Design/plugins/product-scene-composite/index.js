/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "平衡生成效率与真实场景商拍完成度。",
		promptSuffix: {
			zh: "保持真实自然、商业可用的商品场景融合效果。",
			en: "Keep the result realistic, commercially usable, and naturally integrated into the scene.",
		},
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback: "增强材质细节、边缘融合、空间真实感与商业成片质感。",
		promptSuffix: {
			zh: "增强商品材质纹理、边缘融合、接触阴影、反射、高光、空间透视与环境光一致性，使结果更具真实商拍质感与营销成片表现。",
			en: "Enhance material texture, edge blending, contact shadows, reflections, highlights, spatial perspective, and environmental lighting consistency so the result feels more premium, realistic, and campaign-ready.",
		},
	},
]

function createInitialState() {
	return {
		productImage: null,
		sceneImages: [],
		generationMode: "standard",
	}
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 6
}

function resolveSceneRequestSize(sceneImage, state, helpers) {
	const fallbackSize = helpers.getSelectedSize(state)
	if (!sceneImage?.width || !sceneImage?.height) {
		return fallbackSize
	}

	const targetRatio = sceneImage.width / sceneImage.height
	const candidateSizes = helpers.getVisibleSizes(state)
	let bestMatch = null

	for (const size of candidateSizes) {
		const parsedSize = helpers.parseSizeValue(size.value)
		if (!parsedSize?.width || !parsedSize?.height) continue
		const candidateRatio = parsedSize.width / parsedSize.height
		const score = Math.abs(candidateRatio - targetRatio)

		if (!bestMatch || score < bestMatch.score) {
			bestMatch = {
				...size,
				genW: parsedSize.width,
				genH: parsedSize.height,
				score,
			}
		}
	}

	return bestMatch || fallbackSize
}

function buildSceneCompositeRequests({ state, helpers, locale }) {
	const productReferenceId = helpers.collectReferenceIds([state.productImage])[0]
	const sceneReferenceIds = helpers.collectReferenceIds(state.sceneImages)

	return sceneReferenceIds.map((sceneReferenceId, index) => {
		const sceneImage = state.sceneImages[index]
		const selectedSize = resolveSceneRequestSize(sceneImage, state, helpers)
		return buildProductSceneCompositeRequest({
			state,
			helpers,
			locale,
			selectedSize,
			referenceImages: [productReferenceId, sceneReferenceId],
			count: state.genCount,
			select: index === sceneReferenceIds.length - 1,
		})
	})
}

function buildProductSceneCompositeRequest({
	state,
	helpers,
	locale,
	selectedSize,
	referenceImages,
	count,
	select,
}) {
	const width = selectedSize.genW
	const height = selectedSize.genH

	return {
		model_id: state.modelId,
		prompt: buildProductSceneCompositePrompt({
			generationMode: state.generationMode,
			locale,
		}),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count,
		select: select ?? false,
	}
}

function buildProductSceneCompositePrompt({ generationMode, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const modeSuffix = MagicPromptLocale.pickText(
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode)?.promptSuffix ??
			GENERATION_MODE_DEFINITIONS[0].promptSuffix,
		locale,
	)

	if (isChinese) {
		return (
			"先读取参考图 1，并从中准确识别、提取需要处理的商品主体。参考图 1 是最终结果中商品主体的唯一来源，必须严格保留商品原本的颜色、图案、材质、纹理、结构、轮廓、比例、摆放方向与关键设计细节，不得替换商品、改变结构，也不得混入其他商品内容。" +
			"参考图 2 仅作为真实场景参考，不提供新的商品主体信息。参考图 2 只能定义环境氛围、空间结构、构图、布光、镜头语言、背景层次、陈列关系与真实感来源，不能影响商品主体本身。" +
			"需要将参考图 1 中的商品自然融入参考图 2 所体现的真实场景中，使其呈现为完整的 AI 商拍图。允许根据场景生成合理的接触阴影、反射、高光、透视、边缘融合、局部遮挡与环境光影响，但最终结果中的商品仍必须被明确识别为参考图 1 中的同一件商品，只改变场景融合效果，不改变商品本身。" +
			"不要复制或继承参考图 2 中的其他商品、人物、品牌元素、文字、水印或无关道具主体；只学习场景表达方式，不继承其中的商品内容。" +
			modeSuffix
		)
	}

	return (
		"First read reference image 1 and accurately identify and extract the target product subject from it. Reference image 1 is the ONLY source of the product in the final result. You must strictly preserve the product's original color, pattern, material, texture, construction, silhouette, proportions, placement direction, and key design details. Do not replace the product, alter its structure, or mix in any other product content. " +
		"Reference image 2 is only a real-scene reference and provides no new product-subject information. It may define only the environment mood, spatial structure, composition, lighting, camera language, background layering, display relationship, and realism source, and it must not affect the product subject itself. " +
		"You need to integrate the product from reference image 1 naturally into the real scene conveyed by reference image 2 so the output becomes a complete AI commercial product shot. You may generate reasonable contact shadows, reflections, highlights, perspective alignment, edge blending, local occlusion, and environmental light interaction, but the product in the final result must still be clearly recognizable as the same product from reference image 1. Change only the scene integration, not the product itself. " +
		"Do not copy or inherit any other product, person, brand element, text, watermark, or irrelevant prop subject from reference image 2. Learn only the scene expression method, not the product content inside it. " +
		modeSuffix
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
		const generationModeOptions = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return ctx.panel.render(root, {
			panelClassName: "product-scene-composite",
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
						"支持上传单张商品图，建议主体清晰、角度稳定、背景干净，便于准确识别商品主体。",
					),
				},
				{
					id: "sceneImages",
					kind: "image-grid",
					stateKey: "sceneImages",
					title: t("section.sceneImages", "生成场景"),
					required: true,
					alt: t("section.sceneImages", "生成场景"),
					addLabel: "+",
					help: t(
						"upload.sceneImages.help",
						"支持上传多张真实场景图，生成时会逐张参考并分别输出。每次生成固定使用 1 张商品图 + 1 张场景图。",
					),
					maxCount: 10,
				},
				{
					id: "generationMode",
					kind: "option-group",
					stateKey: "generationMode",
					title: t("section.generationMode", "生成模式"),
					groupClassName: "psc-generation-mode-group",
					showDescriptionOnHover: true,
					options: generationModeOptions,
				},
				{
					id: "modelSelect",
					kind: "model-select",
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "尺寸倍数"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成数量"),
					suffix: t("section.count.suffix", "每种场景生成数"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成商品图合成")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImage) {
						return t("empty.productImage", "请先上传商品图")
					}
					if (!state.sceneImages.length) {
						return t("empty.sceneImages", "请先上传至少 1 张场景图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.productImage || !state.sceneImages.length,
				validate: ({ state, helpers }) => {
					if (getMaxReferenceImages(state, helpers) < 2) {
						return t(
							"error.referenceLimitTooLow",
							"当前模型不支持同时使用商品图和场景图作为参考图",
						)
					}
					const referenceIds = helpers.collectReferenceIds([
						state.productImage,
						...state.sceneImages,
					])
					if (referenceIds.length !== state.sceneImages.length + 1) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					const selectedSize = resolveSceneRequestSize(
						state.sceneImages[0],
						state,
						helpers,
					)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const requests = buildSceneCompositeRequests({
						state,
						helpers,
						locale: promptLocale,
					})
					const results = await Promise.all(
						requests.map((request) => generateAndPlace(request)),
					)
					return results.length === 1 ? results[0] : results
				},
			},
		})
	},
})
