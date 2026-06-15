/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const BACKGROUND_MODE = {
	/* 参考背景图 */
	IMAGE: "image",
	/* 文生背景 */
	PROMPT: "prompt",
}

function createInitialState() {
	return {
		modelImages: [],
		backgroundMode: BACKGROUND_MODE.IMAGE,
		backgroundImage: null,
		backgroundPrompt: "",
	}
}

function buildBackgroundModeOptions(t) {
	return [
		{
			value: BACKGROUND_MODE.IMAGE,
			label: t("backgroundMode.image", "参考背景图"),
		},
		{
			value: BACKGROUND_MODE.PROMPT,
			label: t("backgroundMode.prompt", "文生背景"),
		},
	]
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 6
}

function getBackgroundReferenceCount(state) {
	if (state.backgroundMode === BACKGROUND_MODE.IMAGE && state.backgroundImage) return 1
	return 0
}

function getReferenceAssetsForMode(state) {
	const assets = [...state.modelImages]
	if (state.backgroundMode === BACKGROUND_MODE.IMAGE && state.backgroundImage) {
		assets.push(state.backgroundImage)
	}
	return assets
}

function getReferenceAssetsForBaseImage(state, baseImage) {
	const assets = [baseImage]
	if (state.backgroundMode === BACKGROUND_MODE.IMAGE && state.backgroundImage) {
		assets.push(state.backgroundImage)
	}
	return assets
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) return "用户当前未填写。"
	return normalizedCurrentText
}

function buildPromptCompletionUserPrompt({ imageCount, currentText }) {
	return [
		"任务目标：为模拍换景插件的“背景描述”输入框生成或补全一段背景提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		`参考图角色：共有 ${imageCount} 张模特图，用于理解人物、服饰、姿态、镜头语言和商拍气质。`,
		"业务限制：只描述新的背景场景、空间、光线、色调、氛围和构图；不要改变模特身份、脸部、身体比例、姿势、服装、配饰、商品细节或拍摄主体。",
		"补全方向：参考时尚商业大片背景，可补充空间类型、背景层次、光线方向、色彩风格、少量不抢主体的场景元素、景深和整体营销氛围。",
		"输出要求：不要输出完整生成任务说明，只输出适合填入“背景描述”的短提示词。",
	].join("\n")
}

function buildSceneSwapPrompt({ backgroundMode, backgroundPrompt, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const modelReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const backgroundReference = MagicPromptLocale.getReferenceLabel(2, locale)

	if (isChinese) {
		if (backgroundMode === BACKGROUND_MODE.IMAGE) {
			return (
				`生成商业模拍换景图。${modelReference} 是人物唯一来源，必须完整保留模特身份、脸部特征、发型、肤色、身体比例、姿态、服饰、配饰、商品细节和整体商拍真实感。` +
				`${backgroundReference} 仅作为背景参考图，只复用其环境、空间结构、景深层次、构图语言、布光氛围、色彩基调和主要背景元素。` +
				`不要复制 ${backgroundReference} 中的人物、脸部、身体、姿势、服装或身份，也不要把其中任何主体合并或重复到最终结果里。` +
				"只替换背景并进行自然融合，保证最终画面的透视、光线、阴影、色彩和边缘过渡一致，让结果像完整精修的时尚商业大片。"
			)
		}

		return (
			`生成商业模拍换景图。${modelReference} 是人物唯一来源，必须完整保留模特身份、脸部特征、发型、肤色、身体比例、姿态、服饰、配饰、商品细节和整体商拍真实感。` +
			`根据以下描述生成全新背景：${backgroundPrompt.trim()}。` +
			"只替换背景，不改变人物和服装本身；保证最终画面的透视、光线、阴影、色彩和氛围协调一致，让人物始终是清晰自然的画面主体。"
		)
	}

	if (backgroundMode === BACKGROUND_MODE.IMAGE) {
		return (
			`Create a commercial fashion scene swap image. Use ${modelReference} as the ONLY source for the person. Preserve the model identity, face, hairstyle, skin tone, body proportions, pose, outfit, accessories, product details, and fashion-shoot realism. ` +
			`${backgroundReference} is ONLY a background reference. Reuse only its environment, spatial structure, depth layering, composition language, lighting mood, color palette, and major background elements. ` +
			`Do NOT copy the person, face, body, pose, clothing, or identity from ${backgroundReference}. Do NOT merge or duplicate any subject from ${backgroundReference} into the final image. ` +
			"Replace only the background and blend it naturally, keeping perspective, lighting, shadows, color, and edge transitions coherent so the result looks like a polished fashion campaign image."
		)
	}

	return (
		`Create a commercial fashion scene swap image. Use ${modelReference} as the ONLY source for the person. Preserve the model identity, face, hairstyle, skin tone, body proportions, pose, outfit, accessories, product details, and fashion-shoot realism. ` +
		`Generate a brand-new background based on this direction: ${backgroundPrompt.trim()}. ` +
		"Replace only the background without changing the person or outfit. Keep perspective, lighting, shadows, color, and atmosphere coherent while keeping the person prominent and natural."
	)
}

function buildSceneSwapRequest({ state, helpers, baseImage, locale, selectedSize, select }) {
	const referenceAssets = getReferenceAssetsForBaseImage(state, baseImage)
	const referenceImages = helpers.collectReferenceIds(referenceAssets)
	const imageGenerationConfig = state.imageGenerationConfig
	const width = selectedSize.genW
	const height = selectedSize.genH

	return {
		model_id: state.modelId,
		prompt: buildSceneSwapPrompt({
			backgroundMode: state.backgroundMode,
			backgroundPrompt: state.backgroundPrompt,
			locale,
		}),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		image_generation_config: Object.keys(imageGenerationConfig ?? {}).length
			? imageGenerationConfig
			: undefined,
		width,
		height,
		count: state.genCount,
		select,
	}
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
			panelClassName: "scene-swap",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "modelImages",
					kind: "image-grid",
					stateKey: "modelImages",
					title: t("section.modelImages", "模特图"),
					required: true,
					help: t(
						"upload.modelImageTip",
						"支持上传多张模特图，建议主体清晰、姿态稳定，便于换景生成。",
					),
					deps: ["backgroundMode", "backgroundImage", "modelId", "modelOptions"],
					maxCount: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const extraCount = getBackgroundReferenceCount(state)
						return Math.max(1, Math.min(10, maxReferenceImages - extraCount))
					},
				},
				{
					id: "backgroundMode",
					kind: "tabs",
					stateKey: "backgroundMode",
					title: t("section.backgroundMode", "选择背景"),
					options: buildBackgroundModeOptions(t),
					panels: [
						{
							value: BACKGROUND_MODE.IMAGE,
							sections: [
								{
									id: "backgroundImage",
									kind: "image-slot",
									stateKey: "backgroundImage",
									title: t("section.backgroundImage", "背景参考图"),
									required: true,
									uploadLabel: t(
										"upload.backgroundImage",
										"上传 / 拖拽背景参考图",
									),
									alt: t("section.backgroundImage", "背景参考图"),
									help: t(
										"help.backgroundImage",
										"AI 将提取参考图的背景风格、空间结构、光线和色调，融合至模特图中。",
									),
									beforePick: ({ state, helpers }) => {
										const maxReferenceImages = getMaxReferenceImages(
											state,
											helpers,
										)
										const currentCount = getReferenceAssetsForMode(state).length
										if (
											!state.backgroundImage &&
											currentCount >= maxReferenceImages
										) {
											return t(
												"error.referenceLimit",
												"参考图数量已达当前模型上限",
											)
										}
										return null
									},
								},
							],
						},
						{
							value: BACKGROUND_MODE.PROMPT,
							sections: [
								{
									id: "backgroundPrompt",
									kind: "textarea",
									stateKey: "backgroundPrompt",
									placeholder: t(
										"placeholder.backgroundPrompt",
										"输入背景描述内容，如：高级服装广告棚景，暖色调橱窗光，城市街道夜景...",
									),
									help: t(
										"help.backgroundPrompt",
										"描述越具体效果越好，例如空间类型、光线、色调、景深和商业氛围。",
									),
									deps: ["modelImages"],
									aiGenerate: {
										label: t("button.aiPlaceholder", "AI 生成"),
										loadingLabel: t("button.generating", "生成中…"),
										disabled: ({ state }) => !state.modelImages?.length,
										completeImagePrompt: {
											referenceImages: ({ state }) => state.modelImages,
											referencesMessage: t(
												"error.extraReferences",
												"请先上传模特图",
											),
											userPrompt: ({ state }) =>
												buildPromptCompletionUserPrompt({
													imageCount: state.modelImages.length,
													currentText: state.backgroundPrompt,
												}),
										},
									},
								},
							],
						},
					],
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
				buttonLabel: `✨ ${t("button.generate", "生成模拍换景图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.modelImages.length) {
						return t("empty.modelImages", "请先上传至少 1 张模特图")
					}
					if (state.backgroundMode === BACKGROUND_MODE.IMAGE && !state.backgroundImage) {
						return t("empty.backgroundImage", "请先上传背景参考图")
					}
					if (
						state.backgroundMode === BACKGROUND_MODE.PROMPT &&
						!state.backgroundPrompt.trim()
					) {
						return t("empty.backgroundPrompt", "请先输入背景描述")
					}
					return null
				},
				isDisabled: ({ state }) =>
					!state.modelImages.length ||
					(state.backgroundMode === BACKGROUND_MODE.IMAGE && !state.backgroundImage) ||
					(state.backgroundMode === BACKGROUND_MODE.PROMPT &&
						!state.backgroundPrompt.trim()),
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
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = helpers.getSelectedSize(state)
					const results = await Promise.all(
						state.modelImages.map((baseImage, index) =>
							generateAndPlace(
								buildSceneSwapRequest({
									state,
									helpers,
									baseImage,
									locale: promptLocale,
									selectedSize,
									select: index === state.modelImages.length - 1,
								}),
							),
						),
					)

					return results.length === 1 ? results[0] : results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "模拍换景图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
