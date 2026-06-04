/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const MAX_PRODUCT_IMAGES = 5
const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const SHOWCASE_TYPE_DEFINITIONS = [
	{
		value: "model",
		labelKey: "showcaseType.model",
		labelFallback: "模特展示图",
		descriptionKey: "showcaseType.model.desc",
		descriptionFallback: "生成的图片含有真人模特，展现商品上身效果或与真人互动效果。",
		promptInstruction: {
			zh: "生成带有真人模特的种草图，让模特自然出镜并与商品形成真实互动，突出上身效果、使用状态或穿搭氛围。人物表现要自然可信，商品仍然是视觉重点。",
			en: "Create an inspiration image with a real human model. Show natural human presence and believable interaction with the product, highlighting how it looks when worn, used, or experienced. The person should feel natural and credible while the product remains the visual priority. ",
		},
	},
	{
		value: "scene",
		labelKey: "showcaseType.scene",
		labelFallback: "场景陈列图",
		descriptionKey: "showcaseType.scene.desc",
		descriptionFallback: "生成的图片不含真人模特，聚焦商品在真实场景中的氛围与陈列。",
		promptInstruction: {
			zh: "生成不含真人模特的种草图，聚焦商品在真实场景中的陈列、氛围、镜头语言和生活方式感。不要出现真人主体，让商品陈列和场景质感承担视觉吸引力。",
			en: "Create an inspiration image without human models. Focus on the product's placement, atmosphere, framing, and lifestyle mood inside a believable real-world scene. Do not introduce a human subject; let the display and scene quality drive the visual appeal. ",
		},
	},
]

function createInitialState() {
	return {
		productImages: [],
		creationMode: "smart",
		showcaseType: "model",
		extraPrompt: "",
		inspirationImage: null,
		genCount: 1,
	}
}

function buildCreationModeOptions(t) {
	return [
		{
			value: "smart",
			label: t("creationMode.smart", "智能生成"),
			description: t(
				"creationMode.smart.desc",
				"AI 智能解析商品图，快速生成氛围感拉满、吸睛抢眼的种草图。",
			),
		},
		{
			value: "inspiration",
			label: t("creationMode.inspiration", "灵感参考"),
			description: t(
				"creationMode.inspiration.desc",
				"上传 1 张参考种草图，借鉴其氛围、构图和视觉调性来生成新的种草图。",
			),
		},
	]
}

function buildShowcaseTypeOptions(t) {
	return SHOWCASE_TYPE_DEFINITIONS.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
		description: t(item.descriptionKey, item.descriptionFallback),
	}))
}

function getReferenceImages(state) {
	return state.creationMode === "inspiration"
		? [...state.productImages, state.inspirationImage].filter(Boolean)
		: [...state.productImages]
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 5
}

function getShowcaseTypeDefinition(showcaseType) {
	return (
		SHOWCASE_TYPE_DEFINITIONS.find((item) => item.value === showcaseType) ??
		SHOWCASE_TYPE_DEFINITIONS[0]
	)
}

function buildInspirationImageRequest({ state, helpers, locale }) {
	const selectedSize = helpers.getSelectedSize(state)
	const width = selectedSize.genW
	const height = selectedSize.genH

	return {
		model_id: state.modelId,
		prompt: buildInspirationImagePrompt({ state, locale }),
		reference_images: helpers.collectReferenceIds(getReferenceImages(state)),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildInspirationImagePrompt({ state, locale }) {
	return state.creationMode === "inspiration"
		? buildReferenceInspirationPrompt({ state, locale })
		: buildSmartInspirationPrompt({ state, locale })
}

function buildSmartInspirationPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const productReferences = MagicPromptLocale.joinReferenceLabels(
		state.productImages.length,
		locale,
	)
	const showcaseType = getShowcaseTypeDefinition(state.showcaseType)
	const showcaseInstruction = MagicPromptLocale.pickText(showcaseType.promptInstruction, locale)
	const extraPrompt = state.extraPrompt.trim()

	if (isChinese) {
		return (
			`先智能解析${productReferences}中的商品主体、材质、颜色、细节和适用场景，再生成高完成度的电商种草图。` +
			`当前任务类型：${showcaseType.labelFallback}。` +
			showcaseInstruction +
			"整体画面要氛围感拉满、吸睛抢眼，具备真实生活方式感、明确视觉焦点和适合社媒传播的封面表现力。" +
			"商品必须保持外观准确，不能擅自改动颜色、材质、轮廓、结构比例或核心功能特征。" +
			(state.showcaseType === "model"
				? "允许通过人物姿态、目光、动作和镜头语言增强代入感，但不要让人物喧宾夺主。"
				: "不要出现真人模特或显著人物主体，重点通过场景陈列、道具搭配、光影和镜头氛围突出商品。") +
			(extraPrompt ? `额外要求：${extraPrompt}。` : "") +
			(state.genCount > 1
				? "多张生成时请保持同一商品设定一致，同时在构图、景别或氛围细节上做自然变化。"
				: "")
		)
	}

	return (
		`First analyze the product subject, material, color, details, and usage context from ${productReferences}, then create a polished ecommerce inspiration image. ` +
		`Current task type: ${showcaseType.labelFallback}. ` +
		showcaseInstruction +
		"The final image should feel highly atmospheric, attention-grabbing, and socially shareable, with a clear focal point and strong lifestyle appeal. " +
		"Keep the product appearance accurate and do not alter its color, material, silhouette, structural proportion, or core functional traits. " +
		(state.showcaseType === "model"
			? "Human pose, gaze, gesture, and camera language may enhance immersion, but the person must not overpower the product. "
			: "Do not introduce human models or a dominant human subject; use scene styling, props, light, and framing to make the product stand out. ") +
		(extraPrompt ? `Additional instructions: ${extraPrompt}. ` : "") +
		(state.genCount > 1
			? "When generating multiple images, keep the same product truth across the set while introducing natural variation in composition, shot distance, or atmosphere. "
			: "")
	)
}

function buildReferenceInspirationPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const productReferences = MagicPromptLocale.joinReferenceLabels(
		state.productImages.length,
		locale,
	)
	const inspirationReference = MagicPromptLocale.getReferenceLabel(
		state.productImages.length + 1,
		locale,
	)

	if (isChinese) {
		return (
			`使用${productReferences}作为商品真实性基准，使用${inspirationReference}作为灵感参考图，生成一张新的商品种草图。` +
			`仅借鉴${inspirationReference}中的氛围、构图、景别、镜头语言、场景风格、色调和营销气质。` +
			"不要照搬参考图中的其他商品、人物、品牌元素、文案、Logo 或主体关系。" +
			"商品必须严格遵循商品图定义的外观信息，保持颜色、材质、轮廓、比例和关键细节准确。" +
			"最终结果要有强种草感、强视觉吸引力和清晰的社媒封面表现，但仍然像一张全新的原创商品图。" +
			(state.genCount > 1
				? "多张生成时请围绕同一灵感方向做自然变化，不要只是机械重复同一张图。"
				: "")
		)
	}

	return (
		`Use ${productReferences} as the product-truth references and use ${inspirationReference} as the inspiration reference to create a new product inspiration image. ` +
		`Only borrow atmosphere, composition, shot distance, camera language, scene styling, color mood, and marketing tone from ${inspirationReference}. ` +
		"Do not copy unrelated products, people, brand elements, copywriting, logos, or subject relationships from that reference. " +
		"The product must strictly follow the appearance defined by the product references, keeping color, material, silhouette, proportion, and key details accurate. " +
		"The final result should feel highly desirable, visually striking, and suitable for social-media covers while still looking like a fresh original product image. " +
		(state.genCount > 1
			? "When generating multiple images, vary them naturally around the same inspiration direction instead of repeating the same frame mechanically. "
			: "")
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
			panelClassName: "one-click-product",
			state: instance.state,
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
					title: t("section.productImages", "商品图"),
					alt: t("section.productImages", "商品图"),
					addLabel: "+",
					help: t(
						"section.productImages.help",
						"支持上传多张商品图，AI 会先解析商品主体、材质与细节，再用于生成吸睛的种草图。",
					),
					maxCount: MAX_PRODUCT_IMAGES,
					deps: ["creationMode", "inspirationImage", "modelId", "modelOptions"],
					beforePick: ({ state, helpers }) => {
						if (countReferenceImages(state) >= getMaxReferenceImages(state, helpers)) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "creationMode",
					kind: "option-group",
					stateKey: "creationMode",
					title: t("section.creationMode", "创作模式"),
					groupClassName: "ocp-dual-option-group",
					showDescriptionOnHover: true,
					options: buildCreationModeOptions(t),
				},
				{
					id: "showcaseType",
					kind: "option-group",
					stateKey: "showcaseType",
					deps: ["creationMode"],
					title: t("section.showcaseType", "展示图选择"),
					groupClassName: "ocp-dual-option-group",
					showDescriptionOnHover: true,
					options: buildShowcaseTypeOptions(t),
					when: ({ state }) => state.creationMode === "smart",
				},
				{
					id: "extraPrompt",
					kind: "textarea",
					stateKey: "extraPrompt",
					deps: ["creationMode"],
					title: t("section.extraPrompt", "额外描述"),
					placeholder: t(
						"placeholder.extraPrompt",
						"模特： 年轻女性，长发，自然站姿\n场景： 城市街头，晴天\n风格： 休闲通勤，简约时尚\n色调： 美拉德色系",
					),
					rows: 4,
					maxLength: 2000,
					when: ({ state }) => state.creationMode === "smart",
				},
				{
					id: "inspirationImage",
					kind: "image-slot",
					stateKey: "inspirationImage",
					deps: ["creationMode", "productImages", "modelId", "modelOptions"],
					title: t("section.inspirationImage", "参考种草图"),
					uploadLabel: t("upload.inspirationImage", "点击上传参考种草图"),
					alt: t("section.inspirationImage", "参考种草图"),
					help: t(
						"upload.inspirationImage.help",
						"上传 1 张你喜欢的种草图作为灵感参考，AI 会借鉴其氛围、构图与镜头表达，但不会直接照搬其中的商品主体。",
					),
					when: ({ state }) => state.creationMode === "inspiration",
					beforePick: ({ state, helpers }) => {
						if (countReferenceImages(state) >= getMaxReferenceImages(state, helpers)) {
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
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "canvasSize",
					kind: "size-control",
					title: t("section.canvasSize", "画布比例"),
					deps: ["modelId", "modelOptions", "scale"],
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
				buttonLabel: `✨ ${t("button.generate", "生成一键种草图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImages.length) {
						return t("empty.productImages", "请先上传商品图")
					}
					if (state.creationMode === "inspiration" && !state.inspirationImage) {
						return t("error.inspirationRequired", "请上传参考种草图")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.productImages.length ||
					(state.creationMode === "inspiration" && !state.inspirationImage),
				validate: ({ state, helpers }) => {
					if (!state.productImages.length) {
						return t("empty.productImages", "请先上传商品图")
					}
					if (state.productImages.length > MAX_PRODUCT_IMAGES) {
						return t("error.productLimit", "商品图最多上传 5 张")
					}
					if (state.creationMode === "inspiration" && !state.inspirationImage) {
						return t("error.inspirationRequired", "请上传参考种草图")
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
				execute: async ({ state, helpers, generateAndPlace }) =>
					generateAndPlace(
						buildInspirationImageRequest({ state, helpers, locale: promptLocale }),
					),
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "一键种草图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
