/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const EXTRACTION_TYPE = {
	REFINED_3D: "refined3d",
	FLAT: "flat",
}

const GARMENT_CATEGORY = {
	TOP: "top",
	OUTERWEAR: "outerwear",
	BOTTOM: "bottom",
	DRESS: "dress",
	SET: "set",
}

const BACKGROUND_MODE = {
	WHITE: "whiteStudio",
	GRAY: "grayStudio",
	TRANSPARENT: "transparent",
}

const EXTRACTION_TYPE_OPTIONS = [
	{
		value: EXTRACTION_TYPE.REFINED_3D,
		labelKey: "extraction.refined3d",
		labelFallback: "3D精修",
		promptText: {
			zh: "3D 棚拍效果精修图，独立服装商品图，立体廓形清晰，摄影棚布光，细节精修",
			en:
				"3D refined studio product image, standalone apparel product shot, clear dimensional silhouette, studio lighting, polished details",
		},
	},
	{
		value: EXTRACTION_TYPE.FLAT,
		labelKey: "extraction.flat",
		labelFallback: "款式平铺",
		promptText: {
			zh: "款式平铺商品图，服装自然平铺，俯视或接近俯视角度，结构完整清晰",
			en:
				"flat lay apparel product image, garment laid naturally, top-down or near top-down view, complete and clear construction",
		},
	},
]

const GARMENT_CATEGORY_OPTIONS = [
	{
		value: GARMENT_CATEGORY.TOP,
		labelKey: "category.top",
		labelFallback: "上衣",
		promptText: {
			zh: "上衣，包括衬衫、T恤、卫衣、针织衫等，不要提取外套、裤装或裙装",
			en:
				"top garment such as shirt, T-shirt, sweatshirt, or knitwear; do not extract outerwear, pants, or skirt",
		},
	},
	{
		value: GARMENT_CATEGORY.OUTERWEAR,
		labelKey: "category.outerwear",
		labelFallback: "外套",
		promptText: {
			zh: "外套，包括夹克、大衣、风衣、西装外套、羽绒服等，不要提取内搭或下装",
			en:
				"outerwear such as jacket, coat, trench coat, blazer, or down jacket; do not extract inner layers or bottoms",
		},
	},
	{
		value: GARMENT_CATEGORY.BOTTOM,
		labelKey: "category.bottom",
		labelFallback: "裤子/半身裙",
		promptText: {
			zh: "裤子或半身裙，只提取下装，不要提取上衣、外套或连衣裙整体",
			en:
				"pants or skirt; extract only the bottom garment, not tops, outerwear, or a full dress",
		},
	},
	{
		value: GARMENT_CATEGORY.DRESS,
		labelKey: "category.dress",
		labelFallback: "连衣裙",
		promptText: {
			zh: "连衣裙，保留从上身到裙摆的完整一体式服装结构",
			en: "dress, preserving the complete one-piece structure from bodice to hem",
		},
	},
	{
		value: GARMENT_CATEGORY.SET,
		labelKey: "category.set",
		labelFallback: "套装",
		promptText: {
			zh: "套装，保留上下装或多件套之间的搭配关系、比例和整体款式语言",
			en:
				"matching set, preserving the relationship, proportions, and overall style language across the pieces",
		},
	},
]

const BACKGROUND_OPTIONS = [
	{
		value: BACKGROUND_MODE.WHITE,
		labelKey: "background.white",
		labelFallback: "纯白棚拍",
		promptText: {
			zh: "纯白摄影棚背景，干净无杂物，柔和自然阴影",
			en: "pure white studio background, clean and uncluttered, soft natural shadow",
		},
	},
	{
		value: BACKGROUND_MODE.GRAY,
		labelKey: "background.gray",
		labelFallback: "浅灰棚拍",
		promptText: {
			zh: "浅灰摄影棚背景，柔和布光，干净高级的商品图质感",
			en: "light gray studio background, soft lighting, clean premium product-image feel",
		},
	},
	{
		value: BACKGROUND_MODE.TRANSPARENT,
		labelKey: "background.transparent",
		labelFallback: "透明背景",
		promptText: {
			zh: "透明底抠图效果，服装边缘干净，适合后续排版；如模型不支持透明通道则使用纯白背景",
			en:
				"transparent cutout effect with clean garment edges for layout use; if alpha transparency is unavailable, use a pure white background",
		},
	},
]

function createInitialState() {
	return {
		styleImage: null,
		targetDescription: "",
		extractionType: EXTRACTION_TYPE.REFINED_3D,
		garmentCategory: GARMENT_CATEGORY.TOP,
		backgroundMode: BACKGROUND_MODE.WHITE,
		genCount: 1,
	}
}

function getSelectedOption(options, value) {
	return options.find((item) => item.value === value) ?? options[0]
}

function mapOptions(options, t) {
	return options.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
	}))
}

function pickPromptText(option, locale) {
	return MagicPromptLocale.pickText(option.promptText, locale)
}

function buildTargetDescriptionClause(targetDescription, locale) {
	const normalizedText = String(targetDescription ?? "").trim()
	if (!normalizedText) return ""
	return MagicPromptLocale.isChinese(locale)
		? `用户指定目标服装：${normalizedText}。`
		: `User-specified target garment: ${normalizedText}. `
}

function buildPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const reference = MagicPromptLocale.getReferenceLabel(1, locale)
	const extractionType = getSelectedOption(EXTRACTION_TYPE_OPTIONS, state.extractionType)
	const garmentCategory = getSelectedOption(GARMENT_CATEGORY_OPTIONS, state.garmentCategory)
	const background = getSelectedOption(BACKGROUND_OPTIONS, state.backgroundMode)
	const extractionText = pickPromptText(extractionType, locale)
	const categoryText = pickPromptText(garmentCategory, locale)
	const backgroundText = pickPromptText(background, locale)
	const targetDescriptionClause = buildTargetDescriptionClause(state.targetDescription, locale)

	if (isChinese) {
		return (
			`基于${reference}的款式图进行服装款式提取，输入可能是 look 图、手机随拍图、局部截图或已裁剪服装图。` +
			targetDescriptionClause +
			`提取服装品类：${categoryText}。` +
			`输出类型：${extractionText}。` +
			`输出背景：${backgroundText}。` +
			"请从原图中识别并提取目标服装的版型、廓形、比例、领口、袖型、门襟、口袋、褶裥、腰线、下摆、结构线、面料质感、纹理、印花、颜色和辅料细节。" +
			"去除人体、头发、手臂、腿部、背景杂物、其他不属于目标服装的单品和拍摄噪点干扰，生成独立服装商品图。" +
			"若原图存在轻微遮挡或随拍褶皱，请合理整理成适合服装设计沟通和电商展示的精修效果，但不要改变目标服装的核心款式、颜色、图案、材质和关键设计点。" +
			"不要添加真人模特、文字、水印、logo、吊牌、衣架或多余道具。"
		)
	}

	return (
		`Extract an apparel style from the style reference ${reference}. The input may be a look photo, mobile snapshot, cropped detail, or clean garment image. ` +
		targetDescriptionClause +
		`Garment category: ${categoryText}. ` +
		`Output type: ${extractionText}. ` +
		`Output background: ${backgroundText}. ` +
		"Identify and extract the target garment's pattern, silhouette, proportions, neckline, sleeves, placket, pockets, pleats, waistline, hem, construction lines, material feel, texture, print, color, and trims. " +
		"Remove the body, hair, arms, legs, background clutter, unrelated garments, and snapshot noise. Generate a standalone apparel product image. " +
		"If the source has minor occlusion or casual wrinkles, cleanly arrange it into a polished result suitable for fashion design communication and e-commerce display, while preserving the core style, color, pattern, material, and key design details. " +
		"Do not add a real model, text, watermark, logo, hangtag, hanger, or extra props."
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
			panelClassName: "style-extraction",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "styleImage",
					kind: "image-slot",
					stateKey: "styleImage",
					title: t("section.styleImage", "款式图"),
					required: true,
					uploadLabel: t("upload.styleImage", "点击上传款式图"),
					alt: t("section.styleImage", "款式图"),
					help: t(
						"upload.styleImage.help",
						"支持上传 look 图、手机随拍图、局部截图或已裁剪服装图。若画面有多件服装，建议截取目标服装区域，提取更准确。",
					),
				},
				{
					id: "targetDescription",
					kind: "textarea",
					stateKey: "targetDescription",
					title: t("section.targetDescription", "目标服装描述"),
					placeholder: t(
						"placeholder.targetDescription",
						"如：只提取黑色短外套，不要内搭和裤子",
					),
					rows: 2,
				},
				{
					id: "extractionType",
					kind: "option-group",
					stateKey: "extractionType",
					title: t("section.extractionType", "提取类型"),
					groupClassName: "style-extraction-two-grid",
					options: mapOptions(EXTRACTION_TYPE_OPTIONS, t),
				},
				{
					id: "garmentCategory",
					kind: "option-group",
					stateKey: "garmentCategory",
					title: t("section.garmentCategory", "提取服装品类"),
					groupClassName: "style-extraction-category-grid",
					options: mapOptions(GARMENT_CATEGORY_OPTIONS, t),
				},
				{
					id: "backgroundMode",
					kind: "option-group",
					stateKey: "backgroundMode",
					title: t("section.background", "输出背景"),
					groupClassName: "style-extraction-three-grid",
					options: mapOptions(BACKGROUND_OPTIONS, t),
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
				buttonLabel: `✨ ${t("button.generate", "生成款式提取图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.styleImage) return t("empty.styleImage", "请先上传款式图")
					return ""
				},
				isDisabled: ({ state }) => !state.styleImage,
				validate: ({ state, helpers }) => {
					if (!state.styleImage) return t("empty.styleImage", "请先上传款式图")

					const maxReferenceImages =
						helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 1
					if (maxReferenceImages < 1) {
						return t("error.referenceLimit", "参考图数量已达当前模型上限")
					}
					if (helpers.collectReferenceIds([state.styleImage]).length !== 1) {
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
						prompt: buildPrompt({
							state,
							locale: promptLocale,
						}),
						reference_images: helpers.collectReferenceIds([state.styleImage]),
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						width,
						height,
						count: state.genCount,
						select: false,
					}
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "款式提取图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
