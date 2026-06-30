/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const REPAIR_TYPE = {
	STYLE: "styleRepair",
	DETAIL: "detailRepair",
}

function createInitialState() {
	return {
		repairType: REPAIR_TYPE.STYLE,
		sourceImage: null,
		referenceProductImage: null,
		cropImage: null,
		refCropImage: null,
		extraPrompt: "",
	}
}

function buildClothingRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const isStyleRepair = state.repairType === REPAIR_TYPE.STYLE
	const hasCrop = Boolean(state.cropImage)
	const hasReferenceProductImage = Boolean(state.referenceProductImage)
	const hasRefCrop = isStyleRepair && hasReferenceProductImage && Boolean(state.refCropImage)
	const effectiveStyleRef = hasReferenceProductImage
		? hasRefCrop
			? state.refCropImage
			: state.referenceProductImage
		: null
	const refImages = isStyleRepair
		? [state.sourceImage, effectiveStyleRef, state.cropImage].filter(Boolean)
		: [state.sourceImage, state.cropImage].filter(Boolean)

	return {
		model_id: state.modelId,
		prompt: buildClothingRepairPrompt({
			repairType: state.repairType,
			locale,
			hasCrop,
			hasRefCrop,
			extraPrompt: state.extraPrompt,
		}),
		reference_images: helpers.collectReferenceIds(refImages),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) return "用户当前未填写。"
	return normalizedCurrentText
}

function buildExtraPromptCompletionUserPrompt({
	repairType,
	hasCrop,
	hasRefCrop,
	currentText,
}) {
	const isDetailRepair = repairType === REPAIR_TYPE.DETAIL
	const repairTypeLabel = isDetailRepair ? "细节修复" : "款式修复"
	const referenceRole = isDetailRepair
		? `参考图角色：参考图 1 是待修复的模特服饰图。${hasCrop ? "参考图 2 是待修复图的局部裁剪。" : ""}`
		: `参考图角色：参考图 1 是待修复的模特服饰图，参考图 2 是目标款式参考商品图或参考商品图的局部裁剪。${hasCrop ? "参考图 3 是待修复图的局部裁剪。" : ""}`
	const cropContext = isDetailRepair
		? hasCrop
			? "当前标记了待修复图区域，需要围绕该区域补充更明确的局部细节修复要求。"
			: "当前没有标记修复区域，需要补充可帮助 AI 自动识别服饰细节问题的整体要求。"
		: hasCrop
			? hasRefCrop
				? "当前同时标记了待修复图区域和目标款式参考区域，需要围绕两处标记补充更明确的替换式款式修复要求。"
				: "当前标记了待修复图区域，需要补充该区域应如何向目标款式参考图对齐。"
			: hasRefCrop
				? "当前标记了目标款式参考区域，需要补充可帮助 AI 迁移该区域款式结构的要求。"
				: "当前未标记局部区域，需要补充可帮助 AI 按目标款式参考图进行整体款式修复的要求。"

	return [
		"任务目标：为服饰修复插件的“额外描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		`当前修复模式：${repairTypeLabel}。`,
		referenceRole,
		`当前区域设置：${cropContext}`,
		isDetailRepair
			? "补全方向：可补充需要重点修复的面料纹理、走线、纽扣拉链、logo、印花、边缘、褶皱、垂坠和局部真实质感。"
			: "补全方向：可补充需要重点对齐的服饰部位、版型结构、轮廓比例、领口袖型、下摆长度、材质和边缘融合。",
		"业务限制：不要要求改变人物身份、姿势、构图、背景、光线或无关服饰；不要输出完整生成任务说明，只输出适合填入“额外描述”的短提示词。",
	].join("\n")
}

function buildClothingRepairPrompt({
	repairType,
	locale,
	hasCrop,
	hasRefCrop,
	extraPrompt,
}) {
	const normalizedExtra = String(extraPrompt ?? "").trim()
	const isDetailRepair = repairType === REPAIR_TYPE.DETAIL
	if (MagicPromptLocale.isChinese(locale)) {
		const extraClause = normalizedExtra ? `额外要求：${normalizedExtra}。` : ""
		if (isDetailRepair) {
			const cropInstr = hasCrop
				? "参考图 2 是从待修复图中截取的需修复区域局部图。请重点增强并修复参考图 2 所示区域中的服饰细节，并将修复结果自然融入参考图 1 的对应位置。"
				: ""
			return (
				"读取参考图 1 作为待修复图。" +
				cropInstr +
				"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体服饰穿着关系不变的前提下，重点修复服饰细节。" +
				"细节修复应基于原图语境智能修正面料纹理、织物组织、走线、纽扣、拉链、门襟、口袋、印花、logo、边缘、褶皱、垂坠与局部质感表现。" +
				"不要整体改写服饰款式或版型，只对待修复图中的服饰细节进行更真实、更完整、更商业可用的修正。" +
				extraClause
			)
		}

		const styleCropInstr = hasCrop
			? hasRefCrop
				? "参考图 2 是从目标款式参考商品图中截取的目标服饰局部图，参考图 3 是从待修复图中截取的需替换区域局部图。请以参考图 2 中的服饰内容为准，对参考图 1 中参考图 3 所示的对应区域进行替换式款式修复，确保替换后的服饰款式、结构、材质与细节准确一致，并与周围区域自然融合。"
				: "参考图 3 是从待修复图中截取的需修复区域局部图。请结合参考图 2 的目标款式，对参考图 1 中参考图 3 所示区域进行款式对齐与结构修正。"
			: hasRefCrop
				? "参考图 2 是从目标款式参考商品图中截取的目标服饰局部图。请优先使用该局部款式、结构与材质细节修复参考图 1 中对应服饰区域。"
				: ""
		return (
			"读取参考图 1 作为待修复图，读取参考图 2 作为目标款式参考商品图。" +
			styleCropInstr +
			"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体穿着关系不变的前提下，对人物身着服饰进行款式修复。" +
			"款式修复必须以参考图 2 的服饰主体为目标，修正待修复图中的服饰款式、轮廓、结构、长度、袖型、裤型、领口、下摆、版型贴合和整体造型表现。" +
			"不要替换人物，不要改变场景，不要新增无关服饰元素；只对待修复图中的服饰款式问题做自然、真实、商业可用的修正。" +
			extraClause
		)
	}

	const extraClauseEn = normalizedExtra ? `Additional requirements: ${normalizedExtra}. ` : ""

	if (isDetailRepair) {
		const cropInstrEn = hasCrop
			? "Reference image 2 is a close-up crop of the region to repair from the source image. Focus on enhancing and repairing garment details in the area shown by reference image 2, then blend the repaired result naturally into the corresponding position in reference image 1. "
			: ""
		return (
			"Read reference image 1 as the image to repair. " +
			cropInstrEn +
			"Keep the person identity, pose, framing, scene, background, and overall wearing relationship from reference image 1 unchanged while focusing on garment detail repair. " +
			"Based on the source image context, intelligently repair fabric texture, weave structure, stitching, buttons, zippers, plackets, pockets, prints, logos, edges, folds, drape, and localized material response. " +
			"Do not rewrite the whole garment style or silhouette. Only repair the apparel details so the result looks more realistic, complete, and commercially usable. " +
			extraClauseEn
		)
	}

	const styleCropInstrEn = hasCrop
		? hasRefCrop
			? "Reference image 2 is a cropped local view of the target apparel from the product image, and reference image 3 is a close-up crop of the source region to replace. Use the apparel content in reference image 2 as the replacement target for the corresponding area shown by reference image 3 in reference image 1. The repaired result should match the style, structure, material, and details of reference image 2 accurately while blending naturally with the surrounding area. "
			: "Reference image 3 is a close-up crop of the source region to repair. Use reference image 2 as the target style and correct the style and structure of the area shown by reference image 3 in reference image 1. "
		: hasRefCrop
			? "Reference image 2 is a cropped local view of the target apparel from the product image. Prioritize this local style, structure, and material detail when repairing the corresponding garment area in reference image 1. "
			: ""
	return (
		"Read reference image 1 as the image to repair and reference image 2 as the target style product reference. " +
		styleCropInstrEn +
		"Preserve the person identity, pose, framing, scene, background, and overall wearing relationship from reference image 1 while performing apparel style repair. " +
		"Use reference image 2 as the target garment style to correct the garment silhouette, structure, length, sleeve shape, pant shape, neckline, hem, fit, and overall apparel appearance in reference image 1. " +
		"Do not replace the person, do not change the scene, and do not add unrelated clothing elements. Repair only the garment-style issues so the result feels natural, realistic, and commercially usable. " +
		extraClauseEn
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
		const repairTypeOptions = [
			{
				value: REPAIR_TYPE.STYLE,
				label: t("repairType.styleRepair", "款式修复"),
				description: t(
					"repairType.styleRepair.desc",
					"修正模特身着服饰的款式、轮廓与结构表现。",
				),
			},
			{
				value: REPAIR_TYPE.DETAIL,
				label: t("repairType.detailRepair", "细节修复"),
				description: t(
					"repairType.detailRepair.desc",
					"修复面料纹理、走线、辅料与局部展示细节。",
				),
			},
		]

		return ctx.panel.render(root, {
			panelClassName: "clothing-repair",
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
					title: t("section.sourceImage", "待修复图"),
					required: true,
					uploadLabel: t("upload.sourceImage", "点击上传待修复图"),
					alt: t("section.sourceImage", "待修复图"),
					help: t(
						"upload.sourceImage.help",
						"上传需要修复的模特服饰图，AI 会在保留人物与场景的前提下修正服饰问题。",
					),
				},
				{
					id: "maskPainter",
					kind: "mask-painter",
					stateKey: "cropImage",
					sourceStateKey: "sourceImage",
					title: t("section.maskPainter", "标记修复区域（可选）"),
					noSourceHint: t("maskPainter.noSource", "请先上传待修复图"),
					brushSize: 40,
					deps: ["sourceImage"],
					help: t(
						"maskPainter.help",
						"在图上涂抹需要重点修复的服饰区域，AI 将优先处理标记部分。不标记时 AI 自动识别。",
					),
				},
				{
					id: "repairType",
					kind: "tabs",
					stateKey: "repairType",
					title: t("section.repairType", "修复模式"),
					options: repairTypeOptions,
					panels: [
						{
							value: REPAIR_TYPE.STYLE,
							sections: [
								{
									id: "referenceProductImage",
									kind: "image-slot",
									stateKey: "referenceProductImage",
									title: t(
										"section.referenceProductImage",
										"目标款式参考图",
									),
									required: true,
									uploadLabel: t(
										"upload.referenceProductImage",
										"点击上传目标款式参考图",
									),
									alt: t("section.referenceProductImage", "目标款式参考图"),
									help: t(
										"upload.referenceProductImage.help",
										"上传单张平铺图、人台图或模特图，作为款式修复时需要对齐的目标服饰参考。",
									),
								},
								{
									id: "refMaskPainter",
									kind: "mask-painter",
									stateKey: "refCropImage",
									sourceStateKey: "referenceProductImage",
									title: t("section.refMaskPainter", "标记目标款式区域（可选）"),
									noSourceHint: t(
										"refMaskPainter.noSource",
										"请先上传目标款式参考图",
									),
									brushSize: 80,
									deps: ["referenceProductImage"],
									help: t(
										"refMaskPainter.help",
										"在目标款式参考图上涂抹要迁移的服饰区域，AI 将优先按该局部的版型、结构与材质修复待修复图。",
									),
								},
							],
						},
						{
							value: REPAIR_TYPE.DETAIL,
							sections: [],
						},
					],
				},
				{
					id: "extraPrompt",
					kind: "textarea",
					stateKey: "extraPrompt",
					title: t("section.extraPrompt", "额外描述"),
					deps: [
						"repairType",
						"sourceImage",
						"referenceProductImage",
						"cropImage",
						"refCropImage",
					],
					placeholder: ({ state }) =>
						state.repairType === REPAIR_TYPE.STYLE
							? t(
									"extraPrompt.stylePlaceholder",
									"如：将袖型、领口和下摆长度对齐参考图，保持人物姿势与原图光线不变",
								)
							: t(
									"extraPrompt.detailPlaceholder",
									"如：重点修复袖口罗纹、门襟纽扣和面料纹理，保持原图光线与衣物褶皱自然",
								),
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) =>
							!state.sourceImage ||
							(state.repairType === REPAIR_TYPE.STYLE &&
								!state.referenceProductImage),
						completeImagePrompt: {
							referenceImages: ({ state }) =>
								state.repairType === REPAIR_TYPE.STYLE
									? [
											state.sourceImage,
											state.refCropImage || state.referenceProductImage,
											state.cropImage,
										].filter(Boolean)
									: [state.sourceImage, state.cropImage].filter(Boolean),
							referencesMessage: ({ state }) =>
								state.repairType === REPAIR_TYPE.STYLE
									? t(
											"empty.referencesForAiPromptWithStyle",
											"请先上传待修复图和目标款式参考图",
										)
									: t("empty.referencesForAiPrompt", "请先上传待修复图"),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									repairType: state.repairType,
									hasCrop: Boolean(state.cropImage),
									hasRefCrop: Boolean(
										state.repairType === REPAIR_TYPE.STYLE &&
											state.referenceProductImage &&
											state.refCropImage,
									),
									currentText: state.extraPrompt,
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
				buttonLabel: `✨ ${t("button.generate", "生成服饰修复图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.sourceImage) {
						return t("empty.sourceImage", "请先上传 1 张待修复图")
					}
					if (state.repairType === REPAIR_TYPE.STYLE && !state.referenceProductImage) {
						return t("empty.referenceProductImage", "请先上传目标款式参考图")
					}
					return ""
				},
				isDisabled: ({ state }) =>
					!state.sourceImage ||
					(state.repairType === REPAIR_TYPE.STYLE && !state.referenceProductImage),
				validate: ({ state, helpers }) => {
					const isStyleRepair = state.repairType === REPAIR_TYPE.STYLE
					if (
						helpers.collectReferenceIds([
							state.sourceImage,
						]).length !== 1
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
						state.cropImage &&
						helpers.collectReferenceIds([state.cropImage]).length !== 1
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (isStyleRepair && !state.referenceProductImage) {
						return t("empty.referenceProductImage", "请先上传目标款式参考图")
					}
					if (
						isStyleRepair &&
						helpers.collectReferenceIds([state.referenceProductImage]).length !== 1
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
						isStyleRepair &&
						state.refCropImage &&
						helpers.collectReferenceIds([state.refCropImage]).length !== 1
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
					return buildClothingRepairRequest({
						state,
						helpers,
						locale: promptLocale,
						selectedSize,
					})
				},
			},
		})
	},
})
