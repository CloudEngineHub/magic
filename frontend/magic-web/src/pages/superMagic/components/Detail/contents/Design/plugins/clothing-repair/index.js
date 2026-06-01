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

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "clothing-repair",
			initialState: {
				repairType: "styleRepair",
				sourceImage: null,
				referenceProductImage: null,
				genCount: 1,
			},
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
					uploadLabel: t("upload.sourceImage", "点击上传待修复图"),
					alt: t("section.sourceImage", "待修复图"),
					help: t(
						"upload.sourceImage.help",
						"上传需要修复的模特服饰图，AI 会在保留人物与场景的前提下修正服饰问题。",
					),
				},
				{
					id: "referenceProductImage",
					kind: "image-slot",
					stateKey: "referenceProductImage",
					title: t("section.referenceProductImage", "参考商品图"),
					uploadLabel: t("upload.referenceProductImage", "点击上传参考商品图"),
					alt: t("section.referenceProductImage", "参考商品图"),
					help: t(
						"upload.referenceProductImage.help",
						"支持上传单张平铺图、人台图或模特图，作为服饰款式或细节修复参考。",
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
				buttonLabel: `✨ ${t("button.generate", "生成服饰修复图")}`,
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
					if (!state.sourceImage) {
						return t("empty.sourceImage", "请先上传 1 张待修复图")
					}
					if (!state.referenceProductImage) {
						return t("empty.referenceProductImage", "请先上传 1 张参考商品图")
					}
					if (!state.modelId) {
						return t("error.noModels", "暂无可用 AI 模型")
					}
					if (
						helpers.collectReferenceIds([
							state.sourceImage,
							state.referenceProductImage,
						]).length !== 2
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

function buildClothingRepairRequest({ state, helpers, locale, selectedSize }) {
	const width = selectedSize.genW
	const height = selectedSize.genH

	return {
		model_id: state.modelId,
		prompt: buildClothingRepairPrompt({ repairType: state.repairType, locale }),
		reference_images: helpers.collectReferenceIds([
			state.sourceImage,
			state.referenceProductImage,
		]),
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildClothingRepairPrompt({ repairType, locale }) {
	if (MagicPromptLocale.isChinese(locale)) {
		if (repairType === "detailRepair") {
			return (
				"读取参考图 1 作为待修复图，读取参考图 2 作为参考商品图。" +
				"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体服饰穿着关系不变的前提下，重点修复服饰细节。" +
				"细节修复应优先对齐参考图 2 中的面料纹理、织物组织、走线、纽扣、拉链、门襟、口袋、印花、logo、边缘、褶皱、垂坠与局部质感表现。" +
				"不要整体改写服饰款式或版型，只对待修复图中的服饰细节进行更真实、更完整、更商业可用的修正。"
			)
		}

		return (
			"读取参考图 1 作为待修复图，读取参考图 2 作为参考商品图。" +
			"请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体穿着关系不变的前提下，对人物身着服饰进行款式修复。" +
			"款式修复应参考参考图 2 的服饰主体，修正待修复图中的服饰款式、轮廓、结构、长度、袖型、裤型、领口、下摆、版型贴合和整体造型表现。" +
			"不要替换人物，不要改变场景，不要新增无关服饰元素；只对待修复图中的服饰款式问题做自然、真实、商业可用的修正。"
		)
	}

	if (repairType === "detailRepair") {
		return (
			"Read reference image 1 as the image to repair and reference image 2 as the product reference. " +
			"Keep the person identity, pose, framing, scene, background, and overall wearing relationship from reference image 1 unchanged while focusing on garment detail repair. " +
			"Match garment details to reference image 2 more faithfully, especially fabric texture, weave structure, stitching, buttons, zippers, plackets, pockets, prints, logos, edges, folds, drape, and localized material response. " +
			"Do not rewrite the whole garment style or silhouette. Only repair the apparel details so the result looks more realistic, complete, and commercially usable."
		)
	}

	return (
		"Read reference image 1 as the image to repair and reference image 2 as the product reference. " +
		"Preserve the person identity, pose, framing, scene, background, and overall wearing relationship from reference image 1 while performing apparel style repair. " +
		"Use reference image 2 to correct the garment style, silhouette, structure, length, sleeve shape, pant shape, neckline, hem, fit, and overall apparel appearance in reference image 1. " +
		"Do not replace the person, do not change the scene, and do not add unrelated clothing elements. Repair only the garment-style issues so the result feels natural, realistic, and commercially usable."
	)
}