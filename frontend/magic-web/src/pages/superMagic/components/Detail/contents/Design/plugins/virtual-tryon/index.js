const MAX_GARMENTS = 5

const STYLE_OPTIONS = [
	{ value: "realistic", label: "写实", desc: "自然真实的穿搭效果" },
	{ value: "fashion", label: "时尚大片", desc: "杂志级别的时尚感" },
	{ value: "ecommerce", label: "电商白底", desc: "纯白背景，适合上架" },
	{ value: "preserve", label: "保留原图", desc: "保持模特底图的场景与风格" },
]

const STYLE_SUFFIX = {
	realistic: "realistic photo, natural lighting, full body shot, high quality photography",
	fashion:
		"fashion magazine editorial style, professional photography, dramatic lighting, high quality",
	ecommerce:
		"pure white background, clean studio lighting, e-commerce product photo, full body, high quality",
	preserve:
		"preserve the exact scene, background, lighting, color grading and photographic style of the reference model image, seamlessly blend the clothing onto the model without altering any other aspect of the original photo",
}

const IMAGE_GENERATION_CONFIG_PREFIX = "image_generation_config."
const GENERATION_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8]

registerMagicCanvasPlugin({
	mount(ctx, root) {
		const state = {
			garments: [],
			modelImage: null,
			modelOptions: [],
			modelId: "",
			modelMenuOpen: false,
			ratioKey: "",
			scale: "",
			genCount: 1,
			imageGenerationConfig: {},
			style: "realistic",
			extra: "",
			loading: false,
			error: "",
		}

		const t = (key, fallback) => ctx.i18n.t(key, fallback)
		const view = {
			panel: null,
			content: null,
			footer: null,
			garments: null,
			model: null,
			slots: {},
		}

		const setState = (patch) => {
			const hasChanged = Object.keys(patch).some((key) => state[key] !== patch[key])
			if (!hasChanged) return
			Object.assign(state, patch)
			updateView(patch)
		}

		const updateHeight = () => {
			requestAnimationFrame(() => {
				ctx.ui.setHeight(root.scrollHeight)
			})
		}

		const getSelectedModel = () => {
			return state.modelOptions.find((item) => item.model_id === state.modelId)
		}

		const getModelSizes = () => {
			return getSelectedModel()?.image_size_config?.sizes ?? []
		}

		const getImageSettings = () => {
			return (getSelectedModel()?.image_size_config?.image_settings ?? [])
				.map((setting) => {
					const requestKey = setting.key?.startsWith(IMAGE_GENERATION_CONFIG_PREFIX)
						? setting.key.slice(IMAGE_GENERATION_CONFIG_PREFIX.length)
						: setting.key
					return {
						...setting,
						requestKey,
						options: setting.options?.filter((option) => option.value) ?? [],
					}
				})
				.filter((setting) => setting.requestKey && setting.options.length > 0)
		}

		const buildDefaultImageGenerationConfig = (model) => {
			return (model?.image_size_config?.image_settings ?? []).reduce((config, setting) => {
				const requestKey = setting.key?.startsWith(IMAGE_GENERATION_CONFIG_PREFIX)
					? setting.key.slice(IMAGE_GENERATION_CONFIG_PREFIX.length)
					: setting.key
				const options = setting.options?.filter((option) => option.value) ?? []
				const defaultOption = options.find((option) => option.value === setting.default)
				if (requestKey && options.length) {
					config[requestKey] = defaultOption?.value ?? options[0].value
				}
				return config
			}, {})
		}

		const getResolutionOptions = () => {
			return Array.from(
				new Set(
					getModelSizes()
						.map((size) => size.scale)
						.filter(Boolean),
				),
			)
		}

		const getDefaultResolution = (model) => {
			const sizes = model?.image_size_config?.sizes ?? []
			const options = Array.from(new Set(sizes.map((size) => size.scale).filter(Boolean)))
			if (!options.length) return ""
			const defaultScale = model?.image_size_config?.default_scale
			return defaultScale && options.includes(defaultScale) ? defaultScale : options[0]
		}

		const getVisibleSizes = () => {
			const sizes = getModelSizes()
			if (!state.scale) return sizes
			const matched = sizes.filter((size) => size.scale === state.scale)
			return matched.length ? matched : sizes
		}

		const getSelectedRatio = () => {
			const sizes = getVisibleSizes()
			return sizes.find((item) => item.label === state.ratioKey) ?? sizes[0]
		}

		const getSelectedSize = () => {
			const selectedRatio = getSelectedRatio()
			if (!selectedRatio?.value) return null
			const [genW, genH] = selectedRatio.value.split("x").map(Number)
			return {
				...selectedRatio,
				genW: Number.isFinite(genW) ? genW : 0,
				genH: Number.isFinite(genH) ? genH : 0,
			}
		}

		const getMaxReferenceImages = () => {
			return getSelectedModel()?.image_size_config?.max_reference_images ?? MAX_GARMENTS
		}

		const applyModelDefaults = (model) => {
			const targetResolution = getDefaultResolution(model)
			const sizes = model?.image_size_config?.sizes ?? []
			const sizesForResolution = targetResolution
				? sizes.filter((size) => size.scale === targetResolution)
				: sizes
			const targetSize = sizesForResolution[0] ?? sizes[0]
			return {
				ratioKey: targetSize?.label ?? "",
				scale: targetResolution,
				imageGenerationConfig: buildDefaultImageGenerationConfig(model),
			}
		}

		const pickImageFiles = async (options) => {
			if (ctx.assets?.pickFiles) {
				return ctx.assets.pickFiles({ ...options, type: "image" })
			}
			throw new Error("ctx.assets.pickFiles is not connected yet.")
		}

		const generateAndPlace = async (payload) => {
			if (ctx.ai?.generateAndPlace) return ctx.ai.generateAndPlace(payload)
			throw new Error("ctx.ai.generateAndPlace is not connected yet.")
		}

		const loadImageModels = async () => {
			if (!ctx.ai?.getImageModels) return
			try {
				const models = await ctx.ai.getImageModels()
				if (!models?.length) {
					setState({ error: "暂无可用 AI 模型" })
					return
				}
				const firstModel = models[0]
				const nextModelId = state.modelId || firstModel.model_id
				const selectedModel =
					models.find((model) => model.model_id === nextModelId) ?? firstModel
				setState({
					modelOptions: models,
					modelId: nextModelId,
					...applyModelDefaults(selectedModel),
				})
			} catch {
				// Model selection is optional for the plugin UI.
			}
		}

		const handlePickGarments = async () => {
			const remaining =
				getMaxReferenceImages() - state.garments.length - (state.modelImage ? 1 : 0)
			if (remaining <= 0) return
			setState({ error: "" })
			try {
				const images = await pickImageFiles({ multiple: true, maxCount: remaining })
				if (!images?.length) return
				setState({
					garments: [...state.garments, ...images].slice(0, MAX_GARMENTS),
					error: "",
				})
			} catch (error) {
				setState({ error: getErrorMessage(error) || "商品图上传失败，请重试" })
			}
		}

		const handlePickModel = async () => {
			if (state.garments.length + (state.modelImage ? 1 : 0) >= getMaxReferenceImages()) {
				setState({ error: "参考图数量已达当前模型上限" })
				return
			}
			setState({ error: "" })
			try {
				const images = await pickImageFiles({ multiple: false, maxCount: 1 })
				if (!images?.length) return
				setState({ modelImage: images[0], error: "" })
			} catch (error) {
				setState({ error: getErrorMessage(error) || "模特图上传失败，请重试" })
			}
		}

		const handleGenerate = async () => {
			if (!state.garments.length || state.loading) return

			const refImages = [...state.garments, ...(state.modelImage ? [state.modelImage] : [])]
			const referenceImages = refImages.map(getImageReferenceId).filter(Boolean)

			if (!referenceImages.length) {
				setState({ error: "图片缺少可用于生成的资源标识" })
				return
			}
			if (!state.modelId) {
				setState({ error: "请选择 AI 模型" })
				return
			}

			const selectedSize = getSelectedSize()
			if (!selectedSize?.genW || !selectedSize?.genH) {
				setState({ error: "当前模型缺少可用尺寸配置" })
				return
			}
			const width = selectedSize.genW
			const height = selectedSize.genH

			setState({ loading: true, error: "" })

			try {
				await generateAndPlace({
					model_id: state.modelId,
					prompt: buildPrompt(state.garments.length, state.style, state.extra),
					size: `${width}x${height}`,
					resolution: state.scale || undefined,
					reference_images: referenceImages,
					image_generation_config: Object.keys(state.imageGenerationConfig).length
						? state.imageGenerationConfig
						: undefined,
					width,
					height,
					count: state.genCount,
					select: false,
				})
				ctx.ui.toast(t("toast.success", "穿搭图生成成功！"), "success")
				ctx.ui.close?.()
			} catch (error) {
				const message = getErrorMessage(error) || "生成失败，请重试"
				setState({ error: message })
				ctx.ui.toast(message, "error")
			} finally {
				setState({ loading: false })
			}
		}

		const createLayout = () => {
			view.panel = createElement("div", "mc-tryon")
			view.content = createElement("div", "mc-tryon-content")
			view.footer = createElement("div", "mc-tryon-footer")
			view.slots = {
				garments: createElement("div", "mc-tryon-slot"),
				model: createElement("div", "mc-tryon-slot"),
				extra: createElement("div", "mc-tryon-slot"),
				style: createElement("div", "mc-tryon-slot"),
				modelSelect: createElement("div", "mc-tryon-slot"),
				ratio: createElement("div", "mc-tryon-slot"),
				scale: createElement("div", "mc-tryon-slot"),
				count: createElement("div", "mc-tryon-slot"),
				imageSettings: createElement("div", "mc-tryon-slot"),
				error: createElement("div", "mc-tryon-slot"),
				footer: createElement("div", "mc-tryon-slot"),
			}
			view.content.append(
				view.slots.garments,
				view.slots.model,
				view.slots.extra,
				view.slots.style,
				view.slots.modelSelect,
				view.slots.ratio,
				view.slots.scale,
				view.slots.imageSettings,
				view.slots.count,
				view.slots.error,
			)
			view.footer.append(view.slots.footer)
			view.panel.append(view.content, view.footer)
			root.replaceChildren(view.panel)
		}

		const updateSlot = (name, node) => {
			view.slots[name].replaceChildren(node)
		}

		const updateFooter = () => {
			const generateButton = createElement(
				"button",
				"mc-tryon-generate",
				state.loading
					? t("button.generating", "生成中…")
					: `✨ ${t("button.generate", "一键生成穿搭图")}`,
			)
			generateButton.type = "button"
			generateButton.disabled = state.loading || !state.garments.length
			generateButton.addEventListener("click", () => {
				void handleGenerate()
			})
			const fragment = document.createDocumentFragment()
			if (!state.loading && !state.garments.length) {
				fragment.append(
					createElement(
						"p",
						"mc-tryon-empty",
						t("empty.garments", "请先上传至少 1 张商品图"),
					),
				)
			}
			fragment.append(generateButton)
			view.slots.footer.replaceChildren(fragment)
		}

		const updateError = () => {
			if (state.error) {
				view.slots.error.replaceChildren(
					createElement("div", "mc-tryon-error", state.error),
				)
				return
			}
			view.slots.error.replaceChildren()
		}

		const updateView = (patch = null) => {
			if (!view.panel) return
			const keys = patch ? new Set(Object.keys(patch)) : null
			const shouldUpdate = (...deps) => !keys || deps.some((key) => keys.has(key))

			if (!keys) {
				updateGarmentsSection()
			} else {
				if (keys.has("garments")) {
					updateGarmentItems()
				}
				if (shouldUpdate("garments", "modelImage", "modelId", "modelOptions")) {
					updateGarmentsMeta()
				}
			}
			if (shouldUpdate("modelImage")) {
				updateModelSection()
			}
			if (!keys) {
				updateSlot("extra", createExtraSection())
			}
			if (shouldUpdate("style")) {
				updateSlot("style", createStyleSection())
			}
			if (shouldUpdate("modelOptions", "modelId")) {
				updateSlot("modelSelect", createModelSelectSection())
			}
			if (shouldUpdate("modelOptions", "modelId", "ratioKey", "scale")) {
				updateSlot("ratio", createRatioSection())
			}
			if (shouldUpdate("modelOptions", "modelId", "scale")) {
				updateSlot("scale", createScaleSection())
			}
			if (shouldUpdate("genCount")) {
				updateSlot("count", createCountSection())
			}
			if (shouldUpdate("modelOptions", "modelId", "imageGenerationConfig")) {
				updateSlot("imageSettings", createImageSettingsSection())
			}
			if (shouldUpdate("error")) {
				updateError()
			}
			if (shouldUpdate("loading", "garments")) {
				updateFooter()
			}
			updateHeight()
		}

		const ensureGarmentsView = () => {
			if (view.garments) return view.garments
			const section = createElement("section", "mc-tryon-section")
			const header = createElement("div", "mc-tryon-section-header")
			const suffix = createElement("span", "mc-tryon-section-suffix")
			header.append(
				createElement("label", "mc-tryon-section-title", t("section.garments", "商品图")),
			)
			header.append(suffix)

			const grid = createElement("div", "mc-tryon-garment-grid")
			const help = createElement("p", "mc-tryon-help", t("upload.garmentTip", ""))
			section.append(header, grid, help)
			view.slots.garments.replaceChildren(section)
			view.garments = {
				section,
				suffix,
				grid,
				items: new Map(),
				addButton: null,
			}
			return view.garments
		}

		const createGarmentItem = (garment) => {
			const item = createElement("div", "mc-tryon-garment")
			const image = createElement("img", "mc-tryon-garment-image")
			image.alt = t("section.garments", "商品图")
			item.append(createLoadingPlaceholder(), image)
			bindPreviewImage(item, image, getImageUrl(garment))

			const removeButton = createElement("button", "mc-tryon-remove", "×")
			removeButton.type = "button"
			removeButton.addEventListener("click", () => {
				setState({
					garments: state.garments.filter((item) => item !== garment),
				})
			})

			item.append(removeButton)
			return item
		}

		const updateGarmentsSection = () => {
			updateGarmentItems()
			updateGarmentsMeta()
		}

		const updateGarmentItems = () => {
			const garmentsView = ensureGarmentsView()
			const activeGarments = new Set(state.garments)
			for (const [garment, item] of garmentsView.items) {
				if (!activeGarments.has(garment)) {
					item.remove()
					garmentsView.items.delete(garment)
				}
			}

			let referenceNode = garmentsView.grid.firstChild
			state.garments.forEach((garment) => {
				let item = garmentsView.items.get(garment)
				if (!item) {
					item = createGarmentItem(garment)
					garmentsView.items.set(garment, item)
				}
				if (item !== referenceNode) {
					garmentsView.grid.insertBefore(item, referenceNode)
				}
				referenceNode = item.nextSibling
			})
		}

		const updateGarmentsMeta = () => {
			const garmentsView = ensureGarmentsView()
			const maxGarments = Math.max(0, getMaxReferenceImages() - (state.modelImage ? 1 : 0))
			garmentsView.suffix.textContent = `${state.garments.length}/${Math.max(1, maxGarments)}`
			const canAdd = state.garments.length < maxGarments
			if (canAdd && !garmentsView.addButton) {
				garmentsView.addButton = createElement("button", "mc-tryon-add", "+")
				garmentsView.addButton.type = "button"
				garmentsView.addButton.addEventListener("click", () => {
					void handlePickGarments()
				})
			}
			if (canAdd && garmentsView.addButton.parentNode !== garmentsView.grid) {
				garmentsView.grid.append(garmentsView.addButton)
			} else if (!canAdd && garmentsView.addButton) {
				garmentsView.addButton.remove()
			}
		}

		const ensureModelView = () => {
			if (view.model) return view.model
			const section = createSection(t("section.model", "模特底图"), t("optional", "可选"))
			const body = createElement("div", "mc-tryon-model-body")
			section.append(body)
			view.slots.model.replaceChildren(section)
			view.model = {
				body,
				currentImage: null,
				preview: null,
				image: null,
				uploadButton: null,
			}
			return view.model
		}

		const createModelPreview = () => {
			const preview = createElement("div", "mc-tryon-model-preview")
			const image = createElement("img", "mc-tryon-model-image")
			image.alt = t("section.model", "模特底图")
			preview.append(createLoadingPlaceholder(), image)
			const removeButton = createElement(
				"button",
				"mc-tryon-remove mc-tryon-model-remove",
				"×",
			)
			removeButton.type = "button"
			removeButton.addEventListener("click", () => {
				setState({ modelImage: null })
			})
			preview.append(removeButton)
			return { preview, image }
		}

		const createModelUploadButton = () => {
			const uploadButton = createElement(
				"button",
				"mc-tryon-model-upload",
				`📤 ${t("upload.model", "点击上传（不上传则 AI 自动生成模特）")}`,
			)
			uploadButton.type = "button"
			uploadButton.addEventListener("click", () => {
				void handlePickModel()
			})
			return uploadButton
		}

		const updateModelSection = () => {
			const modelView = ensureModelView()
			if (!state.modelImage) {
				modelView.currentImage = null
				if (!modelView.uploadButton) {
					modelView.uploadButton = createModelUploadButton()
				}
				if (modelView.uploadButton.parentNode !== modelView.body) {
					modelView.body.replaceChildren(modelView.uploadButton)
				}
				return
			}

			if (!modelView.preview || !modelView.image) {
				const preview = createModelPreview()
				modelView.preview = preview.preview
				modelView.image = preview.image
			}
			if (modelView.currentImage !== state.modelImage) {
				bindPreviewImage(modelView.preview, modelView.image, getImageUrl(state.modelImage))
				modelView.currentImage = state.modelImage
			}
			if (modelView.preview.parentNode !== modelView.body) {
				modelView.body.replaceChildren(modelView.preview)
			}
		}

		const createExtraSection = () => {
			const section = createSection(t("section.extra", "额外描述"), t("optional", "可选"))
			const textarea = createElement("textarea", "mc-tryon-textarea")
			textarea.rows = 3
			textarea.value = state.extra
			textarea.placeholder = t("extra.placeholder", "")
			textarea.addEventListener("input", (event) => {
				state.extra = event.target.value
				updateHeight()
			})
			section.append(textarea)
			return section
		}

		const createStyleSection = () => {
			const section = createSection(t("section.style", "风格"))
			const grid = createElement("div", "mc-tryon-style-grid")
			STYLE_OPTIONS.forEach((styleOption) => {
				const button = createElement(
					"button",
					`mc-tryon-option${state.style === styleOption.value ? " is-active" : ""}`,
					styleOption.label,
				)
				button.type = "button"
				button.title = styleOption.desc
				button.addEventListener("click", () => {
					setState({ style: styleOption.value })
				})
				grid.append(button)
			})
			section.append(grid)
			return section
		}

		const createModelSelectSection = () => {
			if (!state.modelOptions.length) return document.createDocumentFragment()
			const section = createSection(t("section.modelSelect", "AI 模型"))
			const select = createElement("select", "mc-tryon-select")
			state.modelOptions.forEach((model) => {
				const option = createElement("option")
				option.value = model.model_id
				option.textContent = model.model_name ?? model.model_id
				option.selected = model.model_id === state.modelId
				select.append(option)
			})
			select.addEventListener("change", (event) => {
				const modelId = event.target.value
				const model = state.modelOptions.find((item) => item.model_id === modelId)
				setState({
					modelId,
					...applyModelDefaults(model),
				})
			})
			section.append(select)
			return section
		}

		const createRatioSection = () => {
			if (!getVisibleSizes().length) return document.createDocumentFragment()
			const section = createSection(
				t("section.ratio", "宽高比"),
				getSelectedSize()?.value ?? "",
			)
			const list = createElement("div", "mc-tryon-wrap")
			getVisibleSizes().forEach((ratio) => {
				const button = createElement(
					"button",
					`mc-tryon-option${state.ratioKey === ratio.label ? " is-active" : ""}`,
					ratio.label,
				)
				button.type = "button"
				button.title = ratio.value
				button.addEventListener("click", () => {
					setState({ ratioKey: ratio.label })
				})
				list.append(button)
			})
			section.append(list)
			return section
		}

		const createScaleSection = () => {
			const resolutionOptions = getResolutionOptions()
			if (resolutionOptions.length <= 1) return document.createDocumentFragment()
			const section = createSection(t("section.resolution", "分辨率"))
			const list = createElement("div", "mc-tryon-wrap")
			resolutionOptions.forEach((scale) => {
				const button = createElement(
					"button",
					`mc-tryon-option${state.scale === scale ? " is-active" : ""}`,
					scale,
				)
				button.type = "button"
				button.addEventListener("click", () => {
					const sizes = getModelSizes().filter((size) => size.scale === scale)
					setState({ scale, ratioKey: sizes[0]?.label ?? state.ratioKey })
				})
				list.append(button)
			})
			section.append(list)
			return section
		}

		const createCountSection = () => {
			const section = createSection(t("section.count", "生成数量"))
			const list = createElement("div", "mc-tryon-wrap")
			GENERATION_COUNTS.forEach((count) => {
				const button = createElement(
					"button",
					`mc-tryon-option${state.genCount === count ? " is-active" : ""}`,
					String(count),
				)
				button.type = "button"
				button.addEventListener("click", () => {
					setState({ genCount: count })
				})
				list.append(button)
			})
			section.append(list)
			return section
		}

		const createImageSettingsSection = () => {
			const settings = getImageSettings()
			if (!settings.length) return document.createDocumentFragment()
			const fragment = document.createDocumentFragment()
			settings.forEach((setting) => {
				const section = createSection(setting.label)
				if (setting.description) {
					section
						.querySelector(".mc-tryon-section-header")
						?.append(
							createElement("span", "mc-tryon-section-suffix", setting.description),
						)
				}
				const list = createElement("div", "mc-tryon-wrap")
				setting.options.forEach((option) => {
					const button = createElement(
						"button",
						`mc-tryon-option${
							state.imageGenerationConfig[setting.requestKey] === option.value
								? " is-active"
								: ""
						}`,
						option.label,
					)
					button.type = "button"
					button.addEventListener("click", () => {
						setState({
							imageGenerationConfig: {
								...state.imageGenerationConfig,
								[setting.requestKey]: option.value,
							},
						})
					})
					list.append(button)
				})
				section.append(list)
				fragment.append(section)
			})
			return fragment
		}

		createLayout()
		updateView()
		void loadImageModels()

		return function cleanup() {
			root.replaceChildren()
		}
	},
})

function buildPrompt(count, style, extra) {
	const refs = Array.from({ length: count }, (_, index) => `reference image ${index + 1}`).join(
		", ",
	)
	const extraClause = extra?.trim() ? ` ${extra.trim()}.` : ""

	return (
		`A fashion model wearing ALL ${count} clothing/accessory item${count > 1 ? "s" : ""} simultaneously: ${refs}. ` +
		`CRITICAL: Every single one of the ${count} reference item${count > 1 ? "s" : ""} must be clearly visible on the model -- do not omit, merge or substitute any item. ` +
		"Layer garments naturally: if any item is a jacket, coat or outer layer it must be worn visibly on top of inner clothing; if any item is a hat or cap it must be worn on the head; if any item is footwear it must be on the feet; if any item is a bag it must be carried by hand or on the shoulder. " +
		`Each item must exactly match its reference image in color, pattern, texture and design. Full body view showing all items clearly.${extraClause} ${STYLE_SUFFIX[style]}`
	)
}

function createSection(title, suffix) {
	const section = createElement("section", "mc-tryon-section")
	const header = createElement("div", "mc-tryon-section-header")
	header.append(createElement("label", "mc-tryon-section-title", title))
	if (suffix) header.append(createElement("span", "mc-tryon-section-suffix", suffix))
	section.append(header)
	return section
}

function createElement(tagName, className, textContent) {
	const element = document.createElement(tagName)
	if (className) element.className = className
	if (textContent !== undefined) element.textContent = textContent
	return element
}

function createLoadingPlaceholder() {
	const loading = createElement("div", "mc-tryon-loading")
	loading.setAttribute("aria-hidden", "true")
	loading.append(createElement("span", "mc-tryon-loading-spinner"))
	return loading
}

function bindPreviewImage(container, image, url) {
	const nextUrl = url || ""
	if (!nextUrl) {
		container.classList.remove("is-loading")
		image.removeAttribute("src")
		return
	}

	container.classList.add("is-loading")
	image.onload = () => {
		container.classList.remove("is-loading")
	}
	image.onerror = () => {
		container.classList.remove("is-loading")
	}
	image.src = nextUrl
	if (image.complete) {
		container.classList.remove("is-loading")
	}
}

function getImageReferenceId(image) {
	return image.path ?? image.uploadId ?? image.id ?? image.fileId ?? image.resourceId ?? image.url
}

function getImageUrl(image) {
	return image.url ?? image.src ?? image.previewUrl ?? ""
}

function getErrorMessage(error) {
	if (error instanceof Error) return error.message
	return String(error ?? "")
}
