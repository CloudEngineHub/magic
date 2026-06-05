/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

function createInitialState() {
	return {
		repairType: "styleRepair",
		sourceImage: null,
		referenceProductImage: null,
		cropImage: null,
		refCropImage: null,
		genCount: 1,
	}
}

function buildClothingRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const hasCrop = Boolean(state.cropImage)
	const hasRefCrop = Boolean(state.refCropImage)
	const effectiveRef = hasRefCrop ? state.refCropImage : state.referenceProductImage
	const refImages = [state.sourceImage, effectiveRef]
	if (hasCrop) refImages.push(state.cropImage)

	return {
		model_id: state.modelId,
		prompt: buildClothingRepairPrompt({
			repairType: state.repairType,
			locale,
			hasCrop,
			hasRefCrop,
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

function buildClothingRepairPrompt({ repairType, locale, hasCrop, hasRefCrop }) {
	if (MagicPromptLocale.isChinese(locale)) {
		const cropInstr = hasCrop
			? hasRefCrop
				? "参考图 2 是从参考商品图中截取的目标服饰局部图，参考图 3 是从待修复图中截取的需修复区域局部图。请以参考图 2 中的服饰内容为准，对参考图 1 中参考图 3 所示的对应区域进行替换式修复，确保替换后的服饰款式、结构、材质与细节准确一致，并与周围区域自然融合。"
				: "参考图 3 是从待修复图中截取的需修复区域的局部图，请重点修复该区域内的服饰细节，并将结果自然融入参考图 1 的对应位置。"
			: ""
		if (repairType === "detailRepair") {
			return (
				"读取参考图 1 作为待修复图，读取参考图 2 作为参考商品图。" +
				cropInstr +
				"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体服饰穿着关系不变的前提下，重点修复服饰细节。" +
				"细节修复应优先对齐参考图 2 中的面料纹理、织物组织、走线、纽扣、拉链、门襟、口袋、印花、logo、边缘、褶皱、垂坠与局部质感表现。" +
				"不要整体改写服饰款式或版型，只对待修复图中的服饰细节进行更真实、更完整、更商业可用的修正。"
			)
		}

		return (
			"读取参考图 1 作为待修复图，读取参考图 2 作为参考商品图。" +
			cropInstr +
			"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体穿着关系不变的前提下，对人物身着服饰进行款式修复。" +
			"款式修复应参考参考图 2 的服饰主体，修正待修复图中的服饰款式、轮廓、结构、长度、袖型、裤型、领口、下摆、版型贴合和整体造型表现。" +
			"不要替换人物，不要改变场景，不要新增无关服饰元素；只对待修复图中的服饰款式问题做自然、真实、商业可用的修正。"
		)
	}

	const cropInstrEn = hasCrop
		? hasRefCrop
			? "Reference image 2 is a cropped local view of the target apparel from the product image, and reference image 3 is a close-up crop of the region to repair from the source image. Use the apparel content in reference image 2 as the replacement target for the corresponding area shown by reference image 3 in reference image 1. The repaired result should match the style, structure, material, and details of reference image 2 accurately while blending naturally with the surrounding area. "
			: "Reference image 3 is a close-up crop of the region to repair from the source image; focus your repair on that area and blend the result naturally into the corresponding position in reference image 1. "
		: ""

	if (repairType === "detailRepair") {
		return (
			"Read reference image 1 as the image to repair and reference image 2 as the product reference. " +
			cropInstrEn +
			"Keep the person identity, pose, framing, scene, background, and overall wearing relationship from reference image 1 unchanged while focusing on garment detail repair. " +
			"Match garment details to reference image 2 more faithfully, especially fabric texture, weave structure, stitching, buttons, zippers, plackets, pockets, prints, logos, edges, folds, drape, and localized material response. " +
			"Do not rewrite the whole garment style or silhouette. Only repair the apparel details so the result looks more realistic, complete, and commercially usable."
		)
	}

	return (
		"Read reference image 1 as the image to repair and reference image 2 as the product reference. " +
		cropInstrEn +
		"Preserve the person identity, pose, framing, scene, background, and overall wearing relationship from reference image 1 while performing apparel style repair. " +
		"Use reference image 2 to correct the garment style, silhouette, structure, length, sleeve shape, pant shape, neckline, hem, fit, and overall apparel appearance in reference image 1. " +
		"Do not replace the person, do not change the scene, and do not add unrelated clothing elements. Repair only the garment-style issues so the result feels natural, realistic, and commercially usable."
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
				value: "styleRepair",
				label: t("repairType.styleRepair", "款式修复"),
				description: t(
					"repairType.styleRepair.desc",
					"修正模特身着服饰的款式、轮廓与结构表现。",
				),
			},
			{
				value: "detailRepair",
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
				defaultModelId: "gemini-3-pro-image-preview",
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "repairType",
					kind: "option-group",
					stateKey: "repairType",
					title: t("section.repairType", "修复类型"),
					options: repairTypeOptions,
				},
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
					clearLabel: t("maskPainter.clear", "清除标记"),
					brushSize: 40,
					deps: ["sourceImage"],
					help: t(
						"maskPainter.help",
						"在图上涂抹需要重点修复的服饰区域，AI 将优先处理标记部分。不标记时 AI 自动识别。",
					),
				},
				{
					id: "referenceProductImage",
					kind: "image-slot",
					stateKey: "referenceProductImage",
					title: t("section.referenceProductImage", "参考商品图"),
					required: true,
					uploadLabel: t("upload.referenceProductImage", "点击上传参考商品图"),
					alt: t("section.referenceProductImage", "参考商品图"),
					help: t(
						"upload.referenceProductImage.help",
						"支持上传单张平铺图、人台图或模特图，作为服饰款式或细节修复参考。",
					),
				},
				{
					id: "refMaskPainter",
					kind: "mask-painter",
					stateKey: "refCropImage",
					sourceStateKey: "referenceProductImage",
					title: t("section.refMaskPainter", "标记参考区域（可选）"),
					noSourceHint: t("refMaskPainter.noSource", "请先上传参考商品图"),
					clearLabel: t("refMaskPainter.clear", "清除标记"),
					brushSize: 80,
					deps: ["referenceProductImage"],
					help: t(
						"refMaskPainter.help",
						"在参考商品图上涂抹要提取的服饰细节区域，AI 将把该区域的风格迁移到待修复图的标记范围内。",
					),
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
				buttonLabel: `✨ ${t("button.generate", "生成服饰修复图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					return ""
				},
				isDisabled: ({ state }) => !state.sourceImage || !state.referenceProductImage,
				validate: ({ state, helpers }) => {
					if (
						helpers.collectReferenceIds([
							state.sourceImage,
							state.referenceProductImage,
						]).length !== 2
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
						state.cropImage &&
						helpers.collectReferenceIds([state.cropImage]).length !== 1
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
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
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "服饰修复图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
