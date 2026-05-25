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
			panelClassName: "face-swap",
			initialState: {
				baseModelImages: [],
				targetFaceImage: null,
				genCount: 1,
			},
			modelConfig: {
				autoLoad: true,
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
						"支持上传多张原模特图（最多 10 张），仅替换面部特征，保留肤色、发型、服饰与场景。",
					),
					addLabel: "+",
					alt: t("section.baseModelImages", "原模特图"),
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const targetCount = state.targetFaceImage ? 1 : 0
						return Math.max(1, Math.min(10, maxReferenceImages - targetCount))
					},
				},
				{
					id: "targetFaceImage",
					kind: "image-slot",
					stateKey: "targetFaceImage",
					title: t("section.targetFaceImage", "目标人脸"),
					uploadLabel: t("upload.targetFaceImage", "点击上传目标人脸图"),
					alt: t("section.targetFaceImage", "目标人脸"),
					help: t(
						"upload.targetFaceImage.help",
						"上传清晰的正脸或半侧脸照片，AI 仅复用其面部五官特征，不会复制肤色、发型、服饰或背景。",
					),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						if (
							!state.targetFaceImage &&
							state.baseModelImages.length + 1 > maxReferenceImages
						) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
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
				buttonLabel: `✨ ${t("button.generate", "生成 AI 换脸图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.baseModelImages.length) {
						return t("empty.baseModelImages", "请先上传至少 1 张原模特图")
					}
					if (!state.targetFaceImage) {
						return t("empty.targetFaceImage", "请先上传目标人脸图")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.baseModelImages.length || !state.targetFaceImage,
				validate: ({ state, helpers }) => {
					if (!state.baseModelImages.length) {
						return t("empty.baseModelImages", "请先上传至少 1 张原模特图")
					}
					if (!state.targetFaceImage) {
						return t("empty.targetFaceImage", "请先上传目标人脸图")
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
					// 只有在原图没有内置尺寸时才要求模型尺寸配置
					const hasNativeSize = state.baseModelImages.some((img) => img?.width && img?.height)
					if (!hasNativeSize) {
						const selectedSize = helpers.getSelectedSize(state)
						if (!selectedSize?.genW || !selectedSize?.genH) {
							return t("error.noSize", "当前模型缺少可用尺寸配置")
						}
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = helpers.getSelectedSize(state)

					if (state.baseModelImages.length <= 1) {
						const baseImage = state.baseModelImages[0]
						const { width, height } = getEffectiveSize(baseImage, selectedSize)
						return generateAndPlace(
							buildFaceSwapRequest({
								modelId: state.modelId,
								baseImage,
								targetFaceImage: state.targetFaceImage,
								helpers,
								width,
								height,
								resolution: state.scale || undefined,
								count: state.genCount,
							})
						)
					}

					const results = []
					for (let index = 0; index < state.genCount; index += 1) {
						const baseImage = state.baseModelImages[index % state.baseModelImages.length]
						const { width, height } = getEffectiveSize(baseImage, selectedSize)
						const request = buildFaceSwapRequest({
							modelId: state.modelId,
							baseImage,
							targetFaceImage: state.targetFaceImage,
							helpers,
							width,
							height,
							resolution: state.scale || undefined,
							count: 1,
						})
						results.push(await generateAndPlace(request))
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "AI 换脸图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

function getReferenceImages(state) {
	return [
		...state.baseModelImages,
		...(state.targetFaceImage ? [state.targetFaceImage] : []),
	]
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 6
}

/**
 * 优先使用 asset 自带的原始尺寸，不存在时 fallback 到模型配置尺寸。
 * PluginFileAsset 上的 width/height 是可选字段，只在宿主能读出图片元数据时存在。
 */
function getEffectiveSize(image, selectedSize) {
	if (image?.width && image?.height) {
		return { width: image.width, height: image.height }
	}
	return { width: selectedSize?.genW, height: selectedSize?.genH }
}


function buildFaceSwapRequest({
	modelId,
	baseImage,
	targetFaceImage,
	helpers,
	width,
	height,
	resolution,
	count,
}) {
	const referenceImages = helpers.collectReferenceIds([baseImage, targetFaceImage])

	return {
		model_id: modelId,
		prompt: buildSingleFaceSwapPrompt(),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution,
		width,
		height,
		count,
		select: false,
	}
}

function buildSingleFaceSwapPrompt() {
	return (
		"Create a commercial face-swap result using reference image 1 as the base photo. " +
		"Use reference image 1 as the ONLY source for skin tone, hairstyle, hair color, outfit, product styling, pose, body position, crop, camera framing, scene, background, lighting, and fashion-shoot realism. " +
		"Use reference image 2 ONLY as the facial feature reference — extract the face shape, eye structure, nose, lips, and facial proportions from it. " +
		"Do NOT copy skin tone, hair color, hairstyle, clothing, pose, body type, background, or scene from reference image 2. " +
		"Transplant the facial features from reference image 2 onto the person in reference image 1, blending seamlessly with the original model's skin tone and overall appearance. " +
		"Preserve the exact skin tone, hair color, hairstyle, garment styling, visible accessories, drape, pose, crop, framing, camera distance, and all non-face elements from reference image 1. " +
		"The output must contain exactly ONE person. Do not create side-by-side layouts, collages, grids, or multiple people. " +
		"The final result must look like the same person as reference image 1 but with only the facial features replaced naturally."
	)
}
