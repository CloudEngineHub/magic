/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const BACKGROUND_MODE = {
	/* 参考图背景 */
	IMAGE: "image",
	/* 文生背景 */
	PROMPT: "prompt",
}

const PLACEMENT_MODE = {
	/* 智能匹配 */
	SMART: "smart",
	/* 同位替换 */
	REPLACE: "replace",
	/* 硬质商品 */
	NATURAL: "natural",
	/* 柔软衣物 */
	SOFT: "soft",
	/* 仅换背景 */
	BACKGROUND: "background",
}

/* 初始化状态 */
function createInitialState() {
	return {
		productImages: [],
		backgroundMode: BACKGROUND_MODE.IMAGE,
		backgroundImage: null,
		backgroundPrompt: "",
		placementMode: PLACEMENT_MODE.SMART,
		qualityMode: "",
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

const PLACEMENT_MODE_DEFINITIONS = [
	{
		value: PLACEMENT_MODE.SMART,
		labelKey: "placement.smart",
		labelFallback: "智能匹配",
		descriptionKey: "placement.smart.desc",
		descriptionFallback: "自动判断同类替换、硬质摆拍或柔软衣物摆放",
		promptSuffix: {
			zh: "摆放方式：智能匹配。{{backgroundInstruction}}如果商品属于鞋、包、瓶罐、摆件等硬质商品，则自然摆放；如果属于裤子、上衣、裙子、围巾、布料等柔软衣物，则平铺、搭放、折叠或悬挂。当无法判断时，选择最符合商品类型、且物理上合理的商品摄影摆放方式。",
			en: "PLACEMENT MODE: smart product matching. {{backgroundInstruction}}If the product is a hard or self-supporting object, place it naturally in the scene. If it is a soft garment or fabric item, it must lay flat, drape, fold, or hang naturally and must not stand upright unsupported. When uncertain, choose the physically plausible product-photo placement that best matches the product category. ",
		},
		promptSuffixBackgroundInstruction: {
			zh: "优先检查 {{backgroundReference}} 中是否存在同类商品；如果存在，则执行同位替换并继承其位置、尺度、角度、透视、接触阴影和遮挡关系。",
			en: "First check whether {{backgroundReference}} contains an object of the same product category. If it does, perform same-category in-place replacement and inherit its placement, position, scale, orientation, perspective, contact shadows, lighting, and occlusion. ",
		},
	},
	{
		value: PLACEMENT_MODE.REPLACE,
		labelKey: "placement.replace",
		labelFallback: "同位替换",
		descriptionKey: "placement.replace.desc",
		descriptionFallback: "参考图已有同类商品时，1:1 继承原商品摆放",
		promptSuffix: {
			zh: "摆放方式：同位替换。先识别 {{backgroundReference}} 中与当前商品同类的目标物体，再用当前商品进行 1:1 替换。继承原商品的位置、数量、尺度、角度、透视、接触阴影、遮挡关系与布光方向，并完全移除原商品。",
			en: "PLACEMENT MODE: same-category in-place replacement. Identify the same product-category object in {{backgroundReference}}, then replace that object with the current product. Inherit the original placement, quantity, position, scale, orientation, perspective, contact shadows, lighting direction, and occlusion relationships. Remove the original product completely. ",
		},
	},
	{
		value: PLACEMENT_MODE.NATURAL,
		labelKey: "placement.natural",
		labelFallback: "硬质商品",
		descriptionKey: "placement.natural.desc",
		descriptionFallback: "鞋、包、瓶罐、摆件等硬质商品自然落入场景",
		promptSuffix: {
			zh: "摆放方式：硬质商品。将商品作为鞋、包、瓶罐、摆件、盒子等可独立支撑的硬质商品处理，自然落入场景。允许站立、倚靠、放置在桌面或地面，并与道具形成真实接触和阴影。",
			en: "PLACEMENT MODE: natural hard-product styling. Treat the product as a self-supporting hard good such as shoes, bags, bottles, decor objects, or boxes. Let it stand, lean, or rest naturally in the scene with believable contact and shadow. ",
		},
	},
	{
		value: PLACEMENT_MODE.SOFT,
		labelKey: "placement.soft",
		labelFallback: "柔软衣物",
		descriptionKey: "placement.soft.desc",
		descriptionFallback: "裤子、上衣、裙子等平铺、搭放或挂放，不直立",
		promptSuffix: {
			zh: "摆放方式：柔软衣物。将商品作为裤子、上衣、裙子、围巾、布料等柔软物处理，可平铺、搭放、折叠或悬挂。不要让衣物像刚体一样直立，也不要生成人体、模特腿、假人或隐形身体来支撑衣物。",
			en: "PLACEMENT MODE: soft-garment styling. Treat the product as a soft garment or fabric item such as pants, shirt, skirt, scarf, dress, or cloth. Lay it flat, drape it over props, fold it naturally, or hang it from plausible support. Never make it stand upright unsupported, and do not generate a person, mannequin, invisible body, or legs to hold it. ",
		},
	},
	{
		value: PLACEMENT_MODE.BACKGROUND,
		labelKey: "placement.background",
		labelFallback: "仅换背景",
		descriptionKey: "placement.background.desc",
		descriptionFallback: "商品角度和姿态尽量不变，只做背景与光影融合",
		promptSuffix: {
			zh: "摆放方式：仅换背景。把 {{backgroundReference}} 只当作背景/场景来源，不把其中的主体当作商品摆放模板。最终主体的数量、轮廓、角度、姿态、可见面与摆放方向必须严格等同于 {{productReference}}；{{productReference}} 中有几个主体，成品就只能有几个主体，禁止因 {{backgroundReference}} 中出现多个同类主体而复制、增加、拆分或重排商品。若 {{backgroundReference}} 中存在商品、人物或其他明显主体，将其视为需要移除的原画面内容，补全其背后的背景，只保留空间、构图、光线、色彩和非主体背景元素；然后将 {{productReference}} 的主体融入该背景，仅允许为适配画布做轻微缩放/平移与光影融合，不继承 {{backgroundReference}} 中主体的位置、数量、尺度、角度、透视、组合关系或接触阴影。主体外观始终来自 {{productReference}}，不要使用 {{backgroundReference}} 中主体的外观。",
			en: "PLACEMENT MODE: background-only replacement. Treat {{backgroundReference}} only as the background/scene source, not as a product placement template. The final subject count, silhouette, angle, pose, visible side, and orientation must strictly match {{productReference}}. If {{productReference}} contains one subject, the final image must contain exactly one subject; never copy, add, split, or rearrange the product because {{backgroundReference}} contains multiple similar subjects. If {{backgroundReference}} contains products, people, or other clear subjects, treat them as original foreground content to remove, reconstruct the background behind them, and keep only the space, composition, lighting, color palette, and non-subject background elements. Then blend the subject from {{productReference}} into that background, allowing only slight scale/position adjustments and lighting/edge harmonization. Do not inherit subject quantity, position, scale, orientation, perspective, arrangement, or contact shadows from {{backgroundReference}}. The subject appearance must always come from {{productReference}}, not from any subject visible in {{backgroundReference}}. ",
		},
	},
]

function getPlacementModeDefinition(placementMode) {
	return (
		PLACEMENT_MODE_DEFINITIONS.find((item) => item.value === placementMode) ??
		PLACEMENT_MODE_DEFINITIONS[0]
	)
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) {
		return "用户当前未填写。"
	}

	return normalizedCurrentText
}

function getPlacementModeConstraint(placementMode) {
	switch (placementMode) {
		case PLACEMENT_MODE.NATURAL:
			return "背景应适合硬质商品自然落地、桌面摆放、靠放或形成合理接触阴影。"
		case PLACEMENT_MODE.SOFT:
			return "背景应适合柔软衣物平铺、搭放、挂放或自然垂落，避免让衣物直立。"
		case PLACEMENT_MODE.BACKGROUND:
			return "背景应尽量简单干净，减少复杂透视、强遮挡和强道具，不要求重新摆放商品。"
		case PLACEMENT_MODE.SMART:
		default:
			return "背景应适合自动摆放，并为不同商品提供自然、合理、商业摄影化的承托关系。"
	}
}

function buildPromptCompletionUserPrompt({ imageCount, placementMode, currentText }) {
	return [
		"任务目标：为商品换背景的文生背景输入框生成或补全一段背景提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		`参考图角色：共有 ${imageCount} 张商品图，用于理解商品类别、材质、颜色、软硬属性和商业气质；这些商品会分别生成图片，不会放进同一张图。`,
		`业务限制：背景摆放方式是“${getPlacementModeDefinition(placementMode).labelFallback}”，${getPlacementModeConstraint(placementMode)}不要描述商品之间的搭配、并排或同框关系；不要改变商品本身颜色、款式、logo、图案或材质。`,
		"补全方向：重点补充背景场景本身，包括空间类型、背景材质、少量不抢主体的道具、光线方向与软硬、色彩氛围、构图留白，以及与商品匹配的物理承托关系。",
	].join("\n")
}

function resolvePlacementPromptSuffix(
	definition,
	{ backgroundMode, backgroundReference, productReference, locale },
) {
	const backgroundInstruction =
		backgroundMode === BACKGROUND_MODE.IMAGE && definition.promptSuffixBackgroundInstruction
			? (
					MagicPromptLocale.pickText(
						definition.promptSuffixBackgroundInstruction,
						locale,
					) ?? ""
				).replace(/\{\{backgroundReference\}\}/g, backgroundReference)
			: ""

	return (MagicPromptLocale.pickText(definition.promptSuffix, locale) ?? "")
		.replace(/\{\{backgroundReference\}\}/g, backgroundReference)
		.replace(/\{\{productReference\}\}/g, productReference)
		.replace(/\{\{backgroundInstruction\}\}/g, backgroundInstruction)
}

function buildPlacementOptions(t, backgroundMode) {
	const options = PLACEMENT_MODE_DEFINITIONS.map((definition) => ({
		value: definition.value,
		label: t(definition.labelKey, definition.labelFallback),
		description: t(definition.descriptionKey, definition.descriptionFallback),
	}))
	if (backgroundMode === BACKGROUND_MODE.PROMPT) {
		return options.filter((option) => option.value !== PLACEMENT_MODE.REPLACE)
	}
	return options
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 6
}

function getBackgroundReferenceCount(state) {
	if (state.backgroundMode === BACKGROUND_MODE.IMAGE && state.backgroundImage) return 1
	return 0
}

function getReferenceAssetsForMode(state) {
	const assets = [...state.productImages]
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

function buildProductIdentityInstruction({
	locale,
	productReference,
	backgroundReference,
	backgroundMode,
	placementMode,
}) {
	const isBackgroundOnlyImageMode =
		backgroundMode === BACKGROUND_MODE.IMAGE && placementMode === PLACEMENT_MODE.BACKGROUND

	if (MagicPromptLocale.isChinese(locale)) {
		if (isBackgroundOnlyImageMode) {
			return (
				`先读取 ${productReference}，识别主体类型、主体数量、结构、轮廓比例、可见面、拍摄角度、姿态、摆放方向、材质、颜色与图案细节。` +
				`将 ${productReference} 作为成品中主体外观、数量和形态的唯一来源，成品主体数量必须与 ${productReference} 完全一致，不要使用 ${backgroundReference} 中主体的外观、数量、位置或组合关系，不要改成其他主体。`
			)
		}

		return (
			`先读取 ${productReference}，识别商品类型、结构组成、轮廓比例、材质、颜色、图案细节、拍摄角度与摆放方向。` +
			`将 ${productReference} 作为最终结果中商品主体的唯一来源，保持商品外观、结构细节、材质质感、颜色和方向一致，不要改成其他商品。`
		)
	}

	if (isBackgroundOnlyImageMode) {
		return (
			`First read ${productReference} and identify the subject type, subject count, structure, silhouette proportions, visible side, camera angle, pose, orientation, material, color, and pattern details. ` +
			`Use ${productReference} as the ONLY source of the subject appearance, count, and form in the final image. The final subject count must exactly match ${productReference}. Do not use the subject appearance, quantity, position, or arrangement visible in ${backgroundReference}, and do not turn it into a different subject. `
		)
	}

	return (
		`First read the product reference image ${productReference}, and identify the product category, construction, silhouette, material, color, pattern details, camera angle, and placement direction. ` +
		`Use ${productReference} as the ONLY source of the product in the final image. Preserve the product appearance, structure, material feel, color, and orientation. Do not turn it into a different product. `
	)
}

function buildSceneInstruction({
	backgroundMode,
	backgroundPrompt,
	productReference,
	backgroundReference,
	locale,
	placementMode,
}) {
	const isBackgroundOnlyImageMode =
		backgroundMode === BACKGROUND_MODE.IMAGE && placementMode === PLACEMENT_MODE.BACKGROUND

	if (MagicPromptLocale.isChinese(locale)) {
		if (backgroundMode === BACKGROUND_MODE.IMAGE) {
			if (isBackgroundOnlyImageMode) {
				return (
					`${backgroundReference} 只提供场景背景参考，尽量完整保留其中的空间、构图、光线、海报文字/标识、装饰图形与非主体背景元素。` +
					`若其中有商品、人物或其他明显主体，将其视为需要移除的原画面内容，补全其背后的背景；不要把这些主体作为商品位置、数量或姿态参考。`
				)
			}

			return (
				`${backgroundReference} 仅作为背景参考图，复用其环境、空间结构、景深层次、布光氛围、色彩基调和主要背景元素。` +
				"只替换背景与环境，不改变商品本体。"
			)
		}

		return (
			`根据以下背景描述生成全新场景：${backgroundPrompt.trim()}。` +
			"只生成新的背景环境，不改变商品本体。"
		)
	}

	if (backgroundMode === BACKGROUND_MODE.IMAGE) {
		if (isBackgroundOnlyImageMode) {
			return (
				`${backgroundReference} provides only the background scene reference. Preserve its space, composition, lighting, poster text/logos, decorative graphics, and non-subject background elements as completely as possible. ` +
				`If it contains products, people, or other clear subjects, treat them as original image content to remove and reconstruct the background behind them. Do not use those subjects as references for product position, quantity, or pose. `
			)
		}

		return (
			`${backgroundReference} is ONLY a background reference. Reuse its environment, spatial structure, depth layering, lighting mood, color palette, and major background elements. ` +
			"Change only the background and environment while keeping the product itself unchanged. "
		)
	}

	return (
		`Generate a brand-new background based on this direction: ${backgroundPrompt.trim()}. ` +
		"Generate only the background environment while keeping the product itself unchanged. "
	)
}

function buildPlacementInstruction({
	backgroundMode,
	placementMode,
	backgroundReference,
	productReference,
	locale,
}) {
	const normalizedPlacementMode =
		backgroundMode === BACKGROUND_MODE.PROMPT && placementMode === PLACEMENT_MODE.REPLACE
			? PLACEMENT_MODE.SMART
			: placementMode

	return resolvePlacementPromptSuffix(getPlacementModeDefinition(normalizedPlacementMode), {
		backgroundMode,
		backgroundReference,
		productReference,
		locale,
	})
}

function buildProductBackgroundSwapPrompt({
	backgroundMode,
	backgroundPrompt,
	locale,
	placementMode,
}) {
	const productReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const backgroundReference = MagicPromptLocale.getReferenceLabel(2, locale)
	const prompt =
		buildProductIdentityInstruction({
			locale,
			productReference,
			backgroundReference,
			backgroundMode,
			placementMode,
		}) +
		buildSceneInstruction({
			backgroundMode,
			backgroundPrompt,
			productReference,
			backgroundReference,
			locale,
			placementMode,
		}) +
		buildPlacementInstruction({
			backgroundMode,
			placementMode,
			backgroundReference,
			productReference,
			locale,
		})

	if (MagicPromptLocale.isChinese(locale)) {
		return (
			prompt +
			"保证最终画面的透视、光线、阴影、反射和边缘融合自然一致，让结果看起来像一张完整且精修过的商业商品图。"
		)
	}

	return (
		prompt +
		"Keep the final image coherent in perspective, lighting, shadows, reflections, and edge blending so it looks like a polished commercial product photo."
	)
}

function buildProductBackgroundSwapRequest({
	state,
	helpers,
	baseImage,
	locale,
	selectedSize,
	select,
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
			placementMode: state.placementMode,
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
	render(ctx, instance, root) {
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
						"支持多图（最多 10 张），请确保仅使用本人或已合法授权的商品图。",
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
					patchOnSelect: (value, { state }) => {
						if (
							value === BACKGROUND_MODE.PROMPT &&
							state.placementMode === PLACEMENT_MODE.REPLACE
						) {
							return { placementMode: PLACEMENT_MODE.SMART }
						}
						return null
					},
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
										"上传 / 拖拽【参考图】",
									),
									alt: t("section.backgroundImage", "背景参考图"),
									help: t(
										"help.backgroundImage",
										"建议使用与商品原图视角、构图相近的简单背景图。",
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
										"输入背景描述内容，如：浅灰色摄影棚背景，柔和侧光，干净阴影...",
									),
									rows: 5,
									help: t(
										"help.backgroundPrompt",
										"适合商品细节复杂、背景相对简单的场景；描述越具体，背景越稳定。",
									),
									deps: ["productImages", "placementMode"],
									aiGenerate: {
										label: t("button.aiPlaceholder", "AI 生成"),
										loadingLabel: t("button.generating", "生成中…"),
										disabled: ({ state }) => !state.productImages?.length,
										completeImagePrompt: {
											referenceImages: ({ state }) => state.productImages,
											userPrompt: ({ state }) =>
												buildPromptCompletionUserPrompt({
													imageCount: state.productImages.length,
													placementMode: state.placementMode,
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
					id: "placementMode",
					kind: "option-group",
					stateKey: "placementMode",
					title: t("section.placementMode", "摆放方式"),
					variant: "card",
					descriptionMode: "inline",
					groupClassName: "pbs-placement-options",
					deps: ["backgroundMode", "placementMode"],
					options: ({ state }) => buildPlacementOptions(t, state.backgroundMode),
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
					deps: ["modelId", "modelOptions"],
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
					deps: ["modelId", "modelOptions"],
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "商品换背景")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImages.length) {
						return t("empty.productImages", "请先上传至少 1 张商品图")
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
					return ""
				},
				isDisabled: ({ state }) =>
					!state.productImages.length ||
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
						state.productImages.map((baseImage, index) =>
							generateAndPlace(
								buildProductBackgroundSwapRequest({
									state,
									helpers,
									baseImage,
									locale: promptLocale,
									selectedSize,
									select: index === state.productImages.length - 1,
								}),
							),
						),
					)

					return results.length === 1 ? results[0] : results
				},
			},
		})
	},
})
