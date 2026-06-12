/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

/* 视角模式 */
const VIEW_MODE = {
	/* 单视角图 */
	SINGLE: "single",
	/* 多视角图 */
	MULTI: "multi",
}

const VIEW_MODE_OPTIONS = [
	{
		value: VIEW_MODE.SINGLE,
		labelKey: "viewMode.single",
		labelFallback: "单视角图",
	},
	{
		value: VIEW_MODE.MULTI,
		labelKey: "viewMode.multi",
		labelFallback: "多视角图",
	},
]

function createInitialState() {
	return {
		viewMode: VIEW_MODE.SINGLE,
		shoeImage: null,
		modelRefImage: null,
		bothFeetImage: null,
		exteriorImage: null,
		interiorImage: null,
		extra: "",
	}
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 4
}

function getReferenceImages(state) {
	if (state.viewMode === VIEW_MODE.MULTI) {
		return [state.bothFeetImage, state.exteriorImage, state.interiorImage].filter(Boolean)
	}
	return [state.shoeImage, state.modelRefImage].filter(Boolean)
}

function createBeforePickHandler(stateKey, t) {
	return ({ state, helpers }) => {
		const maxReferenceImages = getMaxReferenceImages(state, helpers)
		const currentCount = getReferenceImages(state).length
		if (!state[stateKey] && currentCount >= maxReferenceImages) {
			return t("error.referenceLimit", "参考图数量已达当前模型上限")
		}
		return null
	}
}

function hasMultiViewReference(state) {
	return Boolean(state.bothFeetImage || state.exteriorImage || state.interiorImage)
}

function canGenerate(state) {
	if (state.viewMode === VIEW_MODE.MULTI) return hasMultiViewReference(state)
	return Boolean(state.shoeImage)
}

function buildExtraClause(extra, locale) {
	const normalizedExtra = String(extra ?? "").trim()
	if (!normalizedExtra) return ""
	return MagicPromptLocale.isChinese(locale)
		? `额外要求：${normalizedExtra}。`
		: `Additional requirements: ${normalizedExtra}. `
}

function buildCurrentTextBlock(currentText) {
	const normalizedCurrentText = String(currentText ?? "").trim()
	if (!normalizedCurrentText) return "用户当前未填写。"
	return normalizedCurrentText
}

function buildExtraPromptCompletionUserPrompt({ state }) {
	const modeText = state.viewMode === VIEW_MODE.MULTI ? "多视角图" : "单视角图"
	const referenceText =
		state.viewMode === VIEW_MODE.MULTI
			? [
					state.bothFeetImage ? "已上传双脚鞋图。" : "未上传双脚鞋图。",
					state.exteriorImage ? "已上传单鞋外侧图。" : "未上传单鞋外侧图。",
					state.interiorImage ? "已上传单鞋内侧图。" : "未上传单鞋内侧图。",
				].join("")
			: [
					state.shoeImage ? "已上传鞋靴商品图。" : "未上传鞋靴商品图。",
					state.modelRefImage
						? "已上传模特参考图，可参考姿势、风格和场景。"
						: "未上传模特参考图，可补充模特、场景、光线和构图要求。",
				].join("")

	return [
		"任务目标：为鞋靴试穿插件的“额外描述”输入框生成或补全一段提示词。",
		`当前输入：${buildCurrentTextBlock(state.extra)}`,
		`当前成片类型：${modeText}。${referenceText}`,
		"补全方向：重点补充模特风格、拍摄场景、光线、构图、上脚角度、商业摄影质感和背景洁净度。",
		"业务限制：不要改变鞋靴商品的颜色、材质、结构、logo、纹理、鞋底、鞋带、五金和关键设计细节；不要输出完整生成任务说明，只输出适合填入“额外描述”的短提示词。",
	].join("\n")
}

function buildSingleViewPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const shoeReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const modelReference = MagicPromptLocale.getReferenceLabel(2, locale)
	const extraClause = buildExtraClause(state.extra, locale)

	if (isChinese) {
		if (state.modelRefImage) {
			return (
				`生成专业鞋靴上脚商拍图。${shoeReference}是唯一的鞋靴商品参考图，` +
				`所有可见鞋靴都必须严格匹配${shoeReference}中的颜色、材质、纹理、鞋型轮廓、鞋底、鞋带、缝线、logo、五金和关键设计细节。` +
				`${modelReference}作为模特姿势和风格参考，请参考其姿态、腿部位置、机位角度、场景和光线。` +
				"鞋靴需要自然穿在模特脚上，脚部结构可信，透视准确，接触阴影真实，完整或 3/4 身展示并清晰突出鞋靴。" +
				extraClause +
				"专业电商商业摄影，高质量，真实自然。"
			)
		}
		return (
			`生成专业鞋靴上脚商拍图。${shoeReference}是唯一的鞋靴商品参考图，` +
			`所有可见鞋靴都必须严格匹配${shoeReference}中的颜色、材质、纹理、鞋型轮廓、鞋底、鞋带、缝线、logo、五金和关键设计细节。` +
			"由 AI 自动生成适合的模特，鞋靴自然穿在模特脚上，脚部结构可信，透视准确，接触阴影真实，完整或 3/4 身展示并清晰突出鞋靴。" +
			extraClause +
			"专业电商商业摄影，干净摄影棚或生活方式背景，高质量。"
		)
	}

	if (state.modelRefImage) {
		return (
			`Generate a professional commercial footwear try-on image. Use ${shoeReference} as the only shoe product reference. ` +
			`Every visible shoe must exactly match ${shoeReference} in color, material, texture, silhouette, sole, laces, stitching, logo, hardware, and key design details. ` +
			`Use ${modelReference} as the model pose and style reference. Match its pose, leg position, camera angle, scene, and lighting. ` +
			"The shoes must be naturally worn on the model's feet with believable anatomy, accurate perspective, realistic contact shadows, and a full-body or 3/4 body composition that clearly showcases the footwear. " +
			extraClause +
			"Professional e-commerce commercial photography, high quality, realistic and natural."
		)
	}

	return (
		`Generate a professional commercial footwear try-on image. Use ${shoeReference} as the only shoe product reference. ` +
		`Every visible shoe must exactly match ${shoeReference} in color, material, texture, silhouette, sole, laces, stitching, logo, hardware, and key design details. ` +
		"Generate a suitable model automatically. The shoes must be naturally worn on the model's feet with believable anatomy, accurate perspective, realistic contact shadows, and a full-body or 3/4 body composition that clearly showcases the footwear. " +
		extraClause +
		"Professional e-commerce commercial photography, clean studio or lifestyle background, high quality."
	)
}

function buildMultiViewReferenceSummary(state, locale) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const references = []
	let index = 1
	if (state.bothFeetImage) {
		references.push(
			isChinese
				? `参考图 ${index} 是双脚鞋图，用于参考整体上脚效果、鞋靴比例和穿着状态`
				: `Reference image ${index} is a both-feet wearing shot for the overall try-on effect, shoe proportions, and wearing state`,
		)
		index += 1
	}
	if (state.exteriorImage) {
		references.push(
			isChinese
				? `参考图 ${index} 是单鞋外侧图，用于参考外侧轮廓、材质、logo、结构和鞋底细节`
				: `Reference image ${index} is the single shoe exterior side view for the outer silhouette, material, logo, construction, and sole details`,
		)
		index += 1
	}
	if (state.interiorImage) {
		references.push(
			isChinese
				? `参考图 ${index} 是单鞋内侧图，用于参考内侧结构、纹理、走线和鞋型细节`
				: `Reference image ${index} is the single shoe interior side view for inner construction, texture, stitching, and shoe-shape details`,
		)
	}
	return references.join(isChinese ? "；" : "; ")
}

function buildMultiViewPrompt({ state, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const referenceSummary = buildMultiViewReferenceSummary(state, locale)
	const extraClause = buildExtraClause(state.extra, locale)

	if (isChinese) {
		return (
			`根据已上传的鞋靴参考图生成多视角专业商业鞋靴图。${referenceSummary}。` +
			"所有生成视角中的鞋靴必须在颜色、材质、纹理、鞋型轮廓、鞋底、鞋带、缝线、logo、五金和关键设计细节上保持一致。" +
			"画面可以结合上脚效果和商品单品视角，展示鞋靴最适合电商使用的角度，构图清晰，背景干净，摄影棚光线专业。" +
			extraClause +
			"高质量商业摄影，真实自然。"
		)
	}

	return (
		`Generate multiple professional commercial footwear photography angles based on the uploaded references. ${referenceSummary}. ` +
		"All generated views must keep the footwear consistent in color, material, texture, silhouette, sole, laces, stitching, logo, hardware, and key design details. " +
		"Combine on-foot try-on shots and product-only angles where appropriate, showing the footwear from strong e-commerce-ready angles with clean composition, clean background, and professional studio lighting. " +
		extraClause +
		"High quality commercial photography, realistic and natural."
	)
}

function buildBootsRequest({ state, helpers, locale, selectedSize }) {
	const referenceImages = helpers.collectReferenceIds(getReferenceImages(state))
	const prompt =
		state.viewMode === VIEW_MODE.MULTI
			? buildMultiViewPrompt({ state, locale })
			: buildSingleViewPrompt({ state, locale })

	return {
		model_id: state.modelId,
		prompt,
		size: `${selectedSize.genW}x${selectedSize.genH}`,
		resolution: state.scale || undefined,
		reference_images: referenceImages,
		width: selectedSize.genW,
		height: selectedSize.genH,
		count: state.genCount,
		select: true,
	}
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
		const viewModeOptions = VIEW_MODE_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
		}))

		return ctx.panel.render(root, {
			panelClassName: "boots-tryon",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "viewMode",
					kind: "tabs",
					stateKey: "viewMode",
					options: viewModeOptions,
				},
				{
					id: "shoeImage",
					kind: "image-slot",
					stateKey: "shoeImage",
					title: t("section.shoeImage", "鞋靴商品图"),
					required: true,
					uploadLabel: t("upload.shoeImage", "点击上传鞋靴商品图"),
					help: t(
						"upload.shoeImage.help",
						"建议上传正面或 3/4 侧面的单鞋清晰图，效果更佳。",
					),
					alt: t("section.shoeImage", "鞋靴商品图"),
					when: ({ state }) => state.viewMode === VIEW_MODE.SINGLE,
					deps: ["viewMode"],
					beforePick: createBeforePickHandler("shoeImage", t),
				},
				{
					id: "modelRefImage",
					kind: "image-slot",
					stateKey: "modelRefImage",
					title: t("section.modelRefImage", "模特参考图"),
					uploadLabel: t("upload.modelRefImage", "点击上传模特参考图"),
					help: t(
						"upload.modelRefImage.help",
						"上传模特图，AI 将参考其姿势与风格；不上传则由 AI 自动生成模特。",
					),
					alt: t("section.modelRefImage", "模特参考图"),
					when: ({ state }) => state.viewMode === VIEW_MODE.SINGLE,
					deps: ["viewMode"],
					beforePick: createBeforePickHandler("modelRefImage", t),
				},
				{
					id: "bothFeetImage",
					kind: "image-slot",
					stateKey: "bothFeetImage",
					title: t("section.bothFeetImage", "双脚鞋图"),
					uploadLabel: t("upload.bothFeetImage", "点击上传双脚鞋图"),
					help: t(
						"upload.bothFeetImage.help",
						"上传穿着两只鞋的整体图，AI 参考整体上脚效果。",
					),
					alt: t("section.bothFeetImage", "双脚鞋图"),
					when: ({ state }) => state.viewMode === VIEW_MODE.MULTI,
					deps: ["viewMode"],
					beforePick: createBeforePickHandler("bothFeetImage", t),
				},
				{
					id: "exteriorImage",
					kind: "image-slot",
					stateKey: "exteriorImage",
					title: t("section.exteriorImage", "单鞋外侧图"),
					uploadLabel: t("upload.exteriorImage", "点击上传单鞋外侧图"),
					alt: t("section.exteriorImage", "单鞋外侧图"),
					when: ({ state }) => state.viewMode === VIEW_MODE.MULTI,
					deps: ["viewMode"],
					beforePick: createBeforePickHandler("exteriorImage", t),
				},
				{
					id: "interiorImage",
					kind: "image-slot",
					stateKey: "interiorImage",
					title: t("section.interiorImage", "单鞋内侧图"),
					uploadLabel: t("upload.interiorImage", "点击上传单鞋内侧图"),
					help: t(
						"upload.multi.help",
						"至少提供一张图片；多角度图越完整，生成效果越好。",
					),
					alt: t("section.interiorImage", "单鞋内侧图"),
					when: ({ state }) => state.viewMode === VIEW_MODE.MULTI,
					deps: ["viewMode"],
					beforePick: createBeforePickHandler("interiorImage", t),
				},
				{
					id: "extra",
					kind: "textarea",
					stateKey: "extra",
					title: t("section.extra", "额外描述"),
					placeholder: t(
						"placeholder.extra",
						"例如：亚洲女性模特，户外街头场景，自然光，干净背景…",
					),
					deps: [
						"viewMode",
						"shoeImage",
						"modelRefImage",
						"bothFeetImage",
						"exteriorImage",
						"interiorImage",
					],
					aiGenerate: {
						label: t("button.aiPlaceholder", "AI 生成"),
						loadingLabel: t("button.generating", "生成中…"),
						disabled: ({ state }) => !getReferenceImages(state).length,
						completeImagePrompt: {
							referenceImages: ({ state }) => getReferenceImages(state),
							referencesMessage: t("error.extraReferences", "请先上传参考图"),
							userPrompt: ({ state }) =>
								buildExtraPromptCompletionUserPrompt({
									state,
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
				buttonLabel: `✨ ${t("button.generate", "一键生成上脚商拍图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (state.viewMode === VIEW_MODE.MULTI && !hasMultiViewReference(state)) {
						return t("empty.multi", "请至少上传一张多视角鞋靴参考图")
					}
					if (state.viewMode === VIEW_MODE.SINGLE && !state.shoeImage) {
						return t("empty.shoeImage", "请先上传鞋靴商品图")
					}
					return ""
				},
				isDisabled: ({ state }) => !canGenerate(state),
				validate: ({ state, helpers }) => {
					const referenceImages = getReferenceImages(state)
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
					return buildBootsRequest({
						state,
						helpers,
						locale: promptLocale,
						selectedSize,
					})
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "鞋靴上脚图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
