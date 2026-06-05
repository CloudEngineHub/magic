/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const GARMENT_MODE_OPTIONS = [
	{
		value: "separates",
		labelKey: "garmentMode.separates",
		labelFallback: "上/下装",
		descriptionKey: "garmentMode.separates.desc",
		descriptionFallback: "适合分别上传上装和下装，例如上衣、裤子、裙子或鞋子。",
	},
	{
		value: "onePiece",
		labelKey: "garmentMode.onePiece",
		labelFallback: "连体装",
		descriptionKey: "garmentMode.onePiece.desc",
		descriptionFallback: "适合连衣裙、连体裤、长袍等单张完整服饰图。",
	},
]

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "适合常规商拍试衣样本，平衡效果稳定性与生成效率。",
		promptSuffix: {
			zh: "保持服饰迁移自然、稳定，并达到商业可用的完成度。",
			en: "Keep the apparel transfer natural, stable, and commercially polished.",
		},
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback: "增强面料纹理、针织结构、缝线、拉链、纽扣、边缘和褶皱等细节还原。",
		promptSuffix: {
			zh: "应用更真实的服装物理表现，包括胸部、腰部、臀部和侧缝周围的自然褶皱、垂坠、拉力与贴合。根据服装类型和腰线关系做出合理穿着判断，例如塞进下装、自然鼓出或自然垂落。对于吊带或无袖服饰，呈现真实的肩带位置，并避免不兼容的内搭痕迹。保留领口、领型、罗纹、缝线、纽扣、拉链、压褶和下摆等结构细节。",
			en: "Apply realistic garment physics: natural folds, drape, tension, and contact around the bust, waist, hips, and side seams. Make fabric-aware dressing decisions: tuck, blouse, or leave loose based on garment type and waistband. For strappy or sleeveless garments, render realistic strap placement and hide incompatible undergarment traces. Preserve construction details: collar, neckline, ribbing, seams, buttons, zippers, pleats, and hems.",
		},
	},
]

function createInitialState() {
	return {
		garmentMode: "separates",
		topGarmentImage: null,
		bottomGarmentImage: null,
		onePieceGarmentImage: null,
		targetModelImage: null,
		generationMode: "standard",
		genCount: 1,
	}
}

function createBeforePickHandler(stateKey, t) {
	return ({ state, helpers }) => {
		const maxReferenceImages = getMaxReferenceImages(state, helpers)
		const currentCount = countReferenceImages(state)
		if (!state[stateKey] && currentCount >= maxReferenceImages) {
			return t("error.referenceLimit", "参考图数量已达当前模型上限")
		}
		return null
	}
}

function getReferenceImages(state) {
	if (state.garmentMode === "onePiece") {
		return [state.onePieceGarmentImage, state.targetModelImage].filter(Boolean)
	}
	return [state.topGarmentImage, state.bottomGarmentImage, state.targetModelImage].filter(Boolean)
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 3
}

function buildDressUpTryOnPrompt({
	garmentMode,
	generationMode,
	hasTopGarment,
	hasBottomGarment,
	locale,
}) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[1]
	const modePromptSuffix = MagicPromptLocale.pickText(modeDefinition.promptSuffix, locale)

	if (isChinese) {
		if (garmentMode === "onePiece") {
			return (
				"虚拟试衣：让参考图 2 中的人物穿上参考图 1 的服饰。" +
				"参考图 2 是底图，只编辑服装，其他内容包括裁切、姿势、构图、背景和光线都必须保持一致。" +
				"最终仅输出参考图 2 中原本可见的身体部分，不要扩图或补全画面。" +
				"服饰必须与参考图 1 在颜色、图案、面料、版型和结构细节上严格一致，不要复制参考图 1 中的人物。" +
				modePromptSuffix
			)
		}

		if (hasTopGarment && hasBottomGarment) {
			return (
				"虚拟试衣：让参考图 3 中的人物穿上参考图 1 的上装和参考图 2 的下装。" +
				"参考图 3 是底图，只编辑服装，其他内容包括裁切、姿势、构图、背景和光线都必须保持一致。" +
				"最终仅输出参考图 3 中原本可见的身体部分，不要扩图或补全画面。" +
				"只替换参考图 3 中可见的服装区域。参考图 1 和参考图 2 的服饰必须在颜色、图案、面料、版型和结构细节上被准确还原，不要复制参考图 1 或参考图 2 中的人物。" +
				modePromptSuffix
			)
		}

		if (hasTopGarment) {
			return (
				"虚拟试衣：将参考图 2 中人物的上半身服装替换为参考图 1 的上装。" +
				"参考图 2 是底图，只编辑上半身服装，其他内容包括裁切、姿势、构图、背景和光线都必须保持一致。" +
				"最终仅输出参考图 2 中原本可见的身体部分，不要扩图或补全画面，并保持下半身服装不变。" +
				"上装必须与参考图 1 在颜色、图案、面料、版型和结构细节上严格一致，不要复制参考图 1 中的人物。" +
				modePromptSuffix
			)
		}

		return (
			"虚拟试衣：将参考图 2 中人物的下半身服装替换为参考图 1 的下装。" +
			"参考图 2 是底图，只编辑下半身服装，其他内容包括裁切、姿势、构图、背景和光线都必须保持一致。" +
			"最终仅输出参考图 2 中原本可见的身体部分，不要扩图或补全画面，并保持上半身服装不变。" +
			"下装必须与参考图 1 在颜色、图案、面料、版型和结构细节上严格一致，不要复制参考图 1 中的人物。" +
			modePromptSuffix
		)
	}

	if (garmentMode === "onePiece") {
		return (
			"Virtual try-on: dress the person from reference image 2 in the garment from reference image 1. " +
			"Reference image 2 is the base photo. Edit only the clothing; everything else — crop, pose, framing, background, lighting — must stay identical. " +
			"Output only the body parts visible in reference image 2. Do not uncrop or expand the frame. " +
			"Match the garment from reference image 1 exactly in color, pattern, fabric, silhouette, and construction. Do not copy the person from reference image 1. " +
			modePromptSuffix
		)
	}

	if (hasTopGarment && hasBottomGarment) {
		return (
			"Virtual try-on: dress the person from reference image 3 in the garments from reference image 1 (top) and reference image 2 (bottom). " +
			"Reference image 3 is the base photo. Edit only the clothing; everything else — crop, pose, framing, background, lighting — must stay identical. " +
			"Output only the body parts visible in reference image 3. Do not uncrop or expand the frame. " +
			"Replace only the garment regions visible in reference image 3. Match reference image 1 and reference image 2 exactly in color, pattern, fabric, silhouette, and construction. Do not copy the person from reference image 1 or reference image 2. " +
			modePromptSuffix
		)
	}

	if (hasTopGarment) {
		return (
			"Virtual try-on: replace the upper-body clothing of the person from reference image 2 with the top garment from reference image 1. " +
			"Reference image 2 is the base photo. Edit only the upper-body clothing; everything else — crop, pose, framing, background, lighting — must stay identical. " +
			"Output only the body parts visible in reference image 2. Do not uncrop or expand the frame. Keep lower-body clothing unchanged. " +
			"Match the top garment from reference image 1 exactly in color, pattern, fabric, silhouette, and construction. Do not copy the person from reference image 1. " +
			modePromptSuffix
		)
	}

	return (
		"Virtual try-on: replace the lower-body clothing of the person from reference image 2 with the bottom garment from reference image 1. " +
		"Reference image 2 is the base photo. Edit only the lower-body clothing; everything else — crop, pose, framing, background, lighting — must stay identical. " +
		"Output only the body parts visible in reference image 2. Do not uncrop or expand the frame. Keep upper-body clothing unchanged. " +
		"Match the bottom garment from reference image 1 exactly in color, pattern, fabric, silhouette, and construction. Do not copy the person from reference image 1. " +
		modePromptSuffix
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
		const garmentModes = GARMENT_MODE_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))
		const generationModes = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return ctx.panel.render(root, {
			panelClassName: "dress-up-tryon",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "garmentMode",
					kind: "option-group",
					stateKey: "garmentMode",
					title: t("section.garmentMode", "平铺/人台图"),
					variant: "card",
					descriptionMode: "inline",
					groupClassName: "dress-up-tryon-garment-mode",
					options: garmentModes,
				},
				{
					id: "topGarmentImage",
					kind: "image-slot",
					stateKey: "topGarmentImage",
					title: t("section.topGarmentImage", "上装图"),
					uploadLabel: t("upload.topGarmentImage", "点击上传上装图"),
					alt: t("section.topGarmentImage", "上装图"),
					deps: ["garmentMode"],
					when: ({ state }) => state.garmentMode === "separates",
					help: t(
						"upload.topGarmentImage.help",
						"建议上传边界清晰、无遮挡、上装轮廓完整可见的平铺或人台服饰图。",
					),
					beforePick: createBeforePickHandler("topGarmentImage", t),
				},
				{
					id: "bottomGarmentImage",
					kind: "image-slot",
					stateKey: "bottomGarmentImage",
					title: t("section.bottomGarmentImage", "下装图"),
					uploadLabel: t("upload.bottomGarmentImage", "点击上传下装图"),
					alt: t("section.bottomGarmentImage", "下装图"),
					deps: ["garmentMode"],
					when: ({ state }) => state.garmentMode === "separates",
					help: t(
						"upload.bottomGarmentImage.help",
						"建议上传边界清晰、无遮挡、下装轮廓完整可见的平铺或人台服饰图。",
					),
					beforePick: createBeforePickHandler("bottomGarmentImage", t),
				},
				{
					id: "onePieceGarmentImage",
					kind: "image-slot",
					stateKey: "onePieceGarmentImage",
					title: t("section.onePieceGarmentImage", "连体装图"),
					uploadLabel: t("upload.onePieceGarmentImage", "点击上传连体装图"),
					alt: t("section.onePieceGarmentImage", "连体装图"),
					deps: ["garmentMode"],
					when: ({ state }) => state.garmentMode === "onePiece",
					help: t(
						"upload.onePieceGarmentImage.help",
						"建议上传服饰轮廓完整、结构清晰、无遮挡的平铺或人台图。",
					),
					beforePick: createBeforePickHandler("onePieceGarmentImage", t),
				},
				{
					id: "targetModelImage",
					kind: "image-slot",
					stateKey: "targetModelImage",
					title: t("section.modelImage", "模特图"),
					uploadLabel: t("upload.modelImage", "点击上传模特图"),
					alt: t("section.modelImage", "模特图"),
					help: t(
						"upload.modelImage.help",
						"建议模特姿势简单、待替换区域完整可见，并尽量与上传服饰版型相近。",
					),
					beforePick: createBeforePickHandler("targetModelImage", t),
				},
				{
					id: "generationMode",
					kind: "option-group",
					stateKey: "generationMode",
					title: t("section.generationMode", "生成模式"),
					groupClassName: "generation-mode-group",
					showDescriptionOnHover: true,
					options: generationModes,
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
					id: "canvasSize",
					kind: "size-control",
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
				buttonLabel: `✨ ${t("button.generate", "生成平铺/人台试衣图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (
						state.garmentMode === "separates" &&
						!state.topGarmentImage &&
						!state.bottomGarmentImage
					) {
						return t("empty.separatesGarmentImage", "请至少上传上装图或下装图")
					}
					if (state.garmentMode === "onePiece" && !state.onePieceGarmentImage) {
						return t("empty.onePieceGarmentImage", "请先上传连体装图")
					}
					if (!state.targetModelImage) {
						return t("empty.modelImage", "请先上传模特图")
					}
					return ""
				},
				isDisabled: ({ state }) => {
					if (state.garmentMode === "separates") {
						return (
							(!state.topGarmentImage && !state.bottomGarmentImage) ||
							!state.targetModelImage
						)
					}
					return !state.onePieceGarmentImage || !state.targetModelImage
				},
				validate: ({ state, helpers }) => {
					if (
						state.garmentMode === "separates" &&
						!state.topGarmentImage &&
						!state.bottomGarmentImage
					) {
						return t("empty.separatesGarmentImage", "请至少上传上装图或下装图")
					}
					if (state.garmentMode === "onePiece" && !state.onePieceGarmentImage) {
						return t("empty.onePieceGarmentImage", "请先上传连体装图")
					}
					if (!state.targetModelImage) {
						return t("empty.modelImage", "请先上传模特图")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
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
					const referenceImages = helpers.collectReferenceIds(getReferenceImages(state))
					const width = selectedSize.genW
					const height = selectedSize.genH

					return {
						model_id: state.modelId,
						prompt: buildDressUpTryOnPrompt({
							garmentMode: state.garmentMode,
							generationMode: state.generationMode,
							hasTopGarment: Boolean(state.topGarmentImage),
							hasBottomGarment: Boolean(state.bottomGarmentImage),
							locale: promptLocale,
						}),
						reference_images: referenceImages,
						size: `${width}x${height}`,
						resolution: state.scale || undefined,
						width,
						height,
						count: state.genCount,
						select: false,
					}
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "平铺/人台试衣图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})
