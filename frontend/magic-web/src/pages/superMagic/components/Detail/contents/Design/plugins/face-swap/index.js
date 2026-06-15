/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

function createInitialState() {
	return {
		baseModelImages: [],
		targetFaceImage: null,
	}
}

function getReferenceImages(state) {
	return [...state.baseModelImages, ...(state.targetFaceImage ? [state.targetFaceImage] : [])]
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
	locale,
	helpers,
	width,
	height,
	resolution,
	count,
	select,
}) {
	const referenceImages = helpers.collectReferenceIds([baseImage, targetFaceImage])

	return {
		model_id: modelId,
		prompt: buildSingleFaceSwapPrompt(locale),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution,
		width,
		height,
		count,
		select: select ?? false,
	}
}

function buildSingleFaceSwapPrompt(locale) {
	const baseReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const targetReference = MagicPromptLocale.getReferenceLabel(2, locale)

	if (MagicPromptLocale.isChinese(locale)) {
		return (
			`使用${baseReference}作为底图生成商业换脸结果。` +
			`将${baseReference}作为肤色、发型、发色、服饰、商品造型、姿势、身体位置、裁切、机位构图、场景、背景、光线和时尚商拍真实感的唯一来源。` +
			`仅将${targetReference}作为面部特征参考，提取其脸型、眼部结构、鼻型、嘴唇和五官比例。` +
			`不要复制${targetReference}的肤色、发色、发型、服装、姿势、体型、背景或场景。` +
			`将${targetReference}的面部特征自然移植到${baseReference}的人物上，并与原模特的肤色和整体外观无缝融合。` +
			`保留${baseReference}中的原始肤色、发色、发型、服饰造型、可见配饰、面料垂坠、姿势、裁切、构图、拍摄距离以及所有非面部元素。` +
			"最终结果必须只包含一个人物，不要生成拼贴、对比排版、网格图或多人画面。" +
			`最终应看起来像${baseReference}中的同一个人，只是脸部特征被自然替换。`
		)
	}

	return (
		`Create a commercial face-swap result using ${baseReference} as the base photo. ` +
		`Use ${baseReference} as the ONLY source for skin tone, hairstyle, hair color, outfit, product styling, pose, body position, crop, camera framing, scene, background, lighting, and fashion-shoot realism. ` +
		`Use ${targetReference} ONLY as the facial feature reference — extract the face shape, eye structure, nose, lips, and facial proportions from it. ` +
		`Do NOT copy skin tone, hair color, hairstyle, clothing, pose, body type, background, or scene from ${targetReference}. ` +
		`Transplant the facial features from ${targetReference} onto the person in ${baseReference}, blending seamlessly with the original model's skin tone and overall appearance. ` +
		`Preserve the exact skin tone, hair color, hairstyle, garment styling, visible accessories, drape, pose, crop, framing, camera distance, and all non-face elements from ${baseReference}. ` +
		"The output must contain exactly ONE person. Do not create side-by-side layouts, collages, grids, or multiple people. " +
		`The final result must look like the same person as ${baseReference} but with only the facial features replaced naturally.`
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
			panelClassName: "face-swap",
			state: instance.state,
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
					required: true,
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
					required: true,
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
					title: t("section.count", "生成数量"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成 AI 换脸图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					return ""
				},
				isDisabled: ({ state }) => !state.baseModelImages.length || !state.targetFaceImage,
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
					// 只有在原图没有内置尺寸时才要求模型尺寸配置
					const hasNativeSize = state.baseModelImages.some(
						(img) => img?.width && img?.height,
					)
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
					const results = await Promise.all(
						state.baseModelImages.map((baseImage, index) => {
							const { width, height } = getEffectiveSize(baseImage, selectedSize)
							return generateAndPlace(
								buildFaceSwapRequest({
									modelId: state.modelId,
									baseImage,
									targetFaceImage: state.targetFaceImage,
									locale: promptLocale,
									helpers,
									width,
									height,
									resolution: state.scale || undefined,
									count: state.genCount,
									select: index === state.baseModelImages.length - 1,
								}),
							)
						}),
					)

					return results.length === 1 ? results[0] : results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "AI 换脸图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
