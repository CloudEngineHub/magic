/* global MagicPluginKit, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const ACCESSORY_CATEGORY_OPTIONS = [
	{
		value: "bag",
		promptName: "bag",
		labelKey: "category.bag",
		labelFallback: "包包",
		descriptionKey: "category.bag.desc",
		descriptionFallback: "手提包、单肩包、托特包、斜挎包等包袋类商品。",
	},
	{
		value: "belt",
		promptName: "belt or waist chain",
		labelKey: "category.belt",
		labelFallback: "腰带腰链",
		descriptionKey: "category.belt.desc",
		descriptionFallback: "腰带、腰链及其他腰部配饰。",
	},
	{
		value: "necklace",
		promptName: "necklace",
		labelKey: "category.necklace",
		labelFallback: "项链",
		descriptionKey: "category.necklace.desc",
		descriptionFallback: "项链、颈链、脖链等颈部配饰。",
	},
	{
		value: "glasses",
		promptName: "glasses or sunglasses",
		labelKey: "category.glasses",
		labelFallback: "墨镜眼镜",
		descriptionKey: "category.glasses.desc",
		descriptionFallback: "光学眼镜、墨镜及其他眼部配饰。",
	},
	{
		value: "wristwear",
		promptName: "bracelet or watch",
		labelKey: "category.wristwear",
		labelFallback: "手链手表",
		descriptionKey: "category.wristwear.desc",
		descriptionFallback: "手链、手镯、腕表及其他腕部配饰。",
	},
	{
		value: "hat",
		promptName: "hat",
		labelKey: "category.hat",
		labelFallback: "帽子",
		descriptionKey: "category.hat.desc",
		descriptionFallback: "棒球帽、渔夫帽、针织帽等头部配饰。",
	},
	{
		value: "ring",
		promptName: "ring",
		labelKey: "category.ring",
		labelFallback: "戒指",
		descriptionKey: "category.ring.desc",
		descriptionFallback: "戒指及其他手指配饰。",
	},
]

const GENERATION_MODE_DEFINITIONS = [
	{
		value: "standard",
		labelKey: "generationMode.standard",
		labelFallback: "标准模式",
		descriptionKey: "generationMode.standard.desc",
		descriptionFallback: "强调稳定、准确的配饰试戴结果，适合常规商拍生成。",
		promptSuffix:
			"Keep the try-on stable, accurate, and commercially polished while preserving natural placement in the model's current scene.",
	},
	{
		value: "advanced",
		labelKey: "generationMode.advanced",
		labelFallback: "高级模式",
		descriptionKey: "generationMode.advanced.desc",
		descriptionFallback: "增强材质反射、遮挡、贴合与环境氛围适配，适合更高级的商拍试戴效果。",
		promptSuffix:
			"Add richer material response, realistic reflections, contact shadows, subtle occlusion, and scene-aware styling so the accessory feels naturally worn in the lighting, mood, and motion of the current image.",
	},
]

const ACCESSORY_CATEGORY_PROMPTS = {
	bag: "Place the bag naturally as handheld, shoulder-carried, or crossbody according to the visible arm, shoulder, and torso pose of reference image 2. Match strap tension, body contact, gravity, and walking motion naturally.",
	belt: "Place the belt or waist chain precisely around the visible waistline of reference image 2. Respect clothing overlap, drape, body contour, and the actual visible torso crop.",
	necklace:
		"Place the necklace naturally around the neck and collarbone area of reference image 2. Respect neckline shape, hair overlap, pendant drop, metal contact, and chest crop.",
	glasses:
		"Fit the glasses naturally on the face of reference image 2 with correct bridge position, temple placement, lens angle, and realistic reflections that match the scene lighting.",
	wristwear:
		"Place the bracelet or watch naturally on the visible wrist of reference image 2. Match wrist angle, strap curvature, sleeve overlap, metal highlights, and skin contact pressure.",
	hat: "Fit the hat naturally on the head of reference image 2. Respect head angle, hair compression, brim shadow, and any visible motion or wind implied by the scene.",
	ring: "Place the ring only on a visible finger in reference image 2 with correct perspective, scale, finger curvature, metal highlights, and skin contact.",
}

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const accessoryCategories = ACCESSORY_CATEGORY_OPTIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))
		const generationModes = GENERATION_MODE_DEFINITIONS.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
			description: t(item.descriptionKey, item.descriptionFallback),
		}))

		return MagicPluginKit.mount(ctx, root, {
			panelClassName: "accessory-tryon",
			initialState: {
				accessoryCategory: "bag",
				productImage: null,
				modelImage: null,
				generationMode: "standard",
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
					id: "accessoryCategory",
					kind: "option-group",
					stateKey: "accessoryCategory",
					title: t("section.accessoryCategory", "商品品类"),
					descriptionMode: "tooltip",
					groupClassName: "accessory-tryon-category",
					options: accessoryCategories,
				},
				{
					id: "productImage",
					kind: "image-slot",
					stateKey: "productImage",
					title: t("section.productImage", "商品图"),
					uploadLabel: t("upload.productImage", "点击上传配饰商品图"),
					alt: t("section.productImage", "商品图"),
					help: t(
						"upload.productImage.help",
						"商品图可以是纯商品图或模特图，但只会提取所选品类对应的配饰进行试戴。",
					),
					beforePick: createBeforePickHandler("productImage", t),
				},
				{
					id: "modelImage",
					kind: "image-slot",
					stateKey: "modelImage",
					title: t("section.modelImage", "模特图"),
					uploadLabel: t("upload.modelImage", "点击上传模特图"),
					alt: t("section.modelImage", "模特图"),
					help: t(
						"upload.modelImage.help",
						"建议模特图中目标配饰区域清晰可见，姿态和构图便于保持。",
					),
					beforePick: createBeforePickHandler("modelImage", t),
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
					id: "canvasSize",
					kind: "size-control",
					title: t("section.canvasSize", "画布尺寸"),
					ratioStateKey: "ratioKey",
					deps: ["modelId", "modelOptions", "scale"],
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "modelSelect",
					kind: "model-select",
					title: t("section.modelSelect", "AI 模型"),
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
				buttonLabel: `✨ ${t("button.generate", "生成 AI 试戴图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.productImage) {
						return t("empty.productImage", "请先上传配饰商品图")
					}
					if (!state.modelImage) {
						return t("empty.modelImage", "请先上传模特图")
					}
					return ""
				},
				isDisabled: ({ state }) => !state.productImage || !state.modelImage,
				validate: ({ state, helpers }) => {
					if (!state.productImage) {
						return t("empty.productImage", "请先上传配饰商品图")
					}
					if (!state.modelImage) {
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
						prompt: buildAccessoryTryOnPrompt({
							accessoryCategory: state.accessoryCategory,
							generationMode: state.generationMode,
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
					ctx.ui.toast(t("toast.success", "AI 试戴图生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})
	},
})

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
	return [state.productImage, state.modelImage].filter(Boolean)
}

function countReferenceImages(state) {
	return getReferenceImages(state).length
}

function getMaxReferenceImages(state, helpers) {
	return helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
}

function buildAccessoryTryOnPrompt({ accessoryCategory, generationMode }) {
	const modeDefinition =
		GENERATION_MODE_DEFINITIONS.find((item) => item.value === generationMode) ??
		GENERATION_MODE_DEFINITIONS[0]
	const categoryLabel =
		ACCESSORY_CATEGORY_OPTIONS.find((item) => item.value === accessoryCategory)?.promptName ??
		accessoryCategory
	const categoryPrompt =
		ACCESSORY_CATEGORY_PROMPTS[accessoryCategory] ??
		"Place the selected accessory naturally on the correct visible body region."

	return (
		`Virtual accessory try-on: apply the selected ${categoryLabel} from reference image 1 to the person in reference image 2. ` +
		"Reference image 2 is the base photo. Edit only the selected accessory category; everything else — crop, pose, framing, body, clothing, background, lighting — must stay identical. " +
		"Output only the body parts visible in reference image 2. Do not uncrop or expand the frame. " +
		"Reference image 1 may be a product-only image or a model image. Extract only the selected accessory category from reference image 1; do not copy any other person, garment, body part, or background. " +
		"The accessory must look naturally worn in the current scene, matching perspective, scale, shadow behavior, color response, reflections, and atmosphere of reference image 2. " +
		`${categoryPrompt} ` +
		modeDefinition.promptSuffix
	)
}
