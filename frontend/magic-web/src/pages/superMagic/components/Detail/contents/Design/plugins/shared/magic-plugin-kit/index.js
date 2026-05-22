;(function initMagicPluginKit(global) {
	if (global.MagicPluginKit) return

	const IMAGE_GENERATION_CONFIG_PREFIX = "image_generation_config."

	function createElement(tagName, className, textContent) {
		const element = document.createElement(tagName)
		if (className) element.className = className
		if (textContent !== undefined) element.textContent = textContent
		return element
	}

	/** 创建加载占位 */
	function createLoadingPlaceholder() {
		const loading = createElement("div", "mpk-loading")
		loading.setAttribute("aria-hidden", "true")
		loading.append(createElement("span", "mpk-loading-spinner"))
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
		return (
			image?.path ??
			image?.uploadId ??
			image?.id ??
			image?.fileId ??
			image?.resourceId ??
			image?.url
		)
	}

	function getImageUrl(image) {
		return image?.url ?? image?.src ?? image?.previewUrl ?? ""
	}

	function getErrorMessage(error) {
		if (error instanceof Error) return error.message
		return String(error ?? "")
	}

	function resolveValue(value, context) {
		return typeof value === "function" ? value(context) : value
	}

	function normalizeImageSettings(model) {
		return (model?.image_size_config?.image_settings ?? [])
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

	/** 挂载插件 */
	function mount(ctx, root, config) {
		const t = (key, fallback) => ctx.i18n?.t?.(key, fallback) ?? fallback ?? key
		const state = {
			/** 模型列表 */
			modelOptions: [],
			/** 模型 id */
			modelId: "",
			/** 比例 key */
			ratioKey: "",
			/** 分辨率 */
			scale: "",
			/** 图片生成配置 */
			imageGenerationConfig: {},
			/** 加载状态 */
			loading: false,
			/** 错误信息 */
			error: "",
			/** 业务状态 */
			...(config.initialState ?? {}),
		}
		/** 视图相关 */
		const view = {
			/** 面板 */
			panel: null,
			/** 内容 */
			content: null,
			/** 底部 */
			footer: null,
			/** 插槽 */
			slots: {},
			/** 区块视图映射 */
			sectionViews: {},
		}

		/** 更新高度 */
		function updateHeight() {
			requestAnimationFrame(() => {
				ctx.ui?.setHeight?.(root.scrollHeight)
			})
		}

		function getSelectedModel(currentState = state) {
			return currentState.modelOptions.find((item) => item.model_id === currentState.modelId)
		}

		function getModelSizes(currentState = state) {
			return getSelectedModel(currentState)?.image_size_config?.sizes ?? []
		}

		function buildDefaultImageGenerationConfig(model) {
			return normalizeImageSettings(model).reduce((configMap, setting) => {
				const defaultOption =
					setting.options.find((option) => option.value === setting.default) ??
					setting.options[0]
				if (setting.requestKey && defaultOption?.value) {
					configMap[setting.requestKey] = defaultOption.value
				}
				return configMap
			}, {})
		}

		/** 获取默认分辨率 */
		function getDefaultResolution(model) {
			const sizes = model?.image_size_config?.sizes ?? []
			const options = Array.from(new Set(sizes.map((size) => size.scale).filter(Boolean)))
			if (!options.length) return ""
			const defaultScale = model?.image_size_config?.default_scale
			return defaultScale && options.includes(defaultScale) ? defaultScale : options[0]
		}

		/** 获取分辨率选项 */
		function getResolutionOptions(currentState = state) {
			return Array.from(
				new Set(
					getModelSizes(currentState)
						.map((size) => size.scale)
						.filter(Boolean),
				),
			)
		}

		function getVisibleSizes(currentState = state) {
			const sizes = getModelSizes(currentState)
			if (!currentState.scale) return sizes
			const matched = sizes.filter((size) => size.scale === currentState.scale)
			return matched.length ? matched : sizes
		}

		function getSelectedSize(currentState = state) {
			const sizes = getVisibleSizes(currentState)
			const selectedRatio =
				sizes.find((item) => item.label === currentState.ratioKey) ?? sizes[0]
			if (!selectedRatio?.value) return null
			const [genW, genH] = selectedRatio.value.split("x").map(Number)
			return {
				...selectedRatio,
				genW: Number.isFinite(genW) ? genW : 0,
				genH: Number.isFinite(genH) ? genH : 0,
			}
		}

		/** 应用模型默认值 */
		function applyModelDefaults(model) {
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

		/** 选择图片 */
		async function pickImageFiles(options) {
			if (ctx.assets?.pickFiles) {
				return ctx.assets.pickFiles({ ...options, type: "image" })
			}
			throw new Error("ctx.assets.pickFiles is not connected yet.")
		}

		/** 生成 */
		async function handleGenerate() {
			if (state.loading) return
			const validationError = config.generate?.validate?.({ state, helpers, t })
			if (validationError) {
				setState({ error: validationError })
				return
			}

			setState({ loading: true, error: "" })

			try {
				if (!ctx.ai?.generateAndPlace) {
					throw new Error("ctx.ai.generateAndPlace is not connected yet.")
				}
				const request = await config.generate.buildRequest({ state, helpers, t })
				const result = await ctx.ai.generateAndPlace(request)
				if (config.generate.onSuccess) {
					config.generate.onSuccess({ ctx, state, result, helpers, t })
				} else {
					ctx.ui?.toast?.(
						config.generate.successMessage ?? t("toast.success", "生成成功！"),
						"success",
					)
					if (config.generate.closeOnSuccess !== false) {
						ctx.ui?.close?.()
					}
				}
			} catch (error) {
				const message =
					getErrorMessage(error) ||
					config.generate.errorMessage ||
					t("error.generate", "生成失败，请重试")
				setState({ error: message })
				ctx.ui?.toast?.(message, "error")
			} finally {
				setState({ loading: false })
			}
		}

		/** 加载模型 */
		async function loadImageModels() {
			if (config.modelConfig?.autoLoad === false) return
			if (!ctx.ai?.getImageModels) return
			try {
				const models = await ctx.ai.getImageModels()
				if (!models?.length) {
					setState({
						error:
							config.modelConfig?.noModelsMessage ??
							t("error.noModels", "暂无可用 AI 模型"),
					})
					return
				}
				const firstModel = models[0]
				const nextModelId =
					state.modelId || config.modelConfig?.defaultModelId || firstModel.model_id
				const selectedModel =
					models.find((model) => model.model_id === nextModelId) ?? firstModel
				setState({
					modelOptions: models,
					modelId: nextModelId,
					...applyModelDefaults(selectedModel),
				})
			} catch (error) {
				if (config.modelConfig?.showLoadErrors) {
					setState({
						error:
							getErrorMessage(error) ||
							config.modelConfig?.loadErrorMessage ||
							t("error.noModels", "暂无可用 AI 模型"),
					})
				}
			}
		}

		/** 创建区块 */
		function createSection(title, suffix) {
			const section = createElement("section", "mpk-section")
			const header = createElement("div", "mpk-section-header")
			header.append(createElement("label", "mpk-section-title", title))
			if (suffix) header.append(createElement("span", "mpk-section-suffix", suffix))
			section.append(header)
			return section
		}

		/** 创建图片卡片 */
		function createImageCard(asset, altText, onRemove) {
			const item = createElement("div", "mpk-image-card")
			const image = createElement("img", "mpk-image-card-image")
			image.alt = altText
			item.append(createLoadingPlaceholder(), image)
			bindPreviewImage(item, image, getImageUrl(asset))

			const removeButton = createElement("button", "mpk-remove-button", "×")
			removeButton.type = "button"
			removeButton.addEventListener("click", onRemove)
			item.append(removeButton)
			return item
		}

		/** 选择图片 */
		async function pickForSection(section, options) {
			const beforePickError = section.beforePick?.({ state, helpers, t })
			if (beforePickError) {
				setState({ error: beforePickError })
				return []
			}

			setState({ error: "" })
			return pickImageFiles(options)
		}

		/** 解析区块依赖 */
		function resolveSectionDeps(section) {
			const deps = new Set(section.deps ?? [])

			if (section.stateKey) deps.add(section.stateKey)

			if (section.kind === "model-select") {
				deps.add("modelOptions")
				deps.add("modelId")
			}

			if (section.kind === "resolution-select") {
				deps.add("modelOptions")
				deps.add("modelId")
				deps.add("scale")
			}

			return deps
		}

		/** 判断是否需要更新区块 */
		function shouldUpdateSection(section, changedKeys) {
			if (!changedKeys) return true
			for (const key of resolveSectionDeps(section)) {
				if (changedKeys.has(key)) return true
			}
			return false
		}

		/** 确保图片网格区块存在 */
		function ensureImageGridView(section) {
			const existingView = view.sectionViews[section.id]
			if (existingView) return existingView

			const sectionNode = createElement("section", "mpk-section")
			const header = createElement("div", "mpk-section-header")
			const title = createElement("label", "mpk-section-title", section.title)
			const suffix = createElement("span", "mpk-section-suffix")
			const grid = createElement(
				"div",
				`mpk-image-grid ${section.gridClassName ?? ""}`.trim(),
			)
			const help = section.help ? createElement("p", "mpk-help", section.help) : null

			header.append(title, suffix)
			sectionNode.append(header, grid)
			if (help) {
				sectionNode.append(help)
			}

			view.slots[section.id].replaceChildren(sectionNode)

			const nextView = {
				sectionNode,
				suffix,
				grid,
				help,
				items: new Map(),
				addButton: null,
			}
			view.sectionViews[section.id] = nextView
			return nextView
		}

		/** 创建图片网格添加按钮 */
		function createImageGridAddButton(section, sectionView) {
			const addButton = createElement("button", "mpk-add-button", section.addLabel ?? "+")
			addButton.type = "button"
			addButton.addEventListener("click", async () => {
				const currentAssets = Array.isArray(state[section.stateKey])
					? state[section.stateKey]
					: []
				const currentMaxCount = Math.max(
					1,
					resolveValue(section.maxCount ?? 1, { state, helpers, t }) ?? 1,
				)
				const remaining = currentMaxCount - currentAssets.length
				if (remaining <= 0) return

				try {
					const images = await pickForSection(section, {
						multiple: true,
						maxCount: remaining,
					})
					if (!images?.length) return
					setState({
						[section.stateKey]: [...currentAssets, ...images].slice(0, currentMaxCount),
						error: "",
					})
				} catch (error) {
					setState({
						error:
							getErrorMessage(error) ||
							section.pickErrorMessage ||
							t("error.pickFiles", "图片上传失败，请重试"),
					})
				}
			})
			sectionView.addButton = addButton
			return addButton
		}

		/** 更新图片网格 */
		function updateImageGridSection(section) {
			const assets = Array.isArray(state[section.stateKey]) ? state[section.stateKey] : []
			const maxCount = Math.max(
				1,
				resolveValue(section.maxCount ?? 1, { state, helpers, t }) ?? 1,
			)
			const sectionView = ensureImageGridView(section)
			const altText = section.alt ?? section.title

			sectionView.suffix.textContent = `${assets.length}/${maxCount}`
			if (sectionView.help) {
				sectionView.help.textContent = section.help ?? ""
			}

			const activeAssets = new Set(assets)
			for (const [asset, item] of sectionView.items) {
				if (!activeAssets.has(asset)) {
					item.remove()
					sectionView.items.delete(asset)
				}
			}

			let referenceNode = sectionView.grid.firstChild
			assets.forEach((asset) => {
				let item = sectionView.items.get(asset)
				if (!item) {
					item = createImageCard(asset, altText, () => {
						const currentAssets = Array.isArray(state[section.stateKey])
							? state[section.stateKey]
							: []
						setState({
							[section.stateKey]: currentAssets.filter((entry) => entry !== asset),
						})
					})
					sectionView.items.set(asset, item)
				}

				if (item !== referenceNode) {
					sectionView.grid.insertBefore(item, referenceNode)
				}
				referenceNode = item.nextSibling
			})

			const canAdd = assets.length < maxCount
			if (canAdd) {
				const addButton =
					sectionView.addButton ?? createImageGridAddButton(section, sectionView)
				if (
					addButton.parentNode !== sectionView.grid ||
					sectionView.grid.lastChild !== addButton
				) {
					sectionView.grid.append(addButton)
				}
			} else if (sectionView.addButton) {
				sectionView.addButton.remove()
			}
		}

		/** 渲染图片网格 */
		function renderImageGrid(section) {
			updateImageGridSection(section)
			return view.sectionViews[section.id]?.sectionNode ?? document.createDocumentFragment()
		}

		/** 渲染图片槽位 */
		function renderImageSlot(section) {
			const asset = state[section.stateKey]
			const sectionNode = createSection(section.title, section.suffix)
			const body = createElement("div", "mpk-image-slot-body")

			if (!asset) {
				const uploadButton = createElement(
					"button",
					"mpk-image-slot-upload",
					section.uploadLabel,
				)
				uploadButton.type = "button"
				uploadButton.addEventListener("click", async () => {
					try {
						const images = await pickForSection(section, {
							multiple: false,
							maxCount: 1,
						})
						if (!images?.length) return
						setState({
							[section.stateKey]: images[0],
							error: "",
						})
					} catch (error) {
						setState({
							error:
								getErrorMessage(error) ||
								section.pickErrorMessage ||
								t("error.pickFiles", "图片上传失败，请重试"),
						})
					}
				})
				body.append(uploadButton)
			} else {
				const preview = createElement("div", "mpk-image-slot-preview")
				const image = createElement("img", "mpk-image-slot-image")
				image.alt = section.alt ?? section.title
				preview.append(createLoadingPlaceholder(), image)
				bindPreviewImage(preview, image, getImageUrl(asset))
				const removeButton = createElement(
					"button",
					"mpk-remove-button mpk-image-slot-remove",
					"×",
				)
				removeButton.type = "button"
				removeButton.addEventListener("click", () => {
					setState({ [section.stateKey]: null })
				})
				preview.append(removeButton)
				body.append(preview)
			}

			sectionNode.append(body)
			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}
			return sectionNode
		}

		/** 渲染选项组 */
		function renderOptionGroup(section) {
			const sectionNode = createSection(section.title, section.suffix)
			const list = createElement(
				"div",
				`mpk-option-group ${section.groupClassName ?? ""}`.trim(),
			)
			const value = state[section.stateKey]
			section.options.forEach((option) => {
				const optionNode = createElement(
					"div",
					`mpk-option-item${section.showDescriptionOnHover && option.description ? " has-tooltip" : ""}`,
				)
				const button = createElement(
					"button",
					`mpk-option${value === option.value ? " is-active" : ""}`,
					option.label,
				)
				button.type = "button"
				button.title = option.description ?? ""
				button.disabled = Boolean(option.disabled)
				button.addEventListener("click", () => {
					if (value === option.value) return
					setState({ [section.stateKey]: option.value })
				})
				optionNode.append(button)
				if (section.showDescriptionOnHover && option.description) {
					const tooltip = createElement("div", "mpk-option-tooltip", option.description)
					tooltip.setAttribute("role", "tooltip")
					optionNode.append(tooltip)
				}
				list.append(optionNode)
			})
			sectionNode.append(list)
			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}
			return sectionNode
		}

		/** 渲染模型选择 */
		function renderModelSelect(section) {
			if (!state.modelOptions.length) return document.createDocumentFragment()
			const sectionNode = createSection(section.title)
			const select = createElement("select", "mpk-select")
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
			sectionNode.append(select)
			return sectionNode
		}

		/** 渲染分辨率选择 */
		function renderResolutionSelect(section) {
			const resolutionOptions = getResolutionOptions()
			if (resolutionOptions.length <= 1 && section.hideWhenSingle !== false) {
				return document.createDocumentFragment()
			}
			const sectionNode = createSection(section.title)
			const list = createElement("div", "mpk-option-group")
			resolutionOptions.forEach((scale) => {
				const button = createElement(
					"button",
					`mpk-option${state.scale === scale ? " is-active" : ""}`,
					scale,
				)
				button.type = "button"
				button.addEventListener("click", () => {
					const sizes = getModelSizes().filter((size) => size.scale === scale)
					setState({
						scale,
						ratioKey: sizes[0]?.label ?? state.ratioKey,
					})
				})
				list.append(button)
			})
			sectionNode.append(list)
			return sectionNode
		}

		/** 渲染区块 */
		function renderSection(section) {
			if (section.when && !section.when({ state, helpers, t })) {
				delete view.sectionViews[section.id]
				return document.createDocumentFragment()
			}
			if (section.kind === "image-grid") return renderImageGrid(section)
			if (section.kind === "image-slot") return renderImageSlot(section)
			if (section.kind === "option-group") return renderOptionGroup(section)
			if (section.kind === "model-select") return renderModelSelect(section)
			if (section.kind === "resolution-select") return renderResolutionSelect(section)
			return document.createDocumentFragment()
		}

		/** 更新区块 */
		function updateSection(section) {
			if (section.when && !section.when({ state, helpers, t })) {
				view.slots[section.id].replaceChildren()
				delete view.sectionViews[section.id]
				return
			}

			if (section.kind === "image-grid") {
				updateImageGridSection(section)
				return
			}

			view.slots[section.id].replaceChildren(renderSection(section))
		}

		/** 创建布局 */
		function createLayout() {
			view.panel = createElement("div", `mpk-panel ${config.panelClassName ?? ""}`.trim())
			view.content = createElement("div", "mpk-content")
			view.footer = createElement("div", "mpk-footer")

			config.sections.forEach((section) => {
				view.slots[section.id] = createElement("div", "mpk-slot")
				view.content.append(view.slots[section.id])
			})

			view.slots.error = createElement("div", "mpk-slot")
			view.slots.footer = createElement("div", "mpk-slot")
			view.content.append(view.slots.error)
			view.footer.append(view.slots.footer)
			view.panel.append(view.content, view.footer)
			root.replaceChildren(view.panel)
		}

		/** 渲染错误 */
		function renderError() {
			if (state.error) {
				view.slots.error.replaceChildren(createElement("div", "mpk-error", state.error))
				return
			}
			view.slots.error.replaceChildren()
		}

		/** 渲染底部 */
		function renderFooter() {
			const fragment = document.createDocumentFragment()
			const idleHint = config.generate?.getIdleHint?.({ state, helpers, t }) ?? ""
			if (idleHint && !state.loading) {
				fragment.append(createElement("p", "mpk-empty", idleHint))
			}

			const label = state.loading ? config.generate.loadingLabel : config.generate.buttonLabel
			const button = createElement("button", "mpk-generate", label)
			button.type = "button"
			button.disabled = Boolean(
				state.loading || config.generate?.isDisabled?.({ state, helpers, t }),
			)
			button.addEventListener("click", () => {
				void handleGenerate()
			})
			fragment.append(button)
			view.slots.footer.replaceChildren(fragment)
		}

		/** 渲染 */
		function updateView(patch = null) {
			const changedKeys = patch ? new Set(Object.keys(patch)) : null

			config.sections.forEach((section) => {
				if (shouldUpdateSection(section, changedKeys)) {
					updateSection(section)
				}
			})

			if (!changedKeys || changedKeys.has("error")) {
				renderError()
			}
			renderFooter()
			updateHeight()
		}

		/** 更新状态 */
		function setState(patch) {
			const hasChanged = Object.keys(patch).some((key) => state[key] !== patch[key])
			if (!hasChanged) return
			Object.assign(state, patch)
			updateView(patch)
		}

		const helpers = {
			t,
			setState,
			getSelectedModel,
			getModelSizes,
			getResolutionOptions,
			getSelectedSize,
			getImageReferenceId,
			getImageUrl,
			getErrorMessage,
			collectReferenceIds(items) {
				return items.map(getImageReferenceId).filter(Boolean)
			},
		}

		createLayout()
		updateView()
		void loadImageModels()

		return function cleanup() {
			root.replaceChildren()
		}
	}

	global.MagicPluginKit = {
		mount,
	}
})(window)
