/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

function createInitialState() {
	return {
		sourceImage: null,
		cropImage: null,
		extraPrompt: "",
	}
}

function buildHandFootRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const hasCrop = Boolean(state.cropImage)
	const refImages = [state.sourceImage]
	if (hasCrop) refImages.push(state.cropImage)

	return {
		model_id: state.modelId,
		prompt: buildHandFootRepairPrompt({
			locale,
			hasCrop,
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

function buildExtraPromptCompletionUserPrompt({ hasCrop, currentText }) {
	const cropContext = hasCrop
		? "当前已标记待修复图中的手脚区域，需要围绕该区域补充更明确的局部修复要求。额外描述必须只作用于该标记区域；如果描述手势、姿势、手指结构或脚部动作，不要迁移、镜像或复制到未标记的另一只手、另一只脚或其他手脚区域。"
		: "当前没有标记修复区域，需要补充可帮助 AI 自动识别手脚瑕疵的整体要求。"

	return [
		"任务目标：为手脚修复插件的“额外描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(currentText)}`,
		"参考图角色：参考图 1 是待修复图。若存在参考图 2，则参考图 2 是待修复图的手脚局部裁剪。",
		`当前区域设置：${cropContext}`,
		"补全方向：可补充需要重点修复的手指数量、指节结构、手掌朝向、腕部衔接、脚趾脚背、脚踝过渡、边缘融合、真实肤色和商业修图质感。",
		"业务限制：不要要求改变人物身份、整体姿势、构图、背景、光线、服饰或商品内容；有标记区域时，不要让未标记手脚跟随额外描述改变；不要输出完整生成任务说明，只输出适合填入“额外描述”的短提示词。",
	].join("\n")
}

function buildHandFootRepairPrompt({ locale, hasCrop, extraPrompt }) {
	const normalizedExtra = String(extraPrompt ?? "").trim()
	if (MagicPromptLocale.isChinese(locale)) {
		const cropInstr = hasCrop
			? "参考图 2 是从待修复图中截取的需重点修复的手脚局部图，请优先修复该区域中的手指、手掌、腕部、脚部、踝部与四肢衔接问题，并将结果自然融入参考图 1 的对应位置。参考图 2 同时限定了修复指令和额外要求的作用范围；凡是额外要求中提到的手势、姿势、手指结构、脚部动作或局部形态，只能应用到参考图 2 在参考图 1 中对应的标记区域，不要迁移、镜像或复制到未标记的另一只手、另一只脚或其他手脚区域。未标记手脚仅在必要时做轻微瑕疵修复，并保持原有动作和形态。"
			: ""
		const extraClause = normalizedExtra
			? hasCrop
				? `额外要求（仅作用于参考图 2 对应的标记区域，不作用于未标记手脚）：${normalizedExtra}。`
				: `额外要求：${normalizedExtra}。`
			: ""
		return (
			"读取参考图 1 作为待修复图，并重点识别人物的手部和脚部区域。" +
			cropInstr +
			"请智能修复不自然的手部姿势、扭曲的脚部动作，以及穿帮、模糊、缺失、重复、错位、关节异常和边缘畸变等问题，使手指结构、手掌朝向、腕部衔接、脚部动作、踝部过渡和四肢走向更加自然、真实、协调。" +
			"修复时应尽量保持原图中的人物身份、面部、发型、服装、商品、背景、构图、布光、镜头语言和整体视觉风格不变。" +
			"只有在修复手脚所必需时才允许做最小范围调整，不要重绘整个人物，不要改变服装款式、商品内容或场景设定。" +
			"如果原图的手脚信息不完整或局部质量较差，请优先生成解剖结构正确、商业可用且美观自然的修复结果。" +
			extraClause
		)
	}

	const cropInstrEn = hasCrop
		? "Reference image 2 is a cropped close-up of the hand or foot region that needs focused repair. Prioritize correcting fingers, palms, wrists, feet, ankles, and limb transitions in that area, then blend the result naturally back into the corresponding position in reference image 1. Reference image 2 also defines the scope of the repair instructions and additional requirements: any requested gesture, pose, finger structure, foot action, or local shape change must be applied only to the marked region corresponding to reference image 2 in reference image 1. Do not transfer, mirror, or duplicate those changes to the unmarked other hand, other foot, or any other hand/foot area. For unmarked hands and feet, only make minimal defect repairs when necessary and preserve their original action and shape. "
		: ""
	const extraClauseEn = normalizedExtra
		? hasCrop
			? `Additional requirements (apply only to the marked region corresponding to reference image 2, not to unmarked hands or feet): ${normalizedExtra}. `
			: `Additional requirements: ${normalizedExtra}. `
		: ""

	return (
		"Read reference image 1 as the image to repair and focus on the person's hands and feet. " +
		cropInstrEn +
		"Intelligently repair unnatural hand poses, distorted foot actions, exposure artifacts, blur, missing parts, duplicated limbs, misplaced joints, and warped edges so the finger structure, palm direction, wrist connection, foot movement, ankle transition, and limb alignment become natural, realistic, and visually coherent. " +
		"Preserve the original person's identity, face, hairstyle, outfit, product content, background, composition, lighting, camera language, and overall visual style as much as possible. " +
		"Make only the minimum changes necessary to repair the hands and feet. Do not redraw the whole person, and do not change the outfit style, product content, or scene setting. " +
		"If the original hand or foot information is incomplete or low quality, prioritize a commercially usable result with anatomically correct and aesthetically natural hands and feet. " +
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
			panelClassName: "hand-foot-repair",
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
						"系统将自动识别并修复画面中的手脚瑕疵，提升手脚部位的真实性与美观度",
					),
				},
				{
					id: "maskPainter",
					kind: "mask-painter",
					stateKey: "cropImage",
					sourceStateKey: "sourceImage",
					title: t("section.maskPainter", "标记修复区域（可选）"),
					noSourceHint: t("maskPainter.noSource", "请先上传待修复图"),
					brushSize: 30,
					deps: ["sourceImage"],
					help: t(
						"maskPainter.help",
						"在图上涂抹需要重点修复的手脚区域，AI 将优先处理标记部分。不标记时 AI 自动识别。",
					),
				},
				{
					id: "extraPrompt",
					kind: "textarea",
					stateKey: "extraPrompt",
					title: t("section.extraPrompt", "额外描述"),
					rows: 3,
					maxLength: 800,
					deps: ["sourceImage", "cropImage"],
					placeholder: t(
						"extraPrompt.placeholder",
						"如：重点修复右手手指数量和指节结构，保持肤色、光线与边缘融合自然",
					),
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !state.sourceImage,
						completeImagePrompt: {
							referenceImages: ({ state }) =>
								[state.sourceImage, state.cropImage].filter(Boolean),
							referencesMessage: t(
								"empty.referencesForAiPrompt",
								"请先上传待修复图",
							),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									hasCrop: Boolean(state.cropImage),
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
				buttonLabel: `✨ ${t("button.generate", "生成手脚修复图")}`,
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
						state.cropImage &&
						helpers.collectReferenceIds([state.cropImage]).length !== 1
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
					return buildHandFootRepairRequest({
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
