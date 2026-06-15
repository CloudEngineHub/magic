/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

function createInitialState() {
	return {
		sourceImage: null,
		referenceProductImage: null,
		cropImage: null,
		refCropImage: null,
	}
}

function buildFootwearRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const hasCrop = Boolean(state.cropImage)
	const hasRefCrop = Boolean(state.refCropImage)
	// 标记后上传的是裁剪局部图，优先用局部图替代整图参考。
	const effectiveRef = hasRefCrop ? state.refCropImage : state.referenceProductImage
	const refImages = [state.sourceImage, effectiveRef]
	if (hasCrop) refImages.push(state.cropImage)

	return {
		model_id: state.modelId,
		prompt: buildFootwearRepairPrompt({ locale, hasCrop, hasRefCrop }),
		reference_images: helpers.collectReferenceIds(refImages),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildFootwearRepairPrompt({ locale, hasCrop, hasRefCrop }) {
	if (MagicPromptLocale.isChinese(locale)) {
		const cropInstr = hasCrop
			? hasRefCrop
				? "参考图 2 是从参考商品图中截取的目标鞋靴细节区域，参考图 3 是从待修复图中截取的需修复区域的局部图。请将参考图 2 中的鞋靴款式、材质与细节精确迁移至参考图 1 中参考图 3 所示的对应位置，修复结果须与周围区域自然融合。"
				: "参考图 3 是从待修复图中截取的需修复区域的局部图，请重点修复该区域内的鞋靴细节，并将结果自然融入参考图 1 的对应位置。"
			: ""
		return (
			"读取参考图 1 作为完整待修复图，读取参考图 2 作为参考商品图。" +
			cropInstr +
			"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体穿搭关系不变的前提下，重点修复人物脚部区域的鞋靴细节。" +
			"修复应以参考商品图中的鞋靴款式为准，修正鞋靴的款式轮廓、鞋型结构、材质纹理、鞋面细节、鞋底、鞋跟、鞋带、金属配件与整体上脚效果，使其与参考商品图更一致、真实、自然。" +
			"修复时须保持脚部与踝部的解剖结构合理、穿着关系自然、透视与比例正确，不要改变服装款式或场景设定，不要新增无关元素。" +
			"如待修复图中鞋靴信息不完整或局部质量较差，优先生成解剖结构正确、商业可用且与参考商品图高度一致的修复结果。"
		)
	}

	const cropInstrEn = hasCrop
		? hasRefCrop
			? "Reference image 2 is a cropped detail of the target footwear from the product image; reference image 3 is a close-up crop of the region to repair from the source image. Transfer the footwear style, material, and details shown in reference image 2 precisely into the corresponding position in reference image 1 (shown by reference image 3); the result must blend naturally with the surrounding area. "
			: "Reference image 3 is a close-up crop of the region to repair from the source image; focus your repair on that area and blend the result naturally into the corresponding position in reference image 1. "
		: ""
	return (
		"Read reference image 1 as the complete source image and reference image 2 as the reference product. " +
		cropInstrEn +
		"Preserve the person identity, pose, framing, scene, background, and overall outfit relationship from reference image 1 while repairing the footwear details on the model's feet. " +
		"Use the reference product to correct shoe style, shape, material texture, upper details, sole, heel, laces, hardware, and on-foot appearance so the result aligns more faithfully with the product reference. " +
		"Ensure the feet and ankles are anatomically correct, the wearing relationship is natural, and perspective and proportions are accurate. Do not change the outfit style or scene, and do not add unrelated elements. " +
		"If footwear information in the repair image is incomplete or low quality, prioritize a commercially usable result that is anatomically correct and closely matches the reference product image."
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
			panelClassName: "footwear-repair",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				defaultModelId: "gemini-3-pro-image-preview",
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
						"上传需要修复鞋靴的模特图，AI 会在保留人物与场景的前提下修正鞋靴细节。",
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
					deps: ["sourceImage"],
					help: t(
						"maskPainter.help",
						"在图上涂抹需要重点修复的鞋靴区域，AI 将优先处理标记部分。不标记时 AI 自动识别。",
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
						"支持上传单张平铺图、独立展示图或模特穿着图，作为鞋靴款式或细节修复参考。",
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
					deps: ["referenceProductImage"],
					help: t(
						"refMaskPainter.help",
						"在参考商品图上涂抹要提取的细节区域，AI 将把该区域的风格迁移到待修复图的标记范围内。",
					),
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
				buttonLabel: `✨ ${t("button.generate", "生成鞋靴修复图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.sourceImage) {
						return t("empty.sourceImage", "请先上传 1 张待修复图")
					}
					if (!state.referenceProductImage) {
						return t("empty.referenceProductImage", "请先上传 1 张参考商品图")
					}
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
					return buildFootwearRepairRequest({
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
