/* global MagicPluginKit, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "适合常规商拍试衣样本，平衡效果稳定性与生成效率。",
		promptSuffix:
			"Keep the apparel transfer natural, stable, and commercially polished for standard apparel try-on production usage.",
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback:
			"增强单件上衣、下装、连衣裙的材质、针织、纹理、纽扣、拉链、缝线等细节还原。",
		promptSuffix:
			"Preserve fine garment details with higher fidelity, especially fabric texture, knit structure, seams, buttons, zippers, plackets, trim, folds, and edge transitions, while keeping the target model unchanged.",
	},
]

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const generationModes = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "real-model-tryon",
			initialState: {
				realPersonImage: null,
				targetModelImage: null,
				generationMode: "standard",
				samePatternReplace: false,
				genCount: 1,
			},
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
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "分辨率"),
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
					if (!state.realPersonImage) {
						return t("empty.realPersonImage", "请先上传真人图")
					}
					if (!state.targetModelImage) {
						return t("empty.targetModelImage", "请先上传模特图")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
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
					ctx.ui.toast(t("toast.success", "真人图试衣图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

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

function buildRealModelTryOnPrompt({ generationMode, samePatternReplace }) {
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[0]
	const garmentReference = "reference image 1"
	const modelReference = "reference image 2"
	const samePatternGuidance = samePatternReplace
		? `If the garments in ${garmentReference} and ${modelReference} already share a similar pattern and silhouette, perform same-pattern clothing replacement on ${modelReference} and preserve fit alignment, folds, occlusion, and lighting continuity.`
		: `Transfer the outfit from ${garmentReference} onto ${modelReference} naturally, adapting fit and drape to the body and pose of ${modelReference}.`

	return (
		`Create a commercial apparel virtual try-on image. Use ${garmentReference} only as the clothing reference. Use ${modelReference} only as the person and composition reference. ` +
		`Keep the identity, face, hairstyle, body proportions, pose, camera framing, scene, and lighting of ${modelReference}. ` +
		`Keep the visible framing, crop, and covered body range of ${modelReference} unchanged. If ${modelReference} is half-body, side-view, or partially cropped, keep exactly the same visible area and perspective. ` +
		`Do not generate body parts that are not visible in ${modelReference}. ` +
		`Replace the clothing worn by ${modelReference} with the complete visible outfit from ${garmentReference}, including visible tops, bottoms, dresses, and outer layers. ` +
		`Match the clothing from ${garmentReference} in color, print, pattern, fabric, material, silhouette, logo placement, trim, and construction details. ` +
		`Do not copy the person, face, body, pose, or scene from ${garmentReference}. The final image must show the person from ${modelReference} wearing the clothing from ${garmentReference}. ` +
		`${samePatternGuidance} ` +
		modeDefinition.promptSuffix
	)
}
