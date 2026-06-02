;(function initMagicPluginKit(global) {
	if (global.MagicPluginKit) return

	const IMAGE_GENERATION_CONFIG_PREFIX = "image_generation_config."
	const DEFAULT_SIZE_CONTROL_RATIO_OPTIONS = ["1:1", "3:4", "4:5", "9:16", "16:9"]

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

	function parseSizeValue(sizeValue) {
		const [width, height] = String(sizeValue ?? "")
			.split("x")
			.map(Number)
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
			return null
		}
		return { width, height }
	}

	function normalizeRatioOption(option) {
		if (typeof option === "string") {
			return {
				value: option,
				label: option,
			}
		}

		return {
			...option,
			value: option?.value ?? option?.label ?? "",
			label: option?.label ?? String(option?.value ?? ""),
		}
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

	// 计算遮罩的边界框
	function getMaskBoundingBox(canvas) {
		const { width, height } = canvas
		const data = canvas.getContext("2d").getImageData(0, 0, width, height).data
		let minX = width, minY = height, maxX = -1, maxY = -1
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (data[(y * width + x) * 4] > 128) {
					if (x < minX) minX = x
					if (x > maxX) maxX = x
					if (y < minY) minY = y
					if (y > maxY) maxY = y
				}
			}
		}
		return maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null
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
		let helpers = null

		/** 更新高度 */
		function updateHeight() {
			requestAnimationFrame(() => {
				ctx.ui?.setHeight?.(root.scrollHeight)
			})
		}

		function getCallbackContext(currentState = state) {
			return { state: currentState, helpers, t }
		}

		function normalizeTextareaValue(value, maxLength, hasMaxLength) {
			const nextValue = String(value ?? "")
			return hasMaxLength ? nextValue.slice(0, maxLength) : nextValue
		}

		function setTextareaCountText(counter, value, maxLength, hasMaxLength) {
			if (!counter || !hasMaxLength) return
			counter.textContent = `${value.length}/${maxLength}`
		}

		function getSelectedModel(currentState = state) {
			return currentState.modelOptions.find((item) => item.model_id === currentState.modelId)
		}

		function getModelSizes(currentState = state) {
			return getSelectedModel(currentState)?.image_size_config?.sizes ?? []
		}

		/** 构建默认图片生成配置 */
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
			const parsedSize = parseSizeValue(selectedRatio.value)
			if (!parsedSize) return null
			return {
				...selectedRatio,
				genW: parsedSize.width,
				genH: parsedSize.height,
			}
		}

		function getSectionOptions(section, currentState = state) {
			const options = resolveValue(section.options ?? [], getCallbackContext(currentState))
			return Array.isArray(options) ? options : []
		}

		function getValidatedOptionValue(section, options, currentState = state) {
			const value = section.stateKey ? currentState[section.stateKey] : undefined
			if (options.some((option) => option.value === value)) return value
			return options[0]?.value
		}

		/** 应用模型默认值 */
		function applyModelDefaults(model) {
			const targetResolution = getDefaultResolution(model)
			const sizes = model?.image_size_config?.sizes ?? []
			const sizesForResolution = targetResolution
				? sizes.filter((size) => size.scale === targetResolution)
				: sizes
			const targetSize = sizesForResolution[0] ?? sizes[0]
			const defaults = {
				ratioKey: targetSize?.label ?? "",
				scale: targetResolution,
				imageGenerationConfig: buildDefaultImageGenerationConfig(model),
			}
			return config.modelConfig?.mapModelDefaults?.(model, defaults, state) ?? defaults
		}

		/** 获取尺寸控制比例选项 */
		function getSizeControlRatioOptions(section, currentState = state) {
			const explicitOptions = resolveValue(
				section.ratioOptions,
				getCallbackContext(currentState),
			)
			let options = []

			if (Array.isArray(explicitOptions) && explicitOptions.length) {
				options = explicitOptions.map(normalizeRatioOption).filter((option) => option.value)
			} else {
				const seenRatios = new Set()
				options = getModelSizes(currentState)
					.map((size) => {
						if (!size.label || seenRatios.has(size.label)) return null
						seenRatios.add(size.label)
						const parsedSize = parseSizeValue(size.value)
						return {
							value: size.label,
							label: size.label,
							width: parsedSize?.width,
							height: parsedSize?.height,
						}
					})
					.filter(Boolean)

				if (!options.length) {
					options = DEFAULT_SIZE_CONTROL_RATIO_OPTIONS.map((ratio) => ({
						value: ratio,
						label: ratio,
					}))
				}
			}

			return options
		}

		/** 获取尺寸控制状态 */
		function getSizeControlState(section, currentState = state) {
			const ratioStateKey = section.ratioStateKey
			const ratioOptions = getSizeControlRatioOptions(section, currentState)
			const rawRatioValue = currentState[ratioStateKey]
			const ratioValue = ratioOptions.some((option) => option.value === rawRatioValue)
				? rawRatioValue
				: (ratioOptions[0]?.value ?? "")

			return {
				ratioOptions,
				ratioValue,
			}
		}

		/** 构建尺寸控制补丁 */
		function buildSizeControlPatch(section, partialPatch, currentState = state) {
			const ratioStateKey = section.ratioStateKey
			const current = getSizeControlState(section, currentState)
			const nextRatioValue = partialPatch[ratioStateKey] ?? current.ratioValue

			return {
				[ratioStateKey]: nextRatioValue,
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
				const result = config.generate.execute
					? await config.generate.execute({
							ctx,
							state,
							helpers,
							t,
							generateAndPlace: (request) => ctx.ai.generateAndPlace(request),
						})
					: await ctx.ai.generateAndPlace(
							await config.generate.buildRequest({ state, helpers, t }),
						)
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

			if (section.kind === "size-control") {
				deps.add("modelOptions")
				deps.add("modelId")
				deps.add(section.ratioStateKey)
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

		/** 渲染遮罩涂抹区块 */
		function renderMaskPainter(section) {
			const sourceAsset = state[section.sourceStateKey]
			const sectionNode = createSection(section.title, section.suffix)

			if (!sourceAsset) {
				sectionNode.append(
					createElement(
						"p",
						"mpk-help",
						section.noSourceHint || t("maskPainter.noSource", "请先上传待修复图"),
					),
				)
				view.sectionViews[section.id] = null
				return sectionNode
			}

			const sourceUrl = getImageUrl(sourceAsset)
			// maskCanvas 用于记录涂抹结果，displayCanvas 用于显示合成后的预览，二者尺寸与源图一致
			const maskCanvas = document.createElement("canvas")
			const displayCanvas = document.createElement("canvas")
			displayCanvas.className = "mpk-mask-canvas"
			let painting = false
			let uploadTimer = null
			let imgLoaded = false
			let cursorX = -1
			let cursorY = -1
			// 笔刷大小
			const brushSize = section.brushSize ?? 28

			const img = new Image()
			// cropImg 通过 host 代理 fetch 得到 blob URL，避免 null-origin iframe tainted canvas 问题
			const cropImg = new Image()
			let cropImgObjUrl = null
			let cropImgLoaded = false
			if (ctx.assets?.fetchBlob && sourceUrl) {
				ctx.assets.fetchBlob(sourceUrl)
					.then((blob) => {
						cropImgObjUrl = URL.createObjectURL(blob)
						cropImg.onload = () => { cropImgLoaded = true; URL.revokeObjectURL(cropImgObjUrl) }
						cropImg.onerror = () => { URL.revokeObjectURL(cropImgObjUrl) }
						cropImg.src = cropImgObjUrl
					})
					.catch(() => {}) // CORS/network fail, crop will be skipped
			}

			// 刷新显示（先显示原图，再叠加红色半透明的遮罩，最后绘制笔刷预览）
			function redrawDisplay() {
				if (!imgLoaded) return
				// 画源图
				const dc = displayCanvas.getContext("2d")
				dc.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
				dc.drawImage(img, 0, 0)

				// 把 maskCanvas 的白色区域转成红色半透明叠加
				const mc = maskCanvas.getContext("2d")
				const md = mc.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
				const ov = document.createElement("canvas")
				ov.width = maskCanvas.width
				ov.height = maskCanvas.height
				const oc = ov.getContext("2d")
				const od = oc.createImageData(maskCanvas.width, maskCanvas.height)
				for (let i = 0; i < md.data.length; i += 4) {
					if (md.data[i] > 128) {
						od.data[i] = 239
						od.data[i + 1] = 68
						od.data[i + 2] = 68
						od.data[i + 3] = 155
					}
				}
				oc.putImageData(od, 0, 0)
				// 叠加到 displayCanvas 上
				dc.drawImage(ov, 0, 0)
				// 绘制笔刷预览圆圈
				if (cursorX >= 0) {
					dc.save()
					dc.beginPath()
					dc.arc(cursorX, cursorY, brushSize / 2, 0, Math.PI * 2)
					dc.strokeStyle = "rgba(0,0,0,0.6)"
					dc.lineWidth = 3
					dc.stroke()
					dc.beginPath()
					dc.arc(cursorX, cursorY, brushSize / 2, 0, Math.PI * 2)
					dc.strokeStyle = "rgba(255,255,255,0.9)"
					dc.lineWidth = 1.5
					dc.stroke()
					dc.restore()
				}
			}

			img.onload = () => {
				imgLoaded = true
				displayCanvas.width = img.naturalWidth
				displayCanvas.height = img.naturalHeight
				maskCanvas.width = img.naturalWidth
				maskCanvas.height = img.naturalHeight
				const mc = maskCanvas.getContext("2d")
				mc.fillStyle = "#000000"
				mc.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
				redrawDisplay()
			}
			img.onerror = () => {
				imgLoaded = false
			}
			img.src = sourceUrl

			// 把鼠标/触摸事件的屏幕坐标转换成 canvas 的像素坐标
			function getCoords(e) {
				const rect = displayCanvas.getBoundingClientRect()
				// 缩放比
				const sx = displayCanvas.width / rect.width
				const sy = displayCanvas.height / rect.height
				const src = e.touches ? e.touches[0] : e
				return {
					x: (src.clientX - rect.left) * sx,
					y: (src.clientY - rect.top) * sy,
				}
			}

			// 在 maskCanvas 上绘制涂抹结果，并刷新显示
			function doPaint(e) {
				if (!painting || !imgLoaded) return
				const { x, y } = getCoords(e)
				const mc = maskCanvas.getContext("2d")
				mc.fillStyle = "#ffffff"
				mc.beginPath()
				mc.arc(x, y, brushSize / 2, 0, Math.PI * 2)
				mc.fill()
				redrawDisplay()
			}


			function scheduleUpload() {
				clearTimeout(uploadTimer)
				uploadTimer = setTimeout(() => {
					if (cropImgLoaded) {
						const srcForCrop = cropImg
						const bbox = getMaskBoundingBox(maskCanvas)
						if (bbox) {
							const pad = section.cropPadding ?? 40
							const cx = Math.max(0, bbox.x - pad)
							const cy = Math.max(0, bbox.y - pad)
							const cw = Math.min(maskCanvas.width - cx, bbox.w + pad * 2)
							const ch = Math.min(maskCanvas.height - cy, bbox.h + pad * 2)
							const cropCanvas = document.createElement("canvas")
							cropCanvas.width = cw
							cropCanvas.height = ch
							cropCanvas.getContext("2d").drawImage(srcForCrop, cx, cy, cw, ch, 0, 0, cw, ch)
							cropCanvas.toBlob(
								(cropBlob) => {
									if (!cropBlob || !ctx.assets?.uploadBlob) return
									ctx.assets
										.uploadBlob(cropBlob, "crop.png", "image/png")
										.then((asset) => {
											setState({ [section.stateKey]: asset })
										})
										.catch(() => {})
								},
								"image/png",
							)
						} else {
							setState({ [section.stateKey]: null })
						}
					} else {
						setState({ [section.stateKey]: null })
					}
				}, 600)
			}

			displayCanvas.style.cursor = "none"
			displayCanvas.addEventListener("mousedown", (e) => {
				painting = true
				doPaint(e)
			})
			displayCanvas.addEventListener("mousemove", (e) => {
				const { x, y } = getCoords(e)
				cursorX = x
				cursorY = y
				doPaint(e)
				if (!painting) redrawDisplay()
			})
			displayCanvas.addEventListener("mouseup", () => {
				if (!painting) return
				painting = false
				scheduleUpload()
			})
			displayCanvas.addEventListener("mouseleave", () => {
				cursorX = -1
				cursorY = -1
				redrawDisplay()
				if (!painting) return
				painting = false
				scheduleUpload()
			})
			displayCanvas.addEventListener("touchstart", (e) => { e.preventDefault(); painting = true; doPaint(e) }, { passive: false })
			displayCanvas.addEventListener("touchmove", (e) => { e.preventDefault(); doPaint(e) }, { passive: false })
			displayCanvas.addEventListener("touchend", () => { painting = false; scheduleUpload() })

			const wrap = createElement("div", "mpk-mask-painter")
			wrap.append(displayCanvas)

			const controls = createElement("div", "mpk-mask-controls")
			const clearBtn = createElement(
				"button",
				"mpk-mask-clear-btn",
				section.clearLabel || t("maskPainter.clear", "清除标记"),
			)
			clearBtn.type = "button"
			clearBtn.addEventListener("click", () => {
				const mc = maskCanvas.getContext("2d")
				mc.fillStyle = "#000000"
				mc.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
				redrawDisplay()
				clearTimeout(uploadTimer)
				const clearPatch = { [section.stateKey]: null }
				setState(clearPatch)
			})
			controls.append(clearBtn)
			sectionNode.append(wrap, controls)

			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}

			
			view.sectionViews[section.id] = {
				sectionNode,
				maskCanvas,
				displayCanvas,
				lastSourceUrl: sourceUrl,
				cancelUpload: () => clearTimeout(uploadTimer),
			}
			return sectionNode
		}

		function updateMaskPainterSection(section) {
			const sourceAsset = state[section.sourceStateKey]
			const sourceUrl = sourceAsset ? getImageUrl(sourceAsset) : null
			const existing = view.sectionViews[section.id]
			if (existing?.lastSourceUrl !== sourceUrl) {
				if (sourceUrl !== existing?.lastSourceUrl && existing) {
					// source changed, clear pending upload and derived state
					existing.cancelUpload?.()
					const resetPatch = { [section.stateKey]: null }
					setState(resetPatch)
				}
				view.slots[section.id].replaceChildren(renderMaskPainter(section))
			}
		}

		function renderTextarea(section) {
			const value = typeof state[section.stateKey] === "string" ? state[section.stateKey] : ""
			const maxLength = Number(section.maxLength)
			const hasMaxLength = Number.isFinite(maxLength) && maxLength > 0
			const sectionNode = createSection(section.title, section.suffix)
			const textarea = createElement("textarea", "mpk-textarea")
			const count = hasMaxLength
				? createElement("span", "mpk-textarea-count", `${value.length}/${maxLength}`)
				: null
			textarea.rows = Number(section.rows) > 0 ? Number(section.rows) : 5
			textarea.placeholder = section.placeholder ?? ""
			textarea.value = value
			if (hasMaxLength) {
				textarea.maxLength = maxLength
			}
			textarea.addEventListener("input", (event) => {
				const nextValue = normalizeTextareaValue(
					event.target.value,
					maxLength,
					hasMaxLength,
				)
				if (event.target.value !== nextValue) {
					event.target.value = nextValue
				}
				state[section.stateKey] = nextValue
				setTextareaCountText(count, nextValue, maxLength, hasMaxLength)
				updateHeight()
			})
			sectionNode.append(textarea)

			if (section.help || hasMaxLength) {
				const meta = createElement("div", "mpk-textarea-meta")
				if (section.help) {
					meta.append(createElement("p", "mpk-help", section.help))
				}
				if (hasMaxLength) {
					meta.append(count)
				}
				sectionNode.append(meta)
			}

			return sectionNode
		}

		/** 渲染开关 */
		function renderToggle(section) {
			const isChecked = Boolean(state[section.stateKey])
			const sectionNode = createSection(section.title, section.suffix)
			const body = createElement("div", "mpk-toggle-row")
			const checkbox = createElement("input", "mpk-toggle")
			checkbox.type = "checkbox"
			checkbox.checked = isChecked
			checkbox.setAttribute("aria-label", section.title ?? section.stateKey)
			checkbox.addEventListener("change", () => {
				setState({ [section.stateKey]: checkbox.checked })
			})
			body.append(checkbox)
			sectionNode.append(body)
			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}
			view.sectionViews[section.id] = { checkbox }
			return sectionNode
		}

		/** 更新开关（原地更新，保留 CSS 过渡） */
		function updateToggleSection(section) {
			const sectionView = view.sectionViews[section.id]
			if (!sectionView) {
				view.slots[section.id].replaceChildren(renderToggle(section))
				return
			}
			sectionView.checkbox.checked = Boolean(state[section.stateKey])
		}

		/** 渲染尺寸控制 */
		function renderSizeControl(section) {
			const current = getSizeControlState(section)
			const sectionNode = createSection(section.title, section.suffix)
			const body = createElement("div", "mpk-size-control")
			const ratioList = createElement("div", "mpk-option-group mpk-size-control-ratios")

			current.ratioOptions.forEach((option) => {
				const button = createElement(
					"button",
					`mpk-option${current.ratioValue === option.value ? " is-active" : ""}`,
					option.label,
				)
				button.type = "button"
				button.disabled = Boolean(option.disabled)
				button.addEventListener("click", () => {
					if (option.disabled || current.ratioValue === option.value) return
					setState(
						buildSizeControlPatch(section, {
							[section.ratioStateKey]: option.value,
						}),
					)
				})
				ratioList.append(button)
			})

			body.append(ratioList)

			sectionNode.append(body)
			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}
			return sectionNode
		}

		/** 渲染选项组 */
		function renderOptionGroup(section) {
			const options = getSectionOptions(section)
			if (!options.length) return document.createDocumentFragment()
			const isCardVariant = section.variant === "card"
			const descriptionMode =
				section.descriptionMode ?? (section.showDescriptionOnHover ? "tooltip" : "title")
			const sectionNode = createSection(section.title, section.suffix)
			const list = createElement(
				"div",
				`mpk-option-group${isCardVariant ? " is-card" : ""} ${section.groupClassName ?? ""}`.trim(),
			)
			const activeValue = getValidatedOptionValue(section, options)
			options.forEach((option) => {
				const hasTooltip = Boolean(descriptionMode === "tooltip" && option.description)
				const showsInlineDescription = Boolean(
					isCardVariant && descriptionMode === "inline" && option.description,
				)
				const optionNode = createElement(
					"div",
					`mpk-option-item${hasTooltip ? " has-tooltip" : ""}`,
				)
				const button = createElement(
					"button",
					`${isCardVariant ? "mpk-card-tab" : "mpk-option"}${activeValue === option.value ? " is-active" : ""}`,
				)
				button.type = "button"
				button.title =
					hasTooltip || showsInlineDescription ? "" : (option.description ?? "")
				button.disabled = Boolean(option.disabled)
				if (isCardVariant) {
					button.append(createElement("span", "mpk-card-tab-title", option.label))
					if (showsInlineDescription) {
						button.append(
							createElement("span", "mpk-card-tab-description", option.description),
						)
					}
				} else {
					button.textContent = option.label
				}
				button.addEventListener("click", () => {
					if (option.disabled || activeValue === option.value) return
					setState({ [section.stateKey]: option.value })
				})
				optionNode.append(button)
				if (hasTooltip) {
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
			console.log(resolutionOptions)
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
			if (section.kind === "mask-painter") return renderMaskPainter(section)
			if (section.kind === "textarea") return renderTextarea(section)
			if (section.kind === "toggle") return renderToggle(section)
			if (section.kind === "size-control") return renderSizeControl(section)
			if (section.kind === "option-group") return renderOptionGroup(section)
			if (section.kind === "model-select") return renderModelSelect(section)
			if (section.kind === "resolution-select") return renderResolutionSelect(section)
			if (section.kind === "custom") return section.render({ state, setState, helpers, t })
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

			if (section.kind === "toggle") {
				updateToggleSection(section)
				return
			}

			if (section.kind === "mask-painter") {
				updateMaskPainterSection(section)
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

		helpers = {
			t,
			setState,
			getSelectedModel,
			getModelSizes,
			getVisibleSizes,
			getResolutionOptions,
			getSelectedSize,
			getImageReferenceId,
			getImageUrl,
			getErrorMessage,
			parseSizeValue,
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
