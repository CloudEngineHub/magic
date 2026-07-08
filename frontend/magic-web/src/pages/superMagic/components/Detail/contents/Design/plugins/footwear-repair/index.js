/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

function createInitialState() {
	return {
		sourceImage: null,
		referenceProductImage: null,
		cropImage: null,
		refCropImage: null,
		extraPrompt: "",
	}
}

function buildFootwearRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const hasCrop = Boolean(state.cropImage)
	const hasReferenceProductImage = Boolean(state.referenceProductImage)
	const hasRefCrop = hasReferenceProductImage && Boolean(state.refCropImage)
	// 标记后上传的是裁剪局部图，优先用局部图替代整图参考。
	const effectiveRef = hasReferenceProductImage
		? hasRefCrop
			? state.refCropImage
			: state.referenceProductImage
		: null
	const refImages = [state.sourceImage]
	if (effectiveRef) refImages.push(effectiveRef)
	if (hasCrop) refImages.push(state.cropImage)

	return {
		model_id: state.modelId,
		prompt: buildFootwearRepairPrompt({
			locale,
			hasCrop,
			hasReferenceProductImage,
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
	hasCrop,
	hasReferenceProductImage,
	hasRefCrop,
	currentText,
}) {
	const referenceRole = hasReferenceProductImage
		? `参考图角色：参考图 1 是待修复的模特鞋靴图，参考图 2 是参考商品图或参考商品图的局部裁剪。${hasCrop ? "参考图 3 是待修复图的局部裁剪。" : ""}`
		: `参考图角色：参考图 1 是待修复的模特鞋靴图。${hasCrop ? "参考图 2 是待修复图的局部裁剪。" : ""}当前未上传参考商品图。`
	const cropContext = hasReferenceProductImage
		? hasCrop
			? hasRefCrop
				? "当前同时标记了待修复图区域和参考商品图区域，需要围绕两处标记补充更明确的局部鞋靴修复要求。额外描述必须只作用于待修复图的标记区域，参考商品图标记区域只作为款式和细节来源。"
				: "当前标记了待修复图中的鞋靴区域，需要围绕该区域补充更明确的修复要求。额外描述必须只作用于该标记区域，不要迁移、镜像或复制到未标记的另一只鞋、另一只脚或其他区域。"
			: hasRefCrop
				? "当前标记了参考商品图中的鞋靴细节区域，需要补充可帮助 AI 迁移该区域款式与细节的要求。"
				: "当前没有标记修复区域，需要补充可帮助 AI 对齐参考商品图的整体鞋靴修复要求。"
		: hasCrop
			? "当前标记了待修复图中的鞋靴区域且未上传参考商品图，需要围绕该区域补充更明确的智能修复要求。额外描述必须只作用于该标记区域，不要迁移、镜像或复制到未标记的另一只鞋、另一只脚或其他区域。"
			: "当前没有标记修复区域且未上传参考商品图，需要补充可帮助 AI 自动识别鞋靴问题的整体要求。"

	return [
		"任务目标：为鞋靴修复插件的“额外描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		referenceRole,
		`当前区域设置：${cropContext}`,
		"补全方向：可补充需要重点修复的鞋型轮廓、鞋面材质、鞋底鞋跟、鞋带、金属配件、脚踝穿着关系、透视比例、边缘融合和商业摄影质感。",
		"业务限制：不要要求改变人物身份、整体姿势、构图、背景、光线、服装款式或无关商品；有待修复图标记区域时，不要让未标记鞋靴或身体区域跟随额外描述改变；不要输出完整生成任务说明，只输出适合填入“额外描述”的短提示词。",
	].join("\n")
}

function buildFootwearRepairPrompt({
	locale,
	hasCrop,
	hasReferenceProductImage,
	hasRefCrop,
	extraPrompt,
}) {
	const normalizedExtra = String(extraPrompt ?? "").trim()
	if (MagicPromptLocale.isChinese(locale)) {
		const cropInstr = hasCrop
			? hasReferenceProductImage
				? hasRefCrop
					? "参考图 2 是从参考商品图中截取的目标鞋靴细节区域，参考图 3 是从待修复图中截取的需修复区域的局部图。请将参考图 2 中的鞋靴款式、材质与细节精确迁移至参考图 1 中参考图 3 所示的对应位置，修复结果须与周围区域自然融合。参考图 3 同时限定了修复指令和额外要求的作用范围；凡是额外要求中提到的鞋型、材质、鞋带、鞋底、鞋跟、装饰、穿着关系或局部形态，只能应用到参考图 3 在参考图 1 中对应的标记区域，不要迁移、镜像或复制到未标记的另一只鞋、另一只脚或其他区域。未标记鞋靴和身体区域仅在必要时做轻微瑕疵修复，并保持原有形态与动作。"
					: "参考图 3 是从待修复图中截取的需修复区域的局部图，请重点修复该区域内的鞋靴细节，并将结果自然融入参考图 1 的对应位置。参考图 3 同时限定了修复指令和额外要求的作用范围；凡是额外要求中提到的鞋型、材质、鞋带、鞋底、鞋跟、装饰、穿着关系或局部形态，只能应用到参考图 3 在参考图 1 中对应的标记区域，不要迁移、镜像或复制到未标记的另一只鞋、另一只脚或其他区域。未标记鞋靴和身体区域仅在必要时做轻微瑕疵修复，并保持原有形态与动作。"
				: "参考图 2 是从待修复图中截取的需修复区域的局部图，请重点修复该区域内的鞋靴细节，并将结果自然融入参考图 1 的对应位置。参考图 2 同时限定了修复指令和额外要求的作用范围；凡是额外要求中提到的鞋型、材质、鞋带、鞋底、鞋跟、装饰、穿着关系或局部形态，只能应用到参考图 2 在参考图 1 中对应的标记区域，不要迁移、镜像或复制到未标记的另一只鞋、另一只脚或其他区域。未标记鞋靴和身体区域仅在必要时做轻微瑕疵修复，并保持原有形态与动作。"
			: ""
		const markedRegionRef = hasReferenceProductImage ? "参考图 3" : "参考图 2"
		const extraClause = normalizedExtra
			? hasCrop
				? `额外要求（仅作用于${markedRegionRef}对应的标记区域，不作用于未标记鞋靴或身体区域）：${normalizedExtra}。`
				: `额外要求：${normalizedExtra}。`
			: ""
		const referenceIntro = hasReferenceProductImage
			? "读取参考图 1 作为完整待修复图，读取参考图 2 作为参考商品图。"
			: "读取参考图 1 作为完整待修复图。"
		const repairInstruction = hasReferenceProductImage
			? "修复应以参考商品图中的鞋靴款式为准，修正鞋靴的款式轮廓、鞋型结构、材质纹理、鞋面细节、鞋底、鞋跟、鞋带、金属配件与整体上脚效果，使其与参考商品图更一致、真实、自然。"
			: "请基于原图语境智能修正鞋靴的款式轮廓、鞋型结构、材质纹理、鞋面细节、鞋底、鞋跟、鞋带、金属配件与整体上脚效果，使其更完整、真实、自然。"
		const fallbackInstruction = hasReferenceProductImage
			? "如待修复图中鞋靴信息不完整或局部质量较差，优先生成解剖结构正确、商业可用且与参考商品图高度一致的修复结果。"
			: "如待修复图中鞋靴信息不完整或局部质量较差，优先生成解剖结构正确、商业可用且与原图风格一致的修复结果。"
		return (
			referenceIntro +
			cropInstr +
			"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体穿搭关系不变的前提下，重点修复人物脚部区域的鞋靴细节。" +
			repairInstruction +
			"修复时须保持脚部与踝部的解剖结构合理、穿着关系自然、透视与比例正确，不要改变服装款式或场景设定，不要新增无关元素。" +
			fallbackInstruction +
			extraClause
		)
	}

	const cropInstrEn = hasCrop
		? hasReferenceProductImage
			? hasRefCrop
				? "Reference image 2 is a cropped detail of the target footwear from the product image; reference image 3 is a close-up crop of the region to repair from the source image. Transfer the footwear style, material, and details shown in reference image 2 precisely into the corresponding position in reference image 1 (shown by reference image 3); the result must blend naturally with the surrounding area. Reference image 3 also defines the scope of the repair instructions and additional requirements: any requested shoe shape, material, lace, sole, heel, decoration, wearing relationship, or local shape change must be applied only to the marked region corresponding to reference image 3 in reference image 1. Do not transfer, mirror, or duplicate those changes to the unmarked other shoe, other foot, or any other area. For unmarked footwear and body areas, only make minimal defect repairs when necessary and preserve their original shape and action. "
				: "Reference image 3 is a close-up crop of the region to repair from the source image; focus your repair on that area and blend the result naturally into the corresponding position in reference image 1. Reference image 3 also defines the scope of the repair instructions and additional requirements: any requested shoe shape, material, lace, sole, heel, decoration, wearing relationship, or local shape change must be applied only to the marked region corresponding to reference image 3 in reference image 1. Do not transfer, mirror, or duplicate those changes to the unmarked other shoe, other foot, or any other area. For unmarked footwear and body areas, only make minimal defect repairs when necessary and preserve their original shape and action. "
			: "Reference image 2 is a close-up crop of the region to repair from the source image; focus your repair on that area and blend the result naturally into the corresponding position in reference image 1. Reference image 2 also defines the scope of the repair instructions and additional requirements: any requested shoe shape, material, lace, sole, heel, decoration, wearing relationship, or local shape change must be applied only to the marked region corresponding to reference image 2 in reference image 1. Do not transfer, mirror, or duplicate those changes to the unmarked other shoe, other foot, or any other area. For unmarked footwear and body areas, only make minimal defect repairs when necessary and preserve their original shape and action. "
		: ""
	const markedRegionRefEn = hasReferenceProductImage ? "reference image 3" : "reference image 2"
	const extraClauseEn = normalizedExtra
		? hasCrop
			? `Additional requirements (apply only to the marked region corresponding to ${markedRegionRefEn}, not to unmarked footwear or body areas): ${normalizedExtra}. `
			: `Additional requirements: ${normalizedExtra}. `
		: ""
	const referenceIntroEn = hasReferenceProductImage
		? "Read reference image 1 as the complete source image and reference image 2 as the reference product. "
		: "Read reference image 1 as the complete source image. "
	const repairInstructionEn = hasReferenceProductImage
		? "Use the reference product to correct shoe style, shape, material texture, upper details, sole, heel, laces, hardware, and on-foot appearance so the result aligns more faithfully with the product reference. "
		: "Based on the source image context, intelligently correct shoe style, shape, material texture, upper details, sole, heel, laces, hardware, and on-foot appearance so the result looks complete, realistic, and natural. "
	const fallbackInstructionEn = hasReferenceProductImage
		? "If footwear information in the repair image is incomplete or low quality, prioritize a commercially usable result that is anatomically correct and closely matches the reference product image. "
		: "If footwear information in the repair image is incomplete or low quality, prioritize a commercially usable result that is anatomically correct and consistent with the source image style. "
	return (
		referenceIntroEn +
		cropInstrEn +
		"Preserve the person identity, pose, framing, scene, background, and overall outfit relationship from reference image 1 while repairing the footwear details on the model's feet. " +
		repairInstructionEn +
		"Ensure the feet and ankles are anatomically correct, the wearing relationship is natural, and perspective and proportions are accurate. Do not change the outfit style or scene, and do not add unrelated elements. " +
		fallbackInstructionEn +
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

		return ctx.panel.render(root, {
			panelClassName: "footwear-repair",
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
					title: t("section.referenceProductImage", "参考商品图（可选）"),
					uploadLabel: t("upload.referenceProductImage", "可选上传参考商品图"),
					alt: t("section.referenceProductImage", "参考商品图（可选）"),
					help: t(
						"upload.referenceProductImage.help",
						"可选上传单张平铺图、独立展示图或模特穿着图，作为鞋靴款式或细节修复参考。",
					),
				},
				{
					id: "refMaskPainter",
					kind: "mask-painter",
					stateKey: "refCropImage",
					sourceStateKey: "referenceProductImage",
					title: t("section.refMaskPainter", "标记参考区域（可选）"),
					noSourceHint: t("refMaskPainter.noSource", "请先上传参考商品图"),
					deps: ["referenceProductImage"],
					help: t(
						"refMaskPainter.help",
						"在参考商品图上涂抹要提取的细节区域，AI 将把该区域的风格迁移到待修复图的标记范围内。",
					),
				},
				{
					id: "extraPrompt",
					kind: "textarea",
					stateKey: "extraPrompt",
					title: t("section.extraPrompt", "额外描述"),
					rows: 3,
					maxLength: 800,
					deps: [
						"sourceImage",
						"referenceProductImage",
						"cropImage",
						"refCropImage",
					],
					placeholder: t(
						"extraPrompt.placeholder",
						"如：重点修复鞋头轮廓和鞋底厚度，保持脚踝穿着关系、透视比例与材质纹理自然",
					),
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.sourceImage,
						completeImagePrompt: {
							referenceImages: ({ state }) =>
								[
									state.sourceImage,
									state.referenceProductImage
										? state.refCropImage || state.referenceProductImage
										: null,
									state.cropImage,
								].filter(Boolean),
							referencesMessage: t(
								"empty.referencesForAiPrompt",
								"请先上传待修复图",
							),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									hasCrop: Boolean(state.cropImage),
									hasReferenceProductImage: Boolean(state.referenceProductImage),
									hasRefCrop: Boolean(
										state.referenceProductImage && state.refCropImage,
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
				buttonLabel: `✨ ${t("button.generate", "生成鞋靴修复图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.sourceImage) {
						return t("empty.sourceImage", "请先上传 1 张待修复图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.sourceImage,
				validate: ({ state, helpers }) => {
					if (helpers.collectReferenceIds([state.sourceImage]).length !== 1) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
						state.referenceProductImage &&
						helpers.collectReferenceIds([state.referenceProductImage]).length !== 1
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
						state.referenceProductImage &&
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
