/* global MagicPluginKit, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const ANATOMY_CONSTRAINT =
	"Each output image must contain exactly ONE person. Keep anatomically correct human proportions with natural joint angles, realistic limb length, and believable weight balance. Do not create broken, twisted, duplicated, or impossible body poses. Avoid extra arms, extra legs, merged limbs, or distorted hands and feet. "

const IMAGE_IDENTITY_LOCK =
	"Use reference image 1 (IDENTITY BASE) as the ONLY source for face identity, facial features, skin tone, apparent age, body type, hairstyle, outfit, styling, scene, background, lighting, color grading, crop, and campaign tone. The output person must remain recognizable as the exact same individual from reference image 1. If the output face, skin tone, hairstyle, or body type resembles reference image 2 more than reference image 1, the result is INVALID. "

const IMAGE_POSE_STABILITY_CONSTRAINT =
	"Reference image 2 (POSE BLUEPRINT) is the ONLY pose source for this output. Extract ONLY joint angles, limb direction, torso orientation, and weight balance from reference image 2. Treat reference image 2 as an invisible pose wireframe: its face, skin, hair, body type, clothing, and background must NOT appear in the output. Perform a clear, visible pose transfer away from the original body pose in reference image 1 and toward the pose geometry in reference image 2. An output whose body pose looks the same as — or nearly identical to — reference image 1 is INVALID. Do NOT copy silhouette, body proportions, outfit shape, or any human appearance from reference image 2. Never produce two people, two competing poses, duplicated limbs, ghost limbs, mixed pose geometry, or a fallback to the unchanged original pose. "

const IMAGE_IDENTITY_FINAL_CHECK =
	"The final result must look like the same person as reference image 1 with a new pose applied. Reference image 2 must contribute pose geometry only, never identity or appearance. "

const SMART_POSE_PROMPT =
	"Analyze reference image 1 and choose a better pose that still looks natural for commercial fashion photography. Prefer subtle, believable pose improvements such as a slight weight shift, relaxed arm placement, or a cleaner standing or walking posture that fits the outfit, scene, and lighting. Keep the pose commercially usable and anatomically realistic rather than exaggerated or avant-garde. "

const SMART_POSE_VARIATION_PROMPT =
	"When generating multiple images, create slightly different but still natural and commercially believable poses across the set. Each image must still contain only one person with realistic anatomy. "

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "强调稳定换姿、身份一致，适合常规商拍生成。",
		promptSuffix:
			"Keep the pose change stable, natural, and commercially polished. Avoid exaggerated body distortion while preserving the same face identity and campaign tone. Prefer commercially natural poses over extreme editorial contortion.",
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback: "增强肢体过渡、重心平衡、手脚自然度，以及新姿态下服饰的合理褶皱变化。",
		promptSuffix:
			"Enhance limb transitions, weight balance, hand and foot naturalness, and realistic garment folds for the new pose, while still preserving the same face identity, styling direction, and scene atmosphere. Do not introduce anatomically impossible or surreal body positions.",
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
			panelClassName: "pose-swap",
			initialState: {
				modelImage: null,
				poseMode: "smart",
				posePrompt: "",
				poseReferenceImages: [],
				generationMode: "standard",
				genCount: 1,
			},
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				defaultModelId: "gemini-3-pro-image-preview",
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "modelImage",
					kind: "image-slot",
					stateKey: "modelImage",
					title: t("section.modelImage", "模特图"),
					uploadLabel: t("upload.modelImage", "点击上传模特图"),
					alt: t("section.modelImage", "模特图"),
					help: t(
						"upload.modelImage.help",
						"建议上传清晰的单人模特图，便于保持人脸、服饰与场景一致。",
					),
					deps: ["poseMode", "poseReferenceImages", "modelId", "modelOptions"],
					beforePick: ({ state, helpers }) => {
						if (state.modelImage) return null
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						if (countReferenceImages(state) >= maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "poseMode",
					kind: "option-group",
					stateKey: "poseMode",
					title: t("section.poseMode", "参考姿势"),
					variant: "card",
					descriptionMode: "inline",
					options: buildPoseModeOptions(t),
				},
				{
					id: "posePrompt",
					kind: "textarea",
					stateKey: "posePrompt",
					deps: ["poseMode"],
					title: t("section.posePrompt", "姿势描述"),
					placeholder: t(
						"placeholder.posePrompt",
						"将图中模特调整为一个更具创意和时尚感的姿势。",
					),
					rows: 3,
					maxLength: 2000,
					when: ({ state }) => state.poseMode === "text",
				},
				{
					id: "poseReferenceImages",
					kind: "image-grid",
					stateKey: "poseReferenceImages",
					deps: ["poseMode", "modelImage", "modelId", "modelOptions"],
					title: t("section.poseReferenceImages", "姿势参考图"),
					help: t(
						"upload.poseReferenceImages.help",
						"支持上传多张姿势参考图，只会复用姿态，不会复制脸、衣服或背景。多图生成时会按顺序为每张结果分配 1 张姿势参考图；当生成张数多于参考图数量时，会循环复用姿势参考图。",
					),
					addLabel: "+",
					alt: t("section.poseReferenceImages", "姿势参考图"),
					when: ({ state }) => state.poseMode === "image",
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const modelCount = state.modelImage ? 1 : 0
						return Math.max(1, Math.min(6, maxReferenceImages - modelCount))
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
					id: "canvasSize",
					kind: "size-control",
					title: t("section.canvasSize", "画布比例"),
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
					options: GENERATION_COUNT_GROUP_OPTIONS,
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成模特换姿势图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.modelImage) {
						return t("empty.modelImage", "请先上传模特图")
					}
					if (state.poseMode === "text" && !state.posePrompt.trim()) {
						return t("error.posePromptRequired", "请输入姿势描述")
					}
					if (state.poseMode === "image" && !state.poseReferenceImages.length) {
						return t("error.poseReferenceRequired", "请上传至少 1 张姿势参考图")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.modelImage ||
					(state.poseMode === "text" && !state.posePrompt.trim()) ||
					(state.poseMode === "image" && !state.poseReferenceImages.length),
				validate: ({ state, helpers }) => {
					if (!state.modelImage) {
						return t("empty.modelImage", "请先上传模特图")
					}
					if (state.poseMode === "text" && !state.posePrompt.trim()) {
						return t("error.posePromptRequired", "请输入姿势描述")
					}
					if (state.poseMode === "image" && !state.poseReferenceImages.length) {
						return t("error.poseReferenceRequired", "请上传至少 1 张姿势参考图")
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
				buildRequest: ({ state, helpers }) => {
					return buildPoseSwapRequest({ state, helpers })
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					if (state.poseMode !== "image") {
						return generateAndPlace(buildPoseSwapRequest({ state, helpers }))
					}

					const requests = buildImagePoseSwapRequests({ state, helpers })
					const results = []
					for (const request of requests) {
						results.push(await generateAndPlace(request))
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "模特换姿势图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function buildPoseModeOptions(t) {
	return [
		{
			value: "smart",
			label: t("poseMode.smart", "智能姿势"),
			description: t(
				"poseMode.smart.desc",
				"只需上传模特图，由 AI 自动推断更自然、商拍可用的姿势，无需额外参考。",
			),
		},
		{
			value: "text",
			label: t("poseMode.text", "文字换姿"),
			description: t("poseMode.text.desc", "用文字描述目标姿势，适合快速尝试不同创意姿态。"),
		},
		{
			value: "image",
			label: t("poseMode.image", "以图换姿"),
			description: t(
				"poseMode.image.desc",
				"上传一张或多张姿势参考图，复用其肢体摆放与姿态结构。",
			),
		},
	]
}

function getReferenceImages(state) {
	if (state.poseMode === "image") {
		return [state.modelImage, ...state.poseReferenceImages].filter(Boolean)
	}
	return state.modelImage ? [state.modelImage] : []
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
}

function buildPoseSwapRequest({ state, helpers, referenceImages, poseReferenceCount, genCount }) {
	const selectedSize = helpers.getSelectedSize(state)
	const width = selectedSize.genW
	const height = selectedSize.genH
	const resolvedReferenceImages =
		referenceImages ?? helpers.collectReferenceIds(getReferenceImages(state))
	const resolvedPoseReferenceCount = poseReferenceCount ?? state.poseReferenceImages.length
	const resolvedGenCount = genCount ?? state.genCount

	return {
		model_id: state.modelId,
		prompt: buildPoseSwapPrompt({
			poseMode: state.poseMode,
			posePrompt: state.posePrompt,
			poseReferenceCount: resolvedPoseReferenceCount,
			generationMode: state.generationMode,
			genCount: resolvedGenCount,
		}),
		reference_images: resolvedReferenceImages,
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: resolvedGenCount,
		select: false,
	}
}

function buildImagePoseSwapRequests({ state, helpers }) {
	const modelReferenceId = helpers.collectReferenceIds([state.modelImage])[0]
	const poseReferenceIds = helpers.collectReferenceIds(state.poseReferenceImages)

	return Array.from({ length: state.genCount }, (_, index) =>
		buildPoseSwapRequest({
			state,
			helpers,
			referenceImages: [modelReferenceId, poseReferenceIds[index % poseReferenceIds.length]],
			poseReferenceCount: 1,
			genCount: 1,
		}),
	)
}

function buildPoseSwapPrompt({
	poseMode,
	posePrompt,
	generationMode,
	genCount,
}) {
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[0]
	const modelReference = "reference image 1"
	const basePrompt =
		poseMode === "image"
			? `Create a commercial model pose swap result using ${modelReference} as the base photo. ` +
				"The first attached image is reference image 1 (IDENTITY BASE). The second attached image is reference image 2 (POSE BLUEPRINT). " +
				IMAGE_IDENTITY_LOCK +
				"Change only the body pose and limb arrangement of the person from reference image 1. Keep the same person, garment design, scene atmosphere, and overall fashion-shoot realism. " +
				"This is a single output: one person from reference image 1 with a new pose. " +
				"Do not change the clothing design, background type, camera distance, or visible crop unless required to make the new pose believable. " +
				ANATOMY_CONSTRAINT
			: `Create a commercial model pose swap result using ${modelReference} as the base photo. ` +
				`Use ${modelReference} as the ONLY source for face identity, skin tone, hairstyle, outfit, styling, scene, background, lighting, color grading, crop, and campaign tone. ` +
				"Change only the body pose and limb arrangement. Keep the same person, garment design, scene atmosphere, and overall fashion-shoot realism. " +
				"Generate a cohesive set of images with consistent face identity and unified visual style. " +
				"Do not change the clothing design, background type, camera distance, or visible crop unless required to make the new pose believable. " +
				ANATOMY_CONSTRAINT

	let poseGuidance = ""
	if (poseMode === "smart") {
		const variationGuidance = genCount > 1 ? SMART_POSE_VARIATION_PROMPT : ""
		poseGuidance = SMART_POSE_PROMPT + variationGuidance
	} else if (poseMode === "text") {
		poseGuidance =
			`Adjust the model pose according to this direction: ${posePrompt.trim()}. ` +
			"Do not change the person's identity, garment style, or scene type. "
	} else {
		poseGuidance =
			IMAGE_POSE_STABILITY_CONSTRAINT +
			`Apply the extracted pose geometry from reference image 2 onto the person from ${modelReference} naturally, with coherent anatomy and believable contact with the existing scene. ` +
			IMAGE_IDENTITY_FINAL_CHECK
	}

	return basePrompt + poseGuidance + modeDefinition.promptSuffix
}
