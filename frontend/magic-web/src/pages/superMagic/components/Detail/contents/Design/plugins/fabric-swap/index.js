/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GARMENT_TYPES = [
	{
		value: "top",
		labelKey: "garmentType.top",
		labelFallback: "上装",
		promptText: {
			zh: "上装，包括衬衫、T恤、卫衣、外套、夹克、针织衫等",
			en: "top garment, such as shirt, T-shirt, sweatshirt, jacket, coat, or knitwear",
		},
	},
	{
		value: "pants",
		labelKey: "garmentType.pants",
		labelFallback: "裤装",
		promptText: {
			zh: "裤装，包括长裤、短裤、牛仔裤、休闲裤、西裤等",
			en: "pants garment, such as trousers, shorts, jeans, casual pants, or suit pants",
		},
	},
	{
		value: "skirt",
		labelKey: "garmentType.skirt",
		labelFallback: "裙装",
		promptText: {
			zh: "裙装，包括半裙、连衣裙、短裙、长裙等",
			en: "skirt or dress garment, such as skirt, dress, mini skirt, or long skirt",
		},
	},
]

function createInitialState() {
	return {
		styleImage: null,
		fabricImage: null,
		garmentType: "top",
		genCount: 1,
	}
}

function getReferenceImages(state) {
	return [state.styleImage, state.fabricImage].filter(Boolean)
}

function getSelectedGarmentType(value) {
	return GARMENT_TYPES.find((item) => item.value === value) ?? GARMENT_TYPES[0]
}

function buildPrompt({ garmentType, locale }) {
	const isChinese = MagicPromptLocale.isChinese(locale)
	const styleReference = MagicPromptLocale.getReferenceLabel(1, locale)
	const fabricReference = MagicPromptLocale.getReferenceLabel(2, locale)
	const garmentTypeText = MagicPromptLocale.pickText(
		getSelectedGarmentType(garmentType).promptText,
		locale,
	)

	if (isChinese) {
		return (
			`基于${styleReference}的款式图生成一张换面料后的服装商品图。` +
			`${styleReference}用于确定服装的版型、廓形、比例、领口、袖型、门襟、口袋、褶裥、下摆和所有结构线。` +
			`${fabricReference}用于确定新面料的颜色、纹理、织法、印花、光泽、厚薄、垂坠感和材质触感。` +
			`服装类型是${garmentTypeText}，只替换服装面料，不改变服装类型。` +
			"必须严格保留款式图中的轮廓、版型、结构、角度、构图和商品展示方式；将面料图中的材质自然贴合到服装表面，符合真实裁片方向、褶皱转折、明暗关系和透视变化。" +
			"不要改变服装关键设计点，不要添加多余人体、道具、文字、水印、logo 或背景杂物。输出应清晰、真实、适合服装设计打样和电商展示。"
		)
	}

	return (
		`Generate one apparel product image with a fabric swap based on the style reference ${styleReference}. ` +
		`${styleReference} defines the garment pattern, silhouette, proportions, neckline, sleeves, placket, pockets, pleats, hem, and all construction lines. ` +
		`${fabricReference} defines the new fabric color, texture, weave, print, sheen, thickness, drape, and material feel. ` +
		`The garment type is ${garmentTypeText}; only replace the fabric and do not change the garment category. ` +
		"Strictly preserve the silhouette, pattern, structure, angle, composition, and product presentation from the style reference. Apply the fabric naturally across the garment surface with believable panel direction, folds, lighting, shadows, and perspective. " +
		"Do not change key design details, and do not add extra people, props, text, watermark, logo, or clutter. The output should be clear, realistic, and suitable for fashion design sampling and e-commerce display."
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
		const garmentTypeOptions = GARMENT_TYPES.map((item) => ({
			value: item.value,
			label: t(item.labelKey, item.labelFallback),
		}))

		return ctx.panel.render(root, {
			panelClassName: "fabric-swap",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "styleImage",
					kind: "image-slot",
					stateKey: "styleImage",
					title: t("section.styleImage", "款式图"),
					required: true,
					uploadLabel: t("upload.styleImage", "点击上传款式图"),
					alt: t("section.styleImage", "款式图"),
					help: t(
						"upload.styleImage.help",
						"上传 1 张服装款式图，AI 将保留版型、廓形、结构线和展示角度。",
					),
				},
				{
					id: "fabricImage",
					kind: "image-slot",
					stateKey: "fabricImage",
					title: t("section.fabricImage", "面料图"),
					required: true,
					uploadLabel: t("upload.fabricImage", "点击上传面料图"),
					alt: t("section.fabricImage", "面料图"),
					help: t(
						"upload.fabricImage.help",
						"上传 1 张面料图，AI 将提取颜色、纹理、织法、印花、光泽和垂坠感。",
					),
				},
				{
					id: "garmentType",
					kind: "option-group",
					stateKey: "garmentType",
					title: t("section.garmentType", "服装类型"),
					groupClassName: "fabric-swap-type-grid",
					options: garmentTypeOptions,
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
				},
				{
					id: "resolution",
					kind: "resolution-select",
					title: t("section.resolution", "尺寸倍数"),
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成数量"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成换面料图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					if (!state.styleImage) return t("empty.styleImage", "请先上传款式图")
					if (!state.fabricImage) return t("empty.fabricImage", "请先上传面料图")
					return ""
				},
				isDisabled: ({ state }) => !state.styleImage || !state.fabricImage,
				validate: ({ state, helpers }) => {
					if (!state.styleImage) return t("empty.styleImage", "请先上传款式图")
					if (!state.fabricImage) return t("empty.fabricImage", "请先上传面料图")

					const referenceImages = getReferenceImages(state)
					const maxReferenceImages =
						helpers.getSelectedModel(state)?.image_size_config?.max_reference_images ?? 2
					if (referenceImages.length > maxReferenceImages) {
						return t("error.referenceLimit", "参考图数量已达当前模型上限")
					}
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
					const width = selectedSize.genW
					const height = selectedSize.genH

					return {
						model_id: state.modelId,
						prompt: buildPrompt({
							garmentType: state.garmentType,
							locale: promptLocale,
						}),
						reference_images: helpers.collectReferenceIds(getReferenceImages(state)),
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
