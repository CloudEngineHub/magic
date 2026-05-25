/* global MagicPluginKit, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const PRESET_TARGET_MODEL_OPTIONS = [
	{
		value: "none",
		labelKey: "preset.none",
		labelFallback: "不使用预设",
		descriptionKey: "preset.none.desc",
		descriptionFallback: "只使用上传的目标模特图，或先留空稍后再选。",
		promptFragment: "",
	},
	{
		value: "asianYoungFemale",
		labelKey: "preset.asianYoungFemale",
		labelFallback: "亚洲年轻女性",
		descriptionKey: "preset.asianYoungFemale.desc",
		descriptionFallback: "偏年轻的亚洲女性模特，肤色偏浅，适合干净明亮的商业人像。",
		promptFragment:
			"a young Asian female model with light skin tone, refined facial features, and a clean commercial beauty look",
	},
	{
		value: "blackYoungFemale",
		labelKey: "preset.blackYoungFemale",
		labelFallback: "黑人年轻女性",
		descriptionKey: "preset.blackYoungFemale.desc",
		descriptionFallback: "偏年轻的黑人女性模特，肤色较深，适合高级感编辑风格。",
		promptFragment:
			"a young Black female model with dark skin tone, confident facial features, and premium editorial presence",
	},
	{
		value: "whiteMatureFemale",
		labelKey: "preset.whiteMatureFemale",
		labelFallback: "白人成熟女性",
		descriptionKey: "preset.whiteMatureFemale.desc",
		descriptionFallback: "成熟女性白人模特，气质优雅，适合高端商业形象。",
		promptFragment:
			"a mature white female model with elegant facial features, balanced skin tone, and high-end commercial styling",
	},
	{
		value: "asianMatureMale",
		labelKey: "preset.asianMatureMale",
		labelFallback: "亚洲成熟男性",
		descriptionKey: "preset.asianMatureMale.desc",
		descriptionFallback: "成熟亚洲男性模特，适合稳重高级的商业拍摄风格。",
		promptFragment:
			"a mature Asian male model with polished facial structure, natural skin tone, and luxury campaign presence",
	},
	{
		value: "blackMatureMale",
		labelKey: "preset.blackMatureMale",
		labelFallback: "黑人成熟男性",
		descriptionKey: "preset.blackMatureMale.desc",
		descriptionFallback: "成熟黑人男性模特，面部结构鲜明，适合高级时尚视觉。",
		promptFragment:
			"a mature Black male model with strong facial structure, deep skin tone, and premium fashion presence",
	},
	{
		value: "whiteYoungMale",
		labelKey: "preset.whiteYoungMale",
		labelFallback: "白人年轻男性",
		descriptionKey: "preset.whiteYoungMale.desc",
		descriptionFallback: "偏年轻的白人男性模特，适合现代感商业服饰展示。",
		promptFragment:
			"a young white male model with bright skin tone, contemporary facial styling, and modern fashion presence",
	},
]

const HAND_FOOT_REPAIR_PROMPT =
	"Repair hands and feet carefully so the final model has natural finger structure, hand pose continuity, clean wrist and ankle transitions, correct limb alignment, and no warping, duplication, or misplaced joints. "

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const presetTargetModels = PRESET_TARGET_MODEL_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "model-swap",
			initialState: {
				baseModelImages: [],
				targetModelImage: null,
				presetTargetModel: "none",
				handFootRepair: false,
				genCount: 1,
			},
			modelConfig: {
				autoLoad: true,
				defaultModelId: "gemini-3-pro-image-preview",
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "baseModelImages",
					kind: "image-grid",
					stateKey: "baseModelImages",
					title: t("section.baseModelImages", "原模特图"),
					help: t(
						"upload.baseModelImages.help",
						"仅支持单人模特图，不支持多人图、明显面部遮挡、明显低头/抬头或身体大面积被遮挡的图片。",
					),
					deps: ["targetModelImage", "modelId", "modelOptions"],
					addLabel: "+",
					alt: t("section.baseModelImages", "原模特图"),
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const targetCount = state.targetModelImage ? 1 : 0
						return Math.max(1, Math.min(6, maxReferenceImages - targetCount))
					},
				},
				{
					id: "targetModelImage",
					kind: "image-slot",
					stateKey: "targetModelImage",
					title: t("section.targetModelImage", "目标模特"),
					suffix: t("optional", "可选"),
					uploadLabel: t("upload.targetModelImage", "点击上传目标模特图"),
					alt: t("section.targetModelImage", "目标模特"),
					help: t(
						"upload.targetModelImage.help",
						"可选。用于提供新的模特脸部、肤色、发型和身份特征，不会复制该图里的服饰与场景。",
					),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						if (!state.targetModelImage && state.baseModelImages.length + 1 > maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "presetTargetModel",
					kind: "option-group",
					stateKey: "presetTargetModel",
					title: t("section.presetTargetModel", "预设 AI 模特"),
					showDescriptionOnHover: true,
					options: presetTargetModels,
				},
				{
					id: "handFootRepair",
					kind: "toggle",
					stateKey: "handFootRepair",
					title: t("section.handFootRepair", "手脚修复"),
					help: t(
						"handFootRepair.help",
						"“手脚修复”用于优化换模特后手脚部位的细节，减少变形、错位或肢体不自然的问题。",
					),
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
					options: GENERATION_COUNT_GROUP_OPTIONS,
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成 AI 换模特图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.baseModelImages.length) {
						return t("empty.baseModelImages", "请先上传至少 1 张原模特图")
					}
					if (!hasTargetModelInput(state)) {
						return t("empty.targetModel", "请先上传目标模特图或选择一个预设 AI 模特")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.baseModelImages.length || !hasTargetModelInput(state),
				validate: ({ state, helpers }) => {
					if (!state.baseModelImages.length) {
						return t("empty.baseModelImages", "请先上传至少 1 张原模特图")
					}
					if (!hasTargetModelInput(state)) {
						return t("empty.targetModel", "请先上传目标模特图或选择一个预设 AI 模特")
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
					const width = selectedSize.genW
					const height = selectedSize.genH

					if (state.baseModelImages.length <= 1) {
						const baseImage = state.baseModelImages[0]
						const referenceImages = helpers.collectReferenceIds([
							baseImage,
							...(state.targetModelImage ? [state.targetModelImage] : []),
						])
						return generateAndPlace({
							model_id: state.modelId,
							prompt: buildModelSwapPrompt({
								baseImageCount: 1,
								hasTargetModelImage: Boolean(state.targetModelImage),
								presetTargetModel: state.presetTargetModel,
								handFootRepair: state.handFootRepair,
							}),
							reference_images: referenceImages,
							size: `${width}x${height}`,
							resolution: state.scale || undefined,
							width,
							height,
							count: state.genCount,
							select: false,
						})
					}

					const results = []
					for (let index = 0; index < state.genCount; index += 1) {
						const baseImage = state.baseModelImages[index % state.baseModelImages.length]
						const referenceImages = helpers.collectReferenceIds([
							baseImage,
							...(state.targetModelImage ? [state.targetModelImage] : []),
						])
						results.push(
							await generateAndPlace({
								model_id: state.modelId,
								prompt: buildModelSwapPrompt({
									baseImageCount: 1,
									hasTargetModelImage: Boolean(state.targetModelImage),
									presetTargetModel: state.presetTargetModel,
									handFootRepair: state.handFootRepair,
								}),
								reference_images: referenceImages,
								size: `${width}x${height}`,
								resolution: state.scale || undefined,
								width,
								height,
								count: 1,
								select: false,
							}),
						)
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "AI 换模特图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function getReferenceImages(state) {
	return [...state.baseModelImages, ...(state.targetModelImage ? [state.targetModelImage] : [])]
}

function hasTargetModelInput(state) {
	return Boolean(state.targetModelImage) || state.presetTargetModel !== "none"
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
}

function buildReferenceLabelList(count) {
	return Array.from({ length: count }, (_, index) => `reference image ${index + 1}`).join(", ")
}

function getPresetTargetModelPrompt(presetTargetModel) {
	return (
		PRESET_TARGET_MODEL_OPTIONS.find((item) => item.value === presetTargetModel)?.promptFragment ??
		""
	)
}

function buildModelSwapPrompt({
	baseImageCount,
	hasTargetModelImage,
	presetTargetModel,
	handFootRepair,
}) {
	const baseReferences = buildReferenceLabelList(baseImageCount)
	const targetModelReference = `reference image ${baseImageCount + 1}`
	const presetPrompt = getPresetTargetModelPrompt(presetTargetModel)
	const identitySourcePrompt = hasTargetModelImage
		? `Use ${targetModelReference} only as the identity reference for the new model's face, skin tone, apparent age, hairstyle, and overall human identity. Do not copy clothing, pose, background, or scene from ${targetModelReference}. `
		: ""
	const presetSupplementPrompt = presetPrompt
		? hasTargetModelImage
			? `Use this preset only as supplementary guidance when it does not conflict with ${targetModelReference}: ${presetPrompt}. `
			: `Create the new model with these target identity traits: ${presetPrompt}. `
		: ""
	const handFootRepairPrompt = handFootRepair ? HAND_FOOT_REPAIR_PROMPT : ""

	return (
		`Create a commercial model-swap image using ${baseImageCount} original model reference image${baseImageCount > 1 ? "s" : ""}: ${baseReferences}. ` +
		`Use ${baseReferences} as the ONLY source for the outfit, product styling, pose, body position, crop, camera framing, scene, background, lighting, and fashion-shoot realism. ` +
		"Replace the original person with a new target model while keeping the clothing, product presentation, scene atmosphere, and composition consistent with the original references. " +
		"Keep the visible body range, crop, framing, camera distance, and perspective unchanged. Do not uncrop, outpaint, or reveal body parts that are not visible in the original references. " +
		"Preserve the exact garment styling, visible accessories, drape, hand placement relative to products, and all non-person scene elements from the original references. " +
		identitySourcePrompt +
		presetSupplementPrompt +
		"When multiple original model images are provided, fuse them into one coherent result that keeps their shared fashion language, styling details, and campaign consistency. " +
		"Only generate a single person. Do not create extra people, duplicate faces, or merge two different bodies. " +
		"Do not change the clothing design, product silhouette, camera angle, scene type, or crop unless required to keep the swapped model natural and believable. " +
		handFootRepairPrompt
	)
}
