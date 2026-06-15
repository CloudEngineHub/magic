/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "适合常规商拍试衣样本，平衡效果稳定性与生成效率。",
		promptSuffix: {
			zh: "保持服饰迁移自然、稳定，并达到常规商业试衣可用的完成度。",
			en: "Keep the apparel transfer natural, stable, and commercially polished for standard apparel try-on production usage.",
		},
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback:
			"增强单件上衣、下装、连衣裙的材质、针织、纹理、纽扣、拉链、缝线等细节还原。",
		promptSuffix: {
			zh: "在保持目标模特不变的前提下，更高保真地保留服饰细节，尤其是面料纹理、针织结构、缝线、纽扣、拉链、门襟、装饰边、褶皱和边缘过渡。",
			en: "Preserve fine garment details with higher fidelity, especially fabric texture, knit structure, seams, buttons, zippers, plackets, trim, folds, and edge transitions, while keeping the target model unchanged.",
		},
	},
]

function createInitialState() {
	return {
		realPersonImage: null,
		targetModelImage: null,
		generationMode: "standard",
		samePatternReplace: false,
		genCount: 1,
	}
}

function getReferenceImages(state) {
	// Match UI upload order: real-person garment photo first, target model second.
	return [state.realPersonImage, state.targetModelImage].filter(Boolean)
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
}

function buildRealModelTryOnPrompt({ generationMode, samePatternReplace, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[0]
	const garmentReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const modelReference = MagicPromptLocale.getReferenceLabel(2, locale)
	const samePatternGuidance = samePatternReplace
		? isChinese
			? `如果 ${garmentReference} 和 ${modelReference} 中的服装本身已经具有相近的版型与轮廓，请在 ${modelReference} 上执行同版替换，并保留版型贴合、褶皱、遮挡关系和光线连续性。`
			: `If the garments in ${garmentReference} and ${modelReference} already share a similar pattern and silhouette, perform same-pattern clothing replacement on ${modelReference} and preserve fit alignment, folds, occlusion, and lighting continuity.`
		: isChinese
			? `将 ${garmentReference} 中的服饰自然迁移到 ${modelReference} 上，并根据 ${modelReference} 的身体和姿势调整贴合关系与垂坠效果。`
			: `Transfer the outfit from ${garmentReference} onto ${modelReference} naturally, adapting fit and drape to the body and pose of ${modelReference}.`
	const modePromptSuffix = MagicPromptLocale.pickText(modeDefinition.promptSuffix, locale)

	if (isChinese) {
		return (
			`生成商业真人图试衣结果。仅将 ${garmentReference} 作为服装参考，仅将 ${modelReference} 作为人物和构图参考。` +
			`保持 ${modelReference} 中的人物身份、脸部、发型、身体比例、姿势、机位构图、场景和光线不变。` +
			`保持 ${modelReference} 中可见的画面范围、裁切边界和身体覆盖范围完全不变；如果 ${modelReference} 是半身、侧身或局部裁切，也必须保持相同的可见区域和透视关系。` +
			`不要生成 ${modelReference} 中本来不可见的身体部位。` +
			`将 ${garmentReference} 中完整可见的服装替换到 ${modelReference} 的人物身上，包括可见的上装、下装、连衣裙和外层服饰。` +
			`服装必须与 ${garmentReference} 在颜色、印花、图案、面料、材质、版型、logo 位置、装饰边和结构细节上保持一致。` +
			`不要复制 ${garmentReference} 中的人物、脸部、身体、姿势或场景；最终结果必须是 ${modelReference} 中的人穿上 ${garmentReference} 中的服装。` +
			`${samePatternGuidance} ` +
			modePromptSuffix
		)
	}

	return (
		`Create a commercial apparel virtual try-on image. Use ${garmentReference} only as the clothing reference. Use ${modelReference} only as the person and composition reference. ` +
		`Keep the identity, face, hairstyle, body proportions, pose, camera framing, scene, and lighting of ${modelReference}. ` +
		`Keep the visible framing, crop, and covered body range of ${modelReference} unchanged. If ${modelReference} is half-body, side-view, or partially cropped, keep exactly the same visible area and perspective. ` +
		`Do not generate body parts that are not visible in ${modelReference}. ` +
		`Replace the clothing worn by ${modelReference} with the complete visible outfit from ${garmentReference}, including visible tops, bottoms, dresses, and outer layers. ` +
		`Match the clothing from ${garmentReference} in color, print, pattern, fabric, material, silhouette, logo placement, trim, and construction details. ` +
		`Do not copy the person, face, body, pose, or scene from ${garmentReference}. The final image must show the person from ${modelReference} wearing the clothing from ${garmentReference}. ` +
		`${samePatternGuidance} ` +
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
		const generationModes = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return ctx.panel.render(root, {
			panelClassName: "real-model-tryon",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "realPersonImage",
					kind: "image-slot",
					stateKey: "realPersonImage",
					title: t("section.realPersonImage", "真人图"),
					required: true,
					uploadLabel: t("upload.realPersonImage", "点击上传真人图"),
					alt: t("section.realPersonImage", "真人图"),
					help: t(
						"upload.realPersonImage.help",
						"建议服饰主体清晰完整、遮挡少、版型轮廓明确。",
					),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const currentCount = countReferenceImages(state)
						if (!state.realPersonImage && currentCount >= maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
				},
				{
					id: "targetModelImage",
					kind: "image-slot",
					stateKey: "targetModelImage",
					title: t("section.targetModelImage", "模特图"),
					required: true,
					uploadLabel: t("upload.targetModelImage", "点击上传模特图"),
					alt: t("section.targetModelImage", "模特图"),
					help: t(
						"upload.targetModelImage.help",
						"建议目标模特姿态清晰，待替换区域完整可见，避免大面积遮挡。",
					),
					beforePick: ({ state, helpers }) => {
						const maxReferenceImages = getMaxReferenceImages(state, helpers)
						const currentCount = countReferenceImages(state)
						if (!state.targetModelImage && currentCount >= maxReferenceImages) {
							return t("error.referenceLimit", "参考图数量已达当前模型上限")
						}
						return null
					},
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
					id: "samePatternReplace",
					kind: "toggle",
					stateKey: "samePatternReplace",
					title: t("section.samePatternReplace", "同版替换"),
					help: t(
						"samePatternReplace.help",
						"服饰图与模特图的服饰为同版型时，试衣效果会更好哦！",
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
					required: true,
					title: t("section.count", "生成数量"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成真人图试衣图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.realPersonImage) {
						return t("empty.realPersonImage", "请先上传真人图")
					}
					if (!state.targetModelImage) {
						return t("empty.targetModelImage", "请先上传模特图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.realPersonImage || !state.targetModelImage,
				validate: ({ state, helpers }) => {
					if (helpers.collectReferenceIds(getReferenceImages(state)).length !== 2) {
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
						prompt: buildRealModelTryOnPrompt({
							generationMode: state.generationMode,
							samePatternReplace: state.samePatternReplace,
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
			},
		})
	},
})
