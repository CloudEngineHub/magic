/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const MAX_STYLE_IMAGES = 8
const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))
const MODEL_COUNT_OPTIONS = [1, 2, 3].map((count) => ({
	value: count,
	label: String(count),
}))

const GENDER_DEFINITIONS = [
	{
		value: "womens",
		labelKey: "gender.womens",
		labelFallback: "女装",
		promptText: {
			zh: "女装",
			en: "womenswear",
		},
	},
	{
		value: "mens",
		labelKey: "gender.mens",
		labelFallback: "男装",
		promptText: {
			zh: "男装",
			en: "menswear",
		},
	},
	{
		value: "genderNeutral",
		labelKey: "gender.genderNeutral",
		labelFallback: "无性别",
		promptText: {
			zh: "无性别",
			en: "gender-neutral",
		},
	},
]

const SEASON_DEFINITIONS = [
	{
		value: "autumnWinter",
		labelKey: "season.autumnWinter",
		labelFallback: "秋冬",
		promptText: {
			zh: "秋冬",
			en: "autumn/winter",
		},
	},
	{
		value: "springSummer",
		labelKey: "season.springSummer",
		labelFallback: "春夏",
		promptText: {
			zh: "春夏",
			en: "spring/summer",
		},
	},
	{
		value: "resort",
		labelKey: "season.resort",
		labelFallback: "度假",
		promptText: {
			zh: "度假",
			en: "resort",
		},
	},
	{
		value: "earlyAutumn",
		labelKey: "season.earlyAutumn",
		labelFallback: "早秋",
		promptText: {
			zh: "早秋",
			en: "early autumn",
		},
	},
]

const DEFAULT_DISPLAY_SCENE = {
	zh: "摄影棚、极简",
	en: "studio photography, minimalist",
}

const DEFAULT_STYLE_KEYWORDS = {
	zh: "极简风",
	en: "minimalist style",
}

function createInitialState() {
	return {
		styleImages: [],
		brandName: "",
		garmentCategory: "",
		gender: "womens",
		season: "",
		styleKeywords: "",
		designDescription: "",
		displayScene: "",
		modelTryon: true,
		modelCount: 2,
		genCount: 1,
	}
}

function getMaxReferenceImages(state, helpers) {
	return (
		helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? MAX_STYLE_IMAGES
	)
}

function buildGenderOptions(t) {
	return GENDER_DEFINITIONS.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
	}))
}

function buildSeasonOptions(t) {
	return SEASON_DEFINITIONS.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
	}))
}

function getGenderDefinition(gender) {
	return GENDER_DEFINITIONS.find((item) => item.value === gender) ?? GENDER_DEFINITIONS[0]
}

function getSeasonDefinition(season) {
	return SEASON_DEFINITIONS.find((item) => item.value === season) ?? null
}

function getEffectiveDisplayScene(displayScene, locale) {
	const normalized = displayScene?.trim()
	if (normalized) return normalized
	return MagicPromptLocale.pickText(DEFAULT_DISPLAY_SCENE, locale)
}

function getEffectiveStyleKeywords(styleKeywords, locale) {
	const normalized = styleKeywords?.trim()
	if (normalized) return normalized
	return MagicPromptLocale.pickText(DEFAULT_STYLE_KEYWORDS, locale)
}

function getEffectiveModelCount(modelCount) {
	return MODEL_COUNT_OPTIONS.some((item) => item.value === modelCount) ? modelCount : 2
}

function buildLuxuryBrandDesignPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const referenceCount = state.styleImages.length
	const references = MagicPromptLocale.joinReferenceLabels(referenceCount, locale)
	const genderText = MagicPromptLocale.pickText(
		getGenderDefinition(state.gender).promptText,
		locale,
	)
	const seasonDefinition = state.season ? getSeasonDefinition(state.season) : null
	const seasonText = seasonDefinition
		? MagicPromptLocale.pickText(seasonDefinition.promptText, locale)
		: null
	const styleKeywords = getEffectiveStyleKeywords(state.styleKeywords, locale)
	const displayScene = getEffectiveDisplayScene(state.displayScene, locale)
	const designDescription = state.designDescription?.trim()
	const brandName = state.brandName.trim()
	const garmentCategory = state.garmentCategory.trim()
	const modelCount = getEffectiveModelCount(state.modelCount)

	if (isChinese) {
		const seasonClause = seasonText ? `季节定位：${seasonText}。` : ""
		const designClause = designDescription ? `设计描述：${designDescription}。` : ""

		const displayClause = state.modelTryon
			? `陈列场景：${displayScene}。在场景中安排${modelCount}位模特试穿展示该款式方案，模特姿态自然、造型高级，但款式设计仍是画面核心。`
			: `陈列场景：${displayScene}。生成纯陈列/静物场景展示图，不要出现真人模特或显著人物主体，通过场景、光影与构图突出款式方案本身。`

		return (
			`基于${references}中的参考款式图、面料图或局部细节图，为「${brandName}」品牌生成高度契合品牌调性、指向精准的${garmentCategory}款式方案。` +
			`参考图可能分别提供廓形、面料质感与工艺细节，请综合吸收并输出统一、可落地的设计表达。` +
			`目标性别：${genderText}。` +
			seasonClause +
			`风格关键词：${styleKeywords}。` +
			designClause +
			displayClause +
			"成片需具备商业大片质感，廓形结构清晰，面料与工艺细节可信，色彩与品牌气质一致，避免泛化、廉价或偏离品类的设计。" +
			(state.genCount > 1
				? "多张生成时保持同一品牌与款式设定一致，在构图、角度或细节呈现上做自然变化。"
				: "")
		)
	}

	const seasonClause = seasonText ? `Season direction: ${seasonText}. ` : ""
	const designClause = designDescription ? `Design description: ${designDescription}. ` : ""

	const displayClause = state.modelTryon
		? `Display scene: ${displayScene}. Arrange ${modelCount} model${modelCount > 1 ? "s" : ""} in the scene to showcase the design through believable try-on styling. Keep the garment design as the visual priority with premium posing and lighting. `
		: `Display scene: ${displayScene}. Create a pure display or still-life scene without human models or dominant human subjects. Use scene styling, light, and composition to highlight the design proposal itself. `

	return (
		`Using the style, fabric, and detail references from ${references}, create a highly on-brand and directionally precise ${garmentCategory} design proposal for the brand "${brandName}". ` +
		"The references may provide silhouette, fabric character, and craftsmanship details separately; synthesize them into one coherent, production-ready design expression. " +
		`Target gender: ${genderText}. ` +
		seasonClause +
		`Style keywords: ${styleKeywords}. ` +
		designClause +
		displayClause +
		"The final image should feel like premium campaign photography with clear silhouette structure, believable material and construction details, palette alignment with the brand, and no generic, cheap, or off-category design drift. " +
		(state.genCount > 1
			? "When generating multiple images, keep the same brand and design truth while varying composition, angle, or detail presentation naturally. "
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
			panelClassName: "luxury-brand-design",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "styleImages",
					kind: "image-grid",
					stateKey: "styleImages",
					title: t("section.styleImages", "款式图"),
					required: true,
					alt: t("section.styleImages", "款式图"),
					addLabel: "+",
					help: t(
						"upload.styleImages.help",
						"支持上传参考款式图、面料图或款式局部图，AI 将综合参考生成契合品牌调性的款式方案。",
					),
					maxCount: ({ state, helpers }) =>
						Math.max(
							1,
							Math.min(MAX_STYLE_IMAGES, getMaxReferenceImages(state, helpers)),
						),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "brandName",
					kind: "textarea",
					stateKey: "brandName",
					title: t("section.brandName", "品牌名称"),
					required: true,
					placeholder: t("placeholder.brandName", "请输入，例如：Gucci、LV、Chanel"),
					rows: 1,
					maxLength: 100,
				},
				{
					id: "garmentCategory",
					kind: "textarea",
					stateKey: "garmentCategory",
					title: t("section.garmentCategory", "服装品类"),
					required: true,
					placeholder: t(
						"placeholder.garmentCategory",
						"请输入，例如：外套、羽绒服、裤子",
					),
					rows: 1,
					maxLength: 100,
				},
				{
					id: "gender",
					kind: "option-group",
					stateKey: "gender",
					title: t("section.gender", "性别"),
					required: true,
					options: buildGenderOptions(t),
				},
				{
					id: "season",
					kind: "option-group",
					stateKey: "season",
					title: t("section.season", "季节"),
					options: buildSeasonOptions(t),
				},
				{
					id: "styleKeywords",
					kind: "textarea",
					stateKey: "styleKeywords",
					title: t("section.styleKeywords", "风格关键词"),
					placeholder: t(
						"placeholder.styleKeywords",
						"请输入，例如：极简风、学院风、淑女风",
					),
					rows: 2,
					maxLength: 200,
				},
				{
					id: "designDescription",
					kind: "textarea",
					stateKey: "designDescription",
					title: t("section.designDescription", "设计描述"),
					placeholder: t(
						"placeholder.designDescription",
						"请输入，例如：同色异质拼接设计、有创意的细节和工艺设计",
					),
					rows: 3,
					maxLength: 1000,
				},
				{
					id: "displayScene",
					kind: "textarea",
					stateKey: "displayScene",
					title: t("section.displayScene", "陈列场景"),
					placeholder: t("placeholder.displayScene", "请输入，例如：摄影棚、极简、荒漠"),
					rows: 2,
					maxLength: 200,
				},
				{
					id: "modelTryon",
					kind: "toggle",
					stateKey: "modelTryon",
					title: t("section.modelTryon", "模特试穿"),
					help: t(
						"modelTryon.help",
						"开启后，成片将包含模特在陈列场景中试穿展示设计方案。",
					),
				},
				{
					id: "modelCount",
					kind: "option-group",
					stateKey: "modelCount",
					title: t("section.modelCount", "模特数量"),
					options: MODEL_COUNT_OPTIONS,
					when: ({ state }) => state.modelTryon,
					deps: ["modelTryon"],
				},
				{
					id: "modelSelect",
					kind: "model-select",
					required: true,
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "resolution",
					kind: "resolution-select",
					required: true,
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "canvasSize",
					kind: "size-control",
					required: true,
					title: t("section.canvasSize", "画布尺寸"),
					deps: ["modelId", "modelOptions", "scale"],
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					required: true,
					title: t("section.count", "生成张数"),
					options: GENERATION_COUNT_GROUP_OPTIONS,
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成大牌设计方案")}`,
				loadingLabel: t("button.generating", "生成中…"),
				isDisabled: ({ state }) =>
					!state.styleImages.length ||
					!state.brandName.trim() ||
					!state.garmentCategory.trim(),
				validate: ({ state, helpers }) => {
					if (state.styleImages.length > getMaxReferenceImages(state, helpers)) {
						return t("error.referenceLimit", "参考图数量已达当前模型上限")
					}
					if (
						helpers.collectReferenceIds(state.styleImages).length !==
						state.styleImages.length
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
					const selectedSize = helpers.getSelectedSize(state)
					const width = selectedSize.genW
					const height = selectedSize.genH

					return {
						model_id: state.modelId,
						prompt: buildLuxuryBrandDesignPrompt({
							state,
							locale: promptLocale,
						}),
						reference_images: helpers.collectReferenceIds(state.styleImages),
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						width,
						height,
						count: state.genCount,
						select: false,
					}
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "大牌设计方案生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
