/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const promptLocale = MagicPromptLocale.resolveLocale(ctx)

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "hand-foot-repair",
			initialState: {
				sourceImage: null,
				genCount: 1,
			},
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
					uploadLabel: t("upload.sourceImage", "点击上传待修复图"),
					alt: t("section.sourceImage", "待修复图"),
					help: t(
						"upload.sourceImage.help",
						"系统将自动识别并修复画面中的手脚瑕疵，提升手脚部位的真实性与美观度",
					),
				},
				{
					id: "modelSelect",
					kind: "model-select",
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
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
					if (!state.sourceImage) {
						return t("empty.sourceImage", "请先上传 1 张待修复图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.sourceImage,
				validate: ({ state, helpers }) => {
					if (!state.sourceImage) {
						return t("empty.sourceImage", "请先上传 1 张待修复图")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
					if (helpers.collectReferenceIds([state.sourceImage]).length !== 1) {
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

function buildHandFootRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH

	return {
		model_id: state.modelId,
		prompt: buildHandFootRepairPrompt({ locale }),
		reference_images: helpers.collectReferenceIds([state.sourceImage]),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildHandFootRepairPrompt({ locale }) {
	if (MagicPromptLocale.isChinese(locale)) {
		return (
			"读取参考图 1 作为待修复图，并重点识别人物的手部和脚部区域。" +
			"请智能修复不自然的手部姿势、扭曲的脚部动作，以及穿帮、模糊、缺失、重复、错位、关节异常和边缘畸变等问题，使手指结构、手掌朝向、腕部衔接、脚部动作、踝部过渡和四肢走向更加自然、真实、协调。" +
			"修复时应尽量保持原图中的人物身份、面部、发型、服装、商品、背景、构图、布光、镜头语言和整体视觉风格不变。" +
			"只有在修复手脚所必需时才允许做最小范围调整，不要重绘整个人物，不要改变服装款式、商品内容或场景设定。" +
			"如果原图的手脚信息不完整或局部质量较差，请优先生成解剖结构正确、商业可用且美观自然的修复结果。"
		)
	}

	return (
		"Read reference image 1 as the image to repair and focus on the person's hands and feet. " +
		"Intelligently repair unnatural hand poses, distorted foot actions, exposure artifacts, blur, missing parts, duplicated limbs, misplaced joints, and warped edges so the finger structure, palm direction, wrist connection, foot movement, ankle transition, and limb alignment become natural, realistic, and visually coherent. " +
		"Preserve the original person's identity, face, hairstyle, outfit, product content, background, composition, lighting, camera language, and overall visual style as much as possible. " +
		"Make only the minimum changes necessary to repair the hands and feet. Do not redraw the whole person, and do not change the outfit style, product content, or scene setting. " +
		"If the original hand or foot information is incomplete or low quality, prioritize a commercially usable result with anatomically correct and aesthetically natural hands and feet."
	)
}
