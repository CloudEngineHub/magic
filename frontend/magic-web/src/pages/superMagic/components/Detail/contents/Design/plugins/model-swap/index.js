/* global MagicPluginKit, registerMagicCanvasPlugin */

const MODE = {
	REF: "ref",
	CUSTOM: "custom",
}

const CHANGE_ITEMS = [
	{
		value: "hairstyle",
		labelKey: "change.hairstyle",
		labelFallback: "换发型",
		prompt: {
			zh: "将发型替换为参考模特图中的发型，保持自然发丝、发量、长度和发型轮廓。",
			en: "Replace the hairstyle with the exact hairstyle from the reference model image, preserving natural hair strands, volume, length, and silhouette.",
		},
	},
	{
		value: "face",
		labelKey: "change.face",
		labelFallback: "换头部",
		prompt: {
			zh: "将脸部和头部替换为参考模特图中的人物特征，同时保持原图头部角度和表情风格自然一致。",
			en: "Replace the face and head with the face from the reference model image while maintaining the original head angle and expression style naturally.",
		},
	},
	{
		value: "skinTone",
		labelKey: "change.skinTone",
		labelFallback: "换肤色",
		prompt: {
			zh: "将肤色调整为与参考模特图精准匹配，并保持全身可见皮肤色调一致。",
			en: "Change the skin tone to precisely match the reference model image and keep all visible skin areas consistent.",
		},
	},
	{
		value: "hairColor",
		labelKey: "change.hairColor",
		labelFallback: "换发色",
		prompt: {
			zh: "将发色调整为与参考模特图精准匹配，并保留真实光泽和明暗层次。",
			en: "Change the hair color to exactly match the reference model image while preserving realistic sheen and tonal depth.",
		},
	},
	{
		value: "fullBody",
		labelKey: "change.fullBody",
		labelFallback: "换全身",
		prompt: {
			zh: "替换整个人物外貌，包括脸部、头发、肤色、视觉年龄和身体比例，只保持服装与商品不变。",
			en: "Replace the entire model appearance, including face, hair, skin tone, apparent age, and body proportions, while keeping only the clothing and products unchanged.",
		},
	},
]

const APPEARANCE_STYLE_OPTIONS = [
	{
		value: "european",
		labelKey: "appearance.european",
		labelFallback: "欧美超模",
		descriptionKey: "appearance.european.desc",
		descriptionFallback: "深邃立体五官",
		prompt: {
			zh: "欧美超模气质，深邃眼窝、立体五官、高鼻梁、高颧骨，具备高级时装表现力",
			en: "European supermodel look, deep-set eyes, defined facial features, sharp nose, high cheekbones, high-fashion presence",
		},
	},
	{
		value: "asian",
		labelKey: "appearance.asian",
		labelFallback: "亚洲精致",
		descriptionKey: "appearance.asian.desc",
		descriptionFallback: "精致东方美",
		prompt: {
			zh: "亚洲精致美感，杏仁眼、细腻皮肤、优雅面部结构、干净商业气质",
			en: "East Asian refined beauty, almond-shaped eyes, delicate skin, elegant facial structure, clean commercial look",
		},
	},
	{
		value: "korean",
		labelKey: "appearance.korean",
		labelFallback: "日韩清甜",
		descriptionKey: "appearance.korean.desc",
		descriptionFallback: "清透甜美系",
		prompt: {
			zh: "日韩清甜美感，清透光泽肌肤、柔和五官、年轻甜美、自然亲和",
			en: "Korean and Japanese sweet beauty ideal, clear dewy skin, soft youthful features, natural approachable look",
		},
	},
	{
		value: "mixed",
		labelKey: "appearance.mixed",
		labelFallback: "混血甜心",
		descriptionKey: "appearance.mixed.desc",
		descriptionFallback: "东西合璧美",
		prompt: {
			zh: "混血甜心气质，东西方特征平衡，眼神突出，面部比例协调且有记忆点",
			en: "Mixed ethnicity beauty, balanced East-West features, striking eyes, harmonious and memorable facial proportions",
		},
	},
	{
		value: "latina",
		labelKey: "appearance.latina",
		labelFallback: "拉丁热辣",
		descriptionKey: "appearance.latina.desc",
		descriptionFallback: "热情奔放感",
		prompt: {
			zh: "拉丁美感，暖橄榄肤色、深邃眼神、饱满唇形、热情有张力",
			en: "Latina beauty, warm olive skin tone, expressive dark eyes, full lips, vibrant passionate look",
		},
	},
	{
		value: "african",
		labelKey: "appearance.african",
		labelFallback: "非洲女神",
		descriptionKey: "appearance.african.desc",
		descriptionFallback: "大气时髦感",
		prompt: {
			zh: "非洲高定模特气质，深色肌肤、鲜明五官、自信强大、时髦编辑感",
			en: "African high-fashion beauty, rich melanin skin, bold striking features, confident powerful editorial presence",
		},
	},
	{
		value: "nordic",
		labelKey: "appearance.nordic",
		labelFallback: "北欧冷艳",
		descriptionKey: "appearance.nordic.desc",
		descriptionFallback: "冰雪高冷感",
		prompt: {
			zh: "北欧冷艳气质，浅色眼睛、冷调白皙肤色、利落脸部线条、高级疏离感",
			en: "Nordic Scandinavian beauty, light eyes, cool fair skin, sharp angular features, refined distant elegance",
		},
	},
	{
		value: "middleEast",
		labelKey: "appearance.middleEast",
		labelFallback: "中东神秘",
		descriptionKey: "appearance.middleEast.desc",
		descriptionFallback: "神秘魅力感",
		prompt: {
			zh: "中东神秘美感，大杏仁眼、浓密眉形、橄榄至小麦肤色、异域魅力",
			en: "Middle Eastern beauty, large almond-shaped dark eyes, arched brows, olive to tan skin, mysterious allure",
		},
	},
	{
		value: "southAsian",
		labelKey: "appearance.southAsian",
		labelFallback: "南亚异域",
		descriptionKey: "appearance.southAsian.desc",
		descriptionFallback: "异域风情感",
		prompt: {
			zh: "南亚异域美感，暖金棕肤色、大而有神的眼睛、饱满唇形、浓郁民族特征",
			en: "South Asian beauty, warm golden-brown skin, large expressive eyes, full lips, rich ethnic features",
		},
	},
]

const FACE_SHAPE_OPTIONS = [
	{
		value: "oval",
		labelKey: "face.oval",
		labelFallback: "鹅蛋脸",
		prompt: {
			zh: "鹅蛋脸，比例均衡，轮廓流畅",
			en: "oval egg-shaped face, balanced proportions",
		},
	},
	{
		value: "vShape",
		labelKey: "face.vShape",
		labelFallback: "瓜子脸",
		prompt: {
			zh: "瓜子脸，下巴精致，脸部线条纤细",
			en: "V-shaped slender face, delicate pointed chin",
		},
	},
	{
		value: "heart",
		labelKey: "face.heart",
		labelFallback: "心形脸",
		prompt: {
			zh: "心形脸，额头略宽，下巴收窄",
			en: "heart-shaped face, wider forehead, narrow pointed chin",
		},
	},
	{
		value: "round",
		labelKey: "face.round",
		labelFallback: "圆脸",
		prompt: { zh: "圆脸，脸颊饱满，下颌线柔和", en: "round face, soft jawline, full cheeks" },
	},
	{
		value: "square",
		labelKey: "face.square",
		labelFallback: "方形脸",
		prompt: {
			zh: "方形脸，清晰下颌线，面部更有力量感",
			en: "square face, strong defined jawline, angular features",
		},
	},
	{
		value: "long",
		labelKey: "face.long",
		labelFallback: "长脸",
		prompt: { zh: "长脸，脸部纵向比例更修长", en: "long narrow face, elongated features" },
	},
]

const HAIRSTYLE_OPTIONS = [
	{
		value: "longStraight",
		labelKey: "hair.longStraight",
		labelFallback: "长直发",
		prompt: { zh: "丝滑长直发，自然垂落", en: "long straight silky hair flowing down" },
	},
	{
		value: "wavy",
		labelKey: "hair.wavy",
		labelFallback: "波浪卷",
		prompt: { zh: "蓬松长波浪卷发", en: "long wavy voluminous curls" },
	},
	{
		value: "shortBob",
		labelKey: "hair.shortBob",
		labelFallback: "短波波头",
		prompt: { zh: "利落下巴长度短波波头", en: "sleek chin-length bob haircut" },
	},
	{
		value: "pixie",
		labelKey: "hair.pixie",
		labelFallback: "超短发",
		prompt: { zh: "时髦超短发，干练有个性", en: "edgy pixie cut, ultra-short stylish hair" },
	},
	{
		value: "ponytail",
		labelKey: "hair.ponytail",
		labelFallback: "马尾辫",
		prompt: { zh: "高马尾，干净利落", en: "high ponytail, sleek and polished" },
	},
	{
		value: "updo",
		labelKey: "hair.updo",
		labelFallback: "盘发",
		prompt: { zh: "优雅盘发造型", en: "elegant updo bun hairstyle" },
	},
	{
		value: "curly",
		labelKey: "hair.curly",
		labelFallback: "自然卷",
		prompt: { zh: "自然蓬松卷发", en: "natural curly voluminous hair" },
	},
	{
		value: "braided",
		labelKey: "hair.braided",
		labelFallback: "辫子",
		prompt: { zh: "时髦编发造型", en: "stylish braided hairstyle" },
	},
	{
		value: "bangs",
		labelKey: "hair.bangs",
		labelFallback: "刘海",
		prompt: { zh: "整齐刘海搭配自然发型", en: "full blunt bangs with flowing hair" },
	},
]

const HAIR_COLOR_OPTIONS = [
	{
		value: "black",
		labelKey: "hairColor.black",
		labelFallback: "黑色",
		prompt: { zh: "自然黑发色", en: "jet black hair color" },
	},
	{
		value: "darkBrown",
		labelKey: "hairColor.darkBrown",
		labelFallback: "深棕",
		prompt: { zh: "深巧克力棕发色", en: "dark chocolate brown hair color" },
	},
	{
		value: "brown",
		labelKey: "hairColor.brown",
		labelFallback: "栗棕",
		prompt: { zh: "暖栗棕发色", en: "warm chestnut brown hair color" },
	},
	{
		value: "golden",
		labelKey: "hairColor.golden",
		labelFallback: "金色",
		prompt: { zh: "金色金棕发色", en: "golden blonde hair color" },
	},
	{
		value: "platinum",
		labelKey: "hairColor.platinum",
		labelFallback: "铂金",
		prompt: { zh: "近白铂金发色", en: "platinum blonde almost white hair color" },
	},
	{
		value: "red",
		labelKey: "hairColor.red",
		labelFallback: "红棕",
		prompt: { zh: "浓郁红棕发色", en: "rich auburn red-brown hair color" },
	},
	{
		value: "rose",
		labelKey: "hairColor.rose",
		labelFallback: "玫瑰金",
		prompt: { zh: "玫瑰金粉调发色", en: "rose gold pink-tinted hair color" },
	},
	{
		value: "silver",
		labelKey: "hairColor.silver",
		labelFallback: "银灰",
		prompt: { zh: "冷调银灰发色", en: "cool silver grey hair color" },
	},
	{
		value: "highlight",
		labelKey: "hairColor.highlight",
		labelFallback: "挑染",
		prompt: {
			zh: "自然层次挑染发色",
			en: "balayage highlighted hair with natural-looking multi-tonal color",
		},
	},
]

const SKIN_TONE_OPTIONS = [
	{
		value: "fair",
		labelKey: "skin.fair",
		labelFallback: "瓷白",
		swatch: "#F9EBE0",
		prompt: { zh: "瓷白肤色，干净通透", en: "very fair porcelain white skin tone" },
	},
	{
		value: "light",
		labelKey: "skin.light",
		labelFallback: "白皙",
		swatch: "#F4D5B8",
		prompt: { zh: "白皙肤色，自然明亮", en: "light fair skin tone" },
	},
	{
		value: "natural",
		labelKey: "skin.natural",
		labelFallback: "自然",
		swatch: "#E8B894",
		prompt: { zh: "自然中等肤色", en: "natural medium skin tone" },
	},
	{
		value: "warm",
		labelKey: "skin.warm",
		labelFallback: "小麦",
		swatch: "#C98B5A",
		prompt: { zh: "小麦肤色，暖调健康", en: "warm wheat medium-tan skin tone" },
	},
	{
		value: "tan",
		labelKey: "skin.tan",
		labelFallback: "健康棕",
		swatch: "#A0633A",
		prompt: { zh: "健康古铜棕肤色", en: "healthy tan bronze skin tone" },
	},
	{
		value: "deep",
		labelKey: "skin.deep",
		labelFallback: "深棕",
		swatch: "#6B3C2A",
		prompt: { zh: "浓郁深棕肤色", en: "rich deep brown skin tone" },
	},
	{
		value: "ebony",
		labelKey: "skin.ebony",
		labelFallback: "黑曜",
		swatch: "#3D2014",
		prompt: { zh: "黑曜深色肤色", en: "deep ebony dark skin tone" },
	},
]

const MAKEUP_OPTIONS = [
	{
		value: "bare",
		labelKey: "makeup.bare",
		labelFallback: "裸妆",
		prompt: {
			zh: "自然裸妆，清透微光肌肤",
			en: "natural no-makeup look, bare skin with subtle glow",
		},
	},
	{
		value: "japanese",
		labelKey: "makeup.japanese",
		labelFallback: "日系清纯",
		prompt: {
			zh: "日系清纯妆，柔粉腮红，自然唇色",
			en: "Japanese innocent makeup, soft pink blush, natural lip tint",
		},
	},
	{
		value: "korean",
		labelKey: "makeup.korean",
		labelFallback: "韩系光泽",
		prompt: {
			zh: "韩系水光妆，清透底妆，渐变唇色",
			en: "Korean glass skin dewy makeup, subtle gradient lip",
		},
	},
	{
		value: "smoky",
		labelKey: "makeup.smoky",
		labelFallback: "欧美烟熏",
		prompt: {
			zh: "欧美烟熏妆，眼线和眼影更有张力",
			en: "Western smoky eye makeup, bold eyeliner, dramatic shadow",
		},
	},
	{
		value: "vintage",
		labelKey: "makeup.vintage",
		labelFallback: "复古红唇",
		prompt: {
			zh: "复古红唇妆，经典眼线，精致眉形",
			en: "vintage glamour makeup, classic red lips, winged eyeliner",
		},
	},
	{
		value: "editorial",
		labelKey: "makeup.editorial",
		labelFallback: "大片感",
		prompt: {
			zh: "高定大片妆容，具有艺术化视觉重点",
			en: "high-fashion editorial makeup, bold artistic statement look",
		},
	},
]

function createInitialState() {
	return {
		mode: MODE.REF,
		sourceImage: null,
		refImage: null,
		changeItems: [],
		appearanceStyle: "",
		faceShape: "",
		hairstyle: "",
		hairColor: "",
		skinTone: "",
		makeup: "",
		extraPrompt: "",
		genCount: 1,
	}
}

function getOptionPrompt(options, value, locale) {
	const option = options.find((item) => item.value === value)
	if (!option) return ""
	const prompt = option.prompt
	if (typeof prompt === "string") return prompt
	return prompt?.[locale] ?? prompt?.zh ?? prompt?.en ?? ""
}

function getReferenceImages(state) {
	if (!state.sourceImage) return []
	return state.mode === MODE.REF && state.refImage
		? [state.sourceImage, state.refImage]
		: [state.sourceImage]
}

function hasCustomSelection(state) {
	return Boolean(
		state.appearanceStyle ||
		state.faceShape ||
		state.hairstyle ||
		state.hairColor ||
		state.skinTone ||
		state.makeup,
	)
}

function buildRefPrompt({ changeItems, extraPrompt, locale }) {
	const isChinese = locale === "zh"
	const selectedPrompts = CHANGE_ITEMS.filter((item) => changeItems.includes(item.value))
		.map((item) => getOptionPrompt(CHANGE_ITEMS, item.value, locale))
		.filter(Boolean)
	const extra = String(extraPrompt ?? "").trim()

	if (isChinese) {
		return [
			"参考图 1 是原模特图，参考图 2 是目标参考模特图。",
			"关键要求：严格保持参考图 1 中所有服装、商品、配饰、穿着方式、姿势、身体位置、构图、裁切、背景、光线和拍摄风格不变。",
			"只把参考图 2 中选定的人物外貌特征迁移到参考图 1 的人物上。",
			"需要执行的变化：",
			...selectedPrompts.map((prompt) => `- ${prompt}`),
			extra ? `补充描述：${extra}` : "",
			"最终结果必须是单人真实商业时尚大片质感，人物与服装融合自然，不能改变服装设计、图案、颜色、面料和商品轮廓。",
		]
			.filter(Boolean)
			.join("\n")
	}

	return [
		"Reference image 1 is the source model photo. Reference image 2 is the target reference model.",
		"Critical: keep all clothing, products, accessories, styling, pose, body position, composition, crop, background, lighting, and photographic style from reference image 1 exactly unchanged.",
		"Only transfer the selected appearance traits from reference image 2 onto the person in reference image 1.",
		"Apply the following transformations:",
		...selectedPrompts.map((prompt) => `- ${prompt}`),
		extra ? `Additional requirements: ${extra}` : "",
		"The result must look like a professional high-fashion editorial photo, with seamless photorealistic integration. Do not change garment design, patterns, colors, fabric, or product silhouette.",
	]
		.filter(Boolean)
		.join("\n")
}

function buildCustomPrompt({ state, locale }) {
	const isChinese = locale === "zh"
	const extra = String(state.extraPrompt ?? "").trim()
	const changes = [
		[
			"外貌风格",
			"Appearance style",
			getOptionPrompt(APPEARANCE_STYLE_OPTIONS, state.appearanceStyle, locale),
		],
		["脸型", "Face shape", getOptionPrompt(FACE_SHAPE_OPTIONS, state.faceShape, locale)],
		["发型", "Hairstyle", getOptionPrompt(HAIRSTYLE_OPTIONS, state.hairstyle, locale)],
		["发色", "Hair color", getOptionPrompt(HAIR_COLOR_OPTIONS, state.hairColor, locale)],
		["肤色", "Skin tone", getOptionPrompt(SKIN_TONE_OPTIONS, state.skinTone, locale)],
		["妆容", "Makeup", getOptionPrompt(MAKEUP_OPTIONS, state.makeup, locale)],
	].filter((item) => item[2])

	if (isChinese) {
		return [
			"参考图 1 是原模特图。请转换图中模特的外貌，让素人形象变成更专业的商业超模效果。",
			"关键要求：严格保持参考图 1 中所有服装、商品、配饰、穿着方式、姿势、身体位置、构图、裁切、背景、光线和拍摄风格不变。",
			"需要应用的外貌变化：",
			...changes.map(([zhLabel, , prompt]) => `- ${zhLabel}：${prompt}`),
			extra ? `补充描述：${extra}` : "",
			"最终结果必须是单人真实商业时尚大片质感，人物与服装融合自然，不能改变服装设计、图案、颜色、面料和商品轮廓。",
		]
			.filter(Boolean)
			.join("\n")
	}

	return [
		"Reference image 1 is the source model photo. Transform the model appearance into a more professional commercial supermodel look.",
		"Critical: keep all clothing, products, accessories, styling, pose, body position, composition, crop, background, lighting, and photographic style from reference image 1 exactly unchanged.",
		"Apply the following appearance changes:",
		...changes.map(([, enLabel, prompt]) => `- ${enLabel}: ${prompt}`),
		extra ? `Additional requirements: ${extra}` : "",
		"The result must look like a professional high-fashion editorial photo, with seamless photorealistic integration. Do not change garment design, patterns, colors, fabric, or product silhouette.",
	]
		.filter(Boolean)
		.join("\n")
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) return "用户当前未填写。"
	return normalizedCurrentText
}

function getSelectedOptionLabels(options, values, t) {
	const selectedValues = Array.isArray(values) ? values : [values].filter(Boolean)
	return options
		.filter((item) => selectedValues.includes(item.value))
		.map((item) => t(item.labelKey, item.labelFallback))
}

function buildExtraPromptCompletionUserPrompt({ state, t }) {
	const currentText = buildCurrentTextBlock(state.extraPrompt)
	if (state.mode === MODE.REF) {
		const changeLabels = getSelectedOptionLabels(CHANGE_ITEMS, state.changeItems, t)
		return [
			"任务目标：为 AI 换模特插件的“补充描述”输入框生成或补全一段提示词。",
			`当前输入：${currentText}`,
			"当前模式：参考模特。",
			`参考图角色：参考图 1 是原模特图，需要保留服装、姿势、场景、构图和光线；参考图 2 是目标参考模特图，只提供人物外貌参考。`,
			`已选择的变化项：${changeLabels.length ? changeLabels.join("、") : "尚未选择"}。`,
			"补全方向：只补充外貌迁移的细节要求，例如表情、妆容保留、发丝自然度、肤色融合、年龄气质、五官风格等。",
			"业务限制：不要要求改变服装、商品、配饰、背景、姿势、镜头角度或构图；不要输出完整任务说明，只输出适合填入“补充描述”的短提示词。",
		].join("\n")
	}

	const selectedLabels = [
		...getSelectedOptionLabels(APPEARANCE_STYLE_OPTIONS, state.appearanceStyle, t),
		...getSelectedOptionLabels(FACE_SHAPE_OPTIONS, state.faceShape, t),
		...getSelectedOptionLabels(HAIRSTYLE_OPTIONS, state.hairstyle, t),
		...getSelectedOptionLabels(HAIR_COLOR_OPTIONS, state.hairColor, t),
		...getSelectedOptionLabels(SKIN_TONE_OPTIONS, state.skinTone, t),
		...getSelectedOptionLabels(MAKEUP_OPTIONS, state.makeup, t),
	]

	return [
		"任务目标：为 AI 换模特插件的“补充描述”输入框生成或补全一段提示词。",
		`当前输入：${currentText}`,
		"当前模式：自定义。",
		"参考图角色：参考图 1 是原模特图，需要保留服装、姿势、场景、构图和光线；自定义选项用于定义新模特外貌。",
		`已选择的外貌方向：${selectedLabels.length ? selectedLabels.join("、") : "尚未选择"}。`,
		"补全方向：补充更细的人像气质、五官细节、表情、妆容精修、商业大片质感和自然融合要求。",
		"业务限制：不要要求改变服装、商品、配饰、背景、姿势、镜头角度或构图；不要输出完整任务说明，只输出适合填入“补充描述”的短提示词。",
	].join("\n")
}

function mapOptions(options, t) {
	return options.map((item) => ({
		value: item.value,
		label: t(item.labelKey, item.labelFallback),
		description: item.descriptionKey
			? t(item.descriptionKey, item.descriptionFallback)
			: undefined,
	}))
}

registerMagicCanvasPlugin({
	create(ctx) {
		return {
			state: MagicPluginKit.createPanelState(ctx, createInitialState()),
		}
	},
	render(ctx, instance, root, scope) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const locale = String(ctx.i18n?.locale ?? navigator.language ?? "")
			.toLowerCase()
			.startsWith("zh")
			? "zh"
			: "en"

		return ctx.panel.render(root, {
			panelClassName: "model-swap",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "sourceImage",
					kind: "image-slot",
					stateKey: "sourceImage",
					title: t("section.sourceImage", "原模特图"),
					required: true,
					uploadLabel: t("upload.sourceImage", "上传 / 拖拽图片"),
					alt: t("section.sourceImage", "原模特图"),
					help: t(
						"upload.sourceImage.help",
						"限 1 张，建议使用正面或接近正面的单人模特图。",
					),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages =
							helpers.getSelectedModel(state)?.image_size_config
								?.max_reference_images ?? 2
						if (
							!state.sourceImage &&
							state.mode === MODE.REF &&
							state.refImage &&
							maxReferenceImages < 2
						) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "mode",
					kind: "tabs",
					stateKey: "mode",
					title: t("section.mode", "换模特方式"),
					options: [
						{ value: MODE.REF, label: t("mode.ref", "参考模特") },
						{ value: MODE.CUSTOM, label: t("mode.custom", "自定义") },
					],
					patchOnSelect: (value) =>
						value === MODE.REF
							? {
									appearanceStyle: "",
									faceShape: "",
									hairstyle: "",
									hairColor: "",
									skinTone: "",
									makeup: "",
								}
							: {
									refImage: null,
									changeItems: [],
								},
					panels: [
						{
							value: MODE.REF,
							sections: [
								{
									id: "refImage",
									kind: "image-slot",
									stateKey: "refImage",
									title: t("section.refImage", "参考模特图"),
									required: true,
									uploadLabel: t("upload.refImage", "上传目标参考模特图"),
									alt: t("section.refImage", "参考模特图"),
									help: t(
										"upload.refImage.help",
										"用于提供发型、头部、肤色、发色或全身外貌参考，不复制服装和场景。",
									),
										beforePick: ({ state, helpers }) => {
											const maxReferenceImages =
												helpers.getSelectedModel(state)?.image_size_config
													?.max_reference_images ?? 2
											if (!state.refImage && maxReferenceImages < 2) {
												return t(
													"error.referenceLimit",
													"参考图数量已达当前模型上限",
												)
										}
										return null
									},
								},
								{
									id: "changeItems",
									kind: "option-group",
									stateKey: "changeItems",
									title: t("section.changeItems", "换什么"),
									suffix: t("section.changeItems.suffix", "可多选"),
									required: true,
									multiple: true,
									groupClassName: "model-swap-change-grid",
									options: mapOptions(CHANGE_ITEMS, t),
								},
							],
						},
						{
							value: MODE.CUSTOM,
							sections: [
								{
									id: "appearanceStyle",
									kind: "option-group",
									stateKey: "appearanceStyle",
									title: t("section.appearanceStyle", "外貌风格"),
									variant: "card",
									descriptionMode: "inline",
									allowDeselect: true,
									groupClassName: "model-swap-appearance-grid",
									options: mapOptions(APPEARANCE_STYLE_OPTIONS, t),
								},
								{
									id: "faceShape",
									kind: "option-group",
									stateKey: "faceShape",
									title: t("section.faceShape", "脸型"),
									allowDeselect: true,
									options: mapOptions(FACE_SHAPE_OPTIONS, t),
								},
								{
									id: "hairstyle",
									kind: "option-group",
									stateKey: "hairstyle",
									title: t("section.hairstyle", "发型"),
									allowDeselect: true,
									options: mapOptions(HAIRSTYLE_OPTIONS, t),
								},
								{
									id: "hairColor",
									kind: "option-group",
									stateKey: "hairColor",
									title: t("section.hairColor", "发色"),
									allowDeselect: true,
									options: mapOptions(HAIR_COLOR_OPTIONS, t),
								},
								{
									id: "skinTone",
									kind: "option-group",
									stateKey: "skinTone",
									title: t("section.skinTone", "肤色"),
									allowDeselect: true,
									groupClassName: "model-swap-skin-grid",
									options: SKIN_TONE_OPTIONS.map((item) => ({
										value: item.value,
										label: t(item.labelKey, item.labelFallback),
										swatch: item.swatch,
									})),
								},
								{
									id: "makeup",
									kind: "option-group",
									stateKey: "makeup",
									title: t("section.makeup", "妆容"),
									allowDeselect: true,
									options: mapOptions(MAKEUP_OPTIONS, t),
								},
							],
						},
					],
				},
				{
					id: "extraPrompt",
					kind: "textarea",
					stateKey: "extraPrompt",
					title: t("section.extraPrompt", "补充描述"),
					rows: 2,
					maxLength: 500,
					deps: [
						"mode",
						"sourceImage",
						"refImage",
						"changeItems",
						"appearanceStyle",
						"faceShape",
						"hairstyle",
						"hairColor",
						"skinTone",
						"makeup",
					],
					placeholder: ({ state }) =>
						state.mode === MODE.REF
							? t("placeholder.extra.ref", "如：保留原模特妆容，表情更自然")
							: t("placeholder.extra.custom", "如：眼睛大一些，嘴唇饱满，气质更冷艳"),
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) =>
							!state.sourceImage ||
							(state.mode === MODE.REF && !state.refImage) ||
							(state.mode === MODE.REF && !state.changeItems.length) ||
							(state.mode === MODE.CUSTOM && !hasCustomSelection(state)),
						completeImagePrompt: {
							referenceImages: ({ state }) => getReferenceImages(state),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									state,
									t,
								}),
						},
					},
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
					deps: ["modelId", "modelOptions", "scale"],
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
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "一键素人变超模")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.sourceImage) return t("empty.sourceImage", "请先上传原模特图")
					if (state.mode === MODE.REF && !state.refImage) {
						return t("empty.refImage", "请先上传参考模特图")
					}
					if (state.mode === MODE.REF && !state.changeItems.length) {
						return t("empty.changeItems", "请至少选择 1 个换模特项目")
					}
					if (state.mode === MODE.CUSTOM && !hasCustomSelection(state)) {
						return t("empty.custom", "请至少选择 1 个自定义外貌选项")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.sourceImage ||
					(state.mode === MODE.REF && (!state.refImage || !state.changeItems.length)) ||
					(state.mode === MODE.CUSTOM && !hasCustomSelection(state)),
				validate: ({ state, helpers }) => {
					const referenceImages = getReferenceImages(state)
					const maxReferenceImages =
						helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ??
						2
					if (referenceImages.length > maxReferenceImages) {
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
					const selectedSize = helpers.getSelectedSize(state)
					const width = selectedSize.genW
					const height = selectedSize.genH
					const prompt =
						state.mode === MODE.REF
							? buildRefPrompt({
									changeItems: state.changeItems,
									extraPrompt: state.extraPrompt,
									locale,
								})
							: buildCustomPrompt({ state, locale })

					return {
						model_id: state.modelId,
						prompt,
						reference_images: helpers.collectReferenceIds(getReferenceImages(state)),
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
