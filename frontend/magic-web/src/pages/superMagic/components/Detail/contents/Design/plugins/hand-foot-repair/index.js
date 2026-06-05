/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

function createInitialState() {
	return {
		sourceImage: null,
		cropImage: null,
		genCount: 1,
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
		prompt: buildHandFootRepairPrompt({ locale, hasCrop }),
		reference_images: helpers.collectReferenceIds(refImages),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildHandFootRepairPrompt({ locale, hasCrop }) {
	if (MagicPromptLocale.isChinese(locale)) {
		const cropInstr = hasCrop
			? "参考图 2 是从待修复图中截取的需重点修复的手脚局部图，请优先修复该区域中的手指、手掌、腕部、脚部、踝部与四肢衔接问题，并将结果自然融入参考图 1 的对应位置。"
			: ""
		return (
			"读取参考图 1 作为待修复图，并重点识别人物的手部和脚部区域。" +
			cropInstr +
			"请智能修复不自然的手部姿势、扭曲的脚部动作，以及穿帮、模糊、缺失、重复、错位、关节异常和边缘畸变等问题，使手指结构、手掌朝向、腕部衔接、脚部动作、踝部过渡和四肢走向更加自然、真实、协调。" +
			"修复时应尽量保持原图中的人物身份、面部、发型、服装、商品、背景、构图、布光、镜头语言和整体视觉风格不变。" +
			"只有在修复手脚所必需时才允许做最小范围调整，不要重绘整个人物，不要改变服装款式、商品内容或场景设定。" +
			"如果原图的手脚信息不完整或局部质量较差，请优先生成解剖结构正确、商业可用且美观自然的修复结果。"
		)
	}

	const cropInstrEn = hasCrop
		? "Reference image 2 is a cropped close-up of the hand or foot region that needs focused repair. Prioritize correcting fingers, palms, wrists, feet, ankles, and limb transitions in that area, then blend the result naturally back into the corresponding position in reference image 1. "
		: ""

	return (
		"Read reference image 1 as the image to repair and focus on the person's hands and feet. " +
		cropInstrEn +
		"Intelligently repair unnatural hand poses, distorted foot actions, exposure artifacts, blur, missing parts, duplicated limbs, misplaced joints, and warped edges so the finger structure, palm direction, wrist connection, foot movement, ankle transition, and limb alignment become natural, realistic, and visually coherent. " +
		"Preserve the original person's identity, face, hairstyle, outfit, product content, background, composition, lighting, camera language, and overall visual style as much as possible. " +
		"Make only the minimum changes necessary to repair the hands and feet. Do not redraw the whole person, and do not change the outfit style, product content, or scene setting. " +
		"If the original hand or foot information is incomplete or low quality, prioritize a commercially usable result with anatomically correct and aesthetically natural hands and feet."
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
					clearLabel: t("maskPainter.clear", "清除标记"),
					brushSize: 30,
					deps: ["sourceImage"],
					help: t(
						"maskPainter.help",
						"在图上涂抹需要重点修复的手脚区域，AI 将优先处理标记部分。不标记时 AI 自动识别。",
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
				buttonLabel: `✨ ${t("button.generate", "生成手脚修复图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
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
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "手脚修复图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
