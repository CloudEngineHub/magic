/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const MAX_STYLE_IMAGES = 8
const GENDER = {
	WOMENS: "womens",
	MENS: "mens",
	GENDER_NEUTRAL: "genderNeutral",
}
const SEASON = {
	AUTUMN_WINTER: "autumnWinter",
	SPRING_SUMMER: "springSummer",
	RESORT: "resort",
	EARLY_AUTUMN: "earlyAutumn",
}
const MODEL_COUNT_OPTIONS = [1, 2, 3].map((count) => ({
	value: count,
	label: String(count),
}))

const GENDER_DEFINITIONS = [
	{
		value: GENDER.WOMENS,
		labelKey: "gender.womens",
		labelFallback: "女装",
		promptText: {
			zh: "女装",
			en: "womenswear",
		},
	},
	{
		value: GENDER.MENS,
		labelKey: "gender.mens",
		labelFallback: "男装",
		promptText: {
			zh: "男装",
			en: "menswear",
		},
	},
	{
		value: GENDER.GENDER_NEUTRAL,
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
		value: SEASON.AUTUMN_WINTER,
		labelKey: "season.autumnWinter",
		labelFallback: "秋冬",
		promptText: {
			zh: "秋冬",
			en: "autumn/winter",
		},
	},
	{
		value: SEASON.SPRING_SUMMER,
		labelKey: "season.springSummer",
		labelFallback: "春夏",
		promptText: {
			zh: "春夏",
			en: "spring/summer",
		},
	},
	{
		value: SEASON.RESORT,
		labelKey: "season.resort",
		labelFallback: "度假",
		promptText: {
			zh: "度假",
			en: "resort",
		},
	},
	{
		value: SEASON.EARLY_AUTUMN,
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
		gender: GENDER.WOMENS,
		season: "",
		styleKeywords: "",
		designDescription: "",
		displayScene: "",
		modelTryon: true,
		modelCount: 2,
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

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) return "用户当前未填写。"
	return normalizedCurrentText
}

function buildReferenceContextBlock(state) {
	return [
		`品牌名称：${state.brandName.trim() || "未填写"}`,
		`服装品类：${state.garmentCategory.trim() || "未填写"}`,
		`性别：${getGenderDefinition(state.gender).labelFallback}`,
		`季节：${getSeasonDefinition(state.season)?.labelFallback ?? "未选择"}`,
	].join("\n")
}

function buildStyleKeywordsCompletionUserPrompt({ state, currentText }) {
	return [
		"任务目标：为大牌设计插件的“风格关键词”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		buildReferenceContextBlock(state),
		"参考图角色：款式图、面料图或局部细节图用于理解品牌调性、廓形、面料质感、工艺语言和装饰细节。",
		"补全方向：可补充风格流派、品牌气质、色彩氛围、面料语言、剪裁感和视觉关键词。",
		"业务限制：关键词要简短、明确、适合服装设计方向；不要输出完整生成任务说明，只输出适合填入“风格关键词”的短提示词。",
	].join("\n")
}

function buildDesignDescriptionCompletionUserPrompt({ state, currentText }) {
	return [
		"任务目标：为大牌设计插件的“设计描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		buildReferenceContextBlock(state),
		"参考图角色：款式图、面料图或局部细节图用于理解廓形、结构、面料、工艺、辅料和局部设计语言。",
		"补全方向：可补充廓形结构、拼接方式、领口袖口、口袋、门襟、面料组合、工艺细节、装饰元素和成衣落地感。",
		"业务限制：描述要服务于可落地的大牌款式方案，避免泛化、廉价、偏离品类；只输出适合填入“设计描述”的短提示词。",
	].join("\n")
}

function buildDisplaySceneCompletionUserPrompt({ state, currentText }) {
	return [
		"任务目标：为大牌设计插件的“陈列场景”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		buildReferenceContextBlock(state),
		`模特试穿：${state.modelTryon ? "开启" : "关闭"}。`,
		"参考图角色：款式参考用于理解服装调性，陈列场景需要承托品牌感和成片质感。",
		"补全方向：可补充摄影棚、秀场、城市街景、荒漠、画廊、极简空间、光线、镜头氛围和高级陈列方式。",
		"业务限制：场景要突出服装款式方案，不要喧宾夺主；只输出适合填入“陈列场景”的短提示词。",
	].join("\n")
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
					deps: ["styleImages"],
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.styleImages?.length,
						completeImagePrompt: {
							referenceImages: ({ state }) => state.styleImages,
							referencesMessage: t("error.extraReferences", "请先上传款式图"),
							userPrompt: ({ state }) =>
								buildStyleKeywordsCompletionUserPrompt({
									state,
									currentText: state.styleKeywords,
								}),
						},
					},
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
					deps: ["styleImages"],
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.styleImages?.length,
						completeImagePrompt: {
							referenceImages: ({ state }) => state.styleImages,
							referencesMessage: t("error.extraReferences", "请先上传款式图"),
							userPrompt: ({ state }) =>
								buildDesignDescriptionCompletionUserPrompt({
									state,
									currentText: state.designDescription,
								}),
						},
					},
				},
				{
					id: "displayScene",
					kind: "textarea",
					stateKey: "displayScene",
					title: t("section.displayScene", "陈列场景"),
					placeholder: t("placeholder.displayScene", "请输入，例如：摄影棚、极简、荒漠"),
					deps: ["styleImages"],
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.styleImages?.length,
						completeImagePrompt: {
							referenceImages: ({ state }) => state.styleImages,
							referencesMessage: t("error.extraReferences", "请先上传款式图"),
							userPrompt: ({ state }) =>
								buildDisplaySceneCompletionUserPrompt({
									state,
									currentText: state.displayScene,
								}),
						},
					},
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
				buttonLabel: `✨ ${t("button.generate", "生成大牌设计方案")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.styleImages.length) {
						return t("empty.styleImages", "请先上传至少 1 张款式图")
					}
					if (!state.brandName.trim()) {
						return t("empty.brandName", "请先输入品牌名称")
					}
					if (!state.garmentCategory.trim()) {
						return t("empty.garmentCategory", "请先输入服装品类")
					}
					return null
				},
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
			},
		})
	},
})
