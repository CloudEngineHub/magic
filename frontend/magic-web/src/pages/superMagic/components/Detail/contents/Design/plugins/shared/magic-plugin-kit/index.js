;(function initMagicPluginKit(global) {
	if (global.MagicPluginKit) return

	const MAX_TEXT_LENGTH = 2000
	const MAX_TEXT_AREA_ROWS = 3
	const IMAGE_GENERATION_CONFIG_PREFIX = "image_generation_config."
	const DEFAULT_SIZE_CONTROL_RATIO_OPTIONS = ["1:1", "3:4", "4:5", "9:16", "16:9"]
	const DEFAULT_MAX_OUTPUT_IMAGES = 4
	const DEFAULT_PANEL_HEIGHT = 640
	const SHARED_GENERATION_CONFIG_CACHE_VERSION = 1
	const SHARED_GENERATION_CONFIG_KEYS = [
		"modelId",
		"ratioKey",
		"scale",
		"genCount",
		"imageGenerationConfig",
	]

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

	function getImageFileName(image) {
		const explicitName =
			image?.name ??
			image?.fileName ??
			image?.filename ??
			image?.file_name ??
			image?.originalName ??
			image?.original_name
		if (explicitName) return String(explicitName)

		const url = getImageUrl(image)
		if (!url) return ""
		const pathname = String(url).split(/[?#]/)[0] ?? ""
		const fileName = pathname.split("/").filter(Boolean).pop()
		return fileName ? decodeURIComponent(fileName) : ""
	}

	function getFileNameStem(fileName) {
		const baseName = String(fileName ?? "")
			.split(/[\\/]/)
			.pop()
			?.trim()
		if (!baseName) return ""
		return baseName.replace(/\.[^.]+$/, "")
	}

	function sanitizeFileNamePart(value, fallback = "image") {
		const normalized = String(value ?? "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
		return normalized || fallback
	}

	function inferImageMimeType(fileName) {
		const extension = String(fileName ?? "")
			.split(".")
			.pop()
			?.toLowerCase()
		if (extension === "png") return "image/png"
		if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
		if (extension === "webp") return "image/webp"
		if (extension === "gif") return "image/gif"
		if (extension === "bmp") return "image/bmp"
		if (extension === "svg") return "image/svg+xml"
		return "image/*"
	}

	function isImageFile(file) {
		if (!file) return false
		const mimeType = String(file.type ?? "").toLowerCase()
		if (mimeType.startsWith("image/")) return true
		return /^.+\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(String(file.name ?? ""))
	}

	/* 从dataTransfer中获取文件 */
	function getLocalFilesFromDataTransfer(dataTransfer) {
		if (!dataTransfer) return []
		const directFiles = Array.from(dataTransfer.files || []).filter(Boolean)
		if (directFiles.length) return directFiles
		return Array.from(dataTransfer.items || [])
			.filter((item) => item.kind === "file")
			.map((item) => item.getAsFile())
			.filter(Boolean)
	}

	function hasImageFilesInDataTransfer(dataTransfer) {
		if (!dataTransfer) return false
		if (Array.from(dataTransfer.files || []).some(isImageFile)) return true
		if (
			Array.from(dataTransfer.items || []).some(
				(item) =>
					item?.kind === "file" &&
					(typeof item.type !== "string" || !item.type || item.type.startsWith("image/")),
			)
		) {
			return true
		}
		return Array.from(dataTransfer.types || []).includes("Files")
	}

	const CANVAS_ELEMENT_CLIPBOARD_SOURCE = "canvas-design"
	const CANVAS_ELEMENT_CLIPBOARD_VERSION = 1

	/**
	 * 画布复制粘贴：插件运行在 iframe srcDoc，paste event 读不到 V2 bundle。
	 *
	 * 读取：
	 * 1. paste event 中的标准图片 File（外部截图 / copy-as-png 的 image/png）
	 * 2. Host 桥接 readCanvasClipboard（回传 source/version/operation/files，不含 elements）
	 *
	 * 导入：
	 * 1. copy-as-png → Host uploadedAssets，或本地 uploadFile
	 * 2. copy-elements + sourceRef.src → resolveFileAssets，不上传
	 * 3. 其余 → uploadFile
	 */

	function normalizeCanvasClipboardSourceRef(sourceRef) {
		if (!sourceRef || typeof sourceRef !== "object") return undefined
		return {
			src: typeof sourceRef.src === "string" ? sourceRef.src : undefined,
			ossUrl: typeof sourceRef.ossUrl === "string" ? sourceRef.ossUrl : undefined,
			expiresAt: typeof sourceRef.expiresAt === "string" ? sourceRef.expiresAt : undefined,
		}
	}

	/** 校验并规范化单条画布剪贴板文件 metadata。 */
	function normalizeCanvasClipboardFileMetadata(file) {
		if (!file || typeof file !== "object") return null
		const role = file.role
		if (role !== "element-media" && role !== "canvas-export") return null
		if (typeof file.filename !== "string" || !file.filename.trim()) return null
		if (typeof file.mimeType !== "string" || !file.mimeType.trim()) return null
		return {
			id: typeof file.id === "string" ? file.id : "",
			elementId: typeof file.elementId === "string" ? file.elementId : "",
			filename: file.filename,
			mimeType: file.mimeType,
			fileSize: typeof file.fileSize === "number" ? file.fileSize : 0,
			role,
			sourceRef: normalizeCanvasClipboardSourceRef(file.sourceRef),
		}
	}

	/** 校验画布剪贴板 payload 结构（Host 回传 metadata 规范化用）。 */
	function normalizeCanvasClipboardPayload(data) {
		if (!data || typeof data !== "object") return null
		if (data.source !== CANVAS_ELEMENT_CLIPBOARD_SOURCE) return null
		if (data.version !== CANVAS_ELEMENT_CLIPBOARD_VERSION) return null
		const operation = data.operation === "copy-as-png" ? "copy-as-png" : "copy-elements"
		const files = Array.isArray(data.files)
			? data.files.map(normalizeCanvasClipboardFileMetadata).filter(Boolean)
			: []
		if (!files.length && !Array.isArray(data.elements)) return null
		return { operation, files }
	}

	/** 通过 Host 桥接读取 V2 bundle 剪贴板；失败时向上抛出，由 paste 错误处理展示 toast。 */
	async function readCanvasClipboardPayloadFromHost(ctx) {
		if (!ctx.assets?.readCanvasClipboard) return null
		const hostResult = await ctx.assets.readCanvasClipboard()
		const payload = normalizeCanvasClipboardPayload(hostResult?.payload)
		if (!payload && !(hostResult?.uploadedAssets?.length > 0)) {
			return null
		}
		return {
			payload,
			uploadedAssets: Array.isArray(hostResult?.uploadedAssets)
				? hostResult.uploadedAssets
				: [],
		}
	}

	/** Host 剪贴板结果是否包含可导入的图片（空剪贴板时不应 toast / 导入）。 */
	function hasHostImportableContent(hostResult) {
		if (!hostResult) return false
		if (hostResult.uploadedAssets?.length > 0) return true
		const payload = hostResult.payload
		if (!payload) return false
		if (payload.operation === "copy-as-png") {
			return payload.files.length > 0
		}
		return getReusableCanvasClipboardFiles(payload, 1).length > 0
	}

	function isImageClipboardMimeType(mimeType) {
		return String(mimeType ?? "")
			.toLowerCase()
			.startsWith("image/")
	}

	/**
	 * 从 payload 中筛选可复用引用的图片（copy-elements + element-media + sourceRef.src）。
	 * copy-as-png 不在此列，需走 upload 路径。
	 */
	function getReusableCanvasClipboardFiles(payload, maxCount) {
		if (!payload || payload.operation === "copy-as-png") return []
		return payload.files
			.filter(
				(file) =>
					file.role === "element-media" &&
					file.sourceRef?.src &&
					isImageClipboardMimeType(file.mimeType),
			)
			.slice(0, maxCount)
	}

	/** 从 DataTransfer（paste 的 clipboardData / drag 的 dataTransfer）提取标准图片 File。 */
	function getImageFilesFromDataTransfer(dataTransfer) {
		return getLocalFilesFromDataTransfer(dataTransfer).filter(isImageFile)
	}

	/** 合并导入资源并按 referenceId 去重，避免同 path 重复添加。 */
	function mergeUniqueImageAssets(currentAssets, incomingAssets, maxCount) {
		const merged = [...(Array.isArray(currentAssets) ? currentAssets : [])]
		const existingIds = new Set(
			merged.map((asset) => getImageReferenceId(asset)).filter(Boolean),
		)
		for (const asset of incomingAssets) {
			if (!asset) continue
			const referenceId = getImageReferenceId(asset)
			if (referenceId && existingIds.has(referenceId)) continue
			if (referenceId) existingIds.add(referenceId)
			merged.push(asset)
			if (merged.length >= maxCount) break
		}
		return merged
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

	function getMaxOutputImages(model) {
		const maxOutputImages = Number(model?.image_size_config?.max_output_images)
		if (!Number.isFinite(maxOutputImages) || maxOutputImages <= 0) {
			return DEFAULT_MAX_OUTPUT_IMAGES
		}
		return Math.max(1, Math.floor(maxOutputImages))
	}

	function clampGenerationCount(value, model) {
		const parsedValue = Number(value)
		const safeValue = Number.isFinite(parsedValue) ? Math.floor(parsedValue) : 1
		return Math.max(1, Math.min(getMaxOutputImages(model), safeValue))
	}

	function pickSharedGenerationConfig(source = {}) {
		const config = {}
		SHARED_GENERATION_CONFIG_KEYS.forEach((key) => {
			if (key in source) config[key] = source[key]
		})
		return config
	}

	function hasSharedGenerationConfigKey(patch = {}) {
		return SHARED_GENERATION_CONFIG_KEYS.some((key) => key in patch)
	}

	function parseSharedGenerationConfigCache(rawValue) {
		if (!rawValue) return {}
		const cache = JSON.parse(rawValue)
		if (cache?.version !== SHARED_GENERATION_CONFIG_CACHE_VERSION) return {}
		return pickSharedGenerationConfig(cache.data ?? {})
	}

	async function readSharedGenerationConfigCache(ctx) {
		if (!ctx.storage?.shared?.getGenerationConfig) return {}
		let rawValue = null
		try {
			rawValue = await ctx.storage.shared.getGenerationConfig()
		} catch (error) {
			console.warn("[MagicPluginKit] Failed to read shared generation config cache.", error)
			return {}
		}
		try {
			return parseSharedGenerationConfigCache(rawValue)
		} catch (error) {
			console.warn("[MagicPluginKit] Failed to parse shared generation config cache.", error)
			try {
				await ctx.storage.shared.clearGenerationConfig?.()
			} catch (removeError) {
				console.warn(
					"[MagicPluginKit] Failed to remove invalid shared generation config cache.",
					removeError,
				)
			}
			return {}
		}
	}

	function writeSharedGenerationConfigCache(ctx, source = {}) {
		if (!ctx.storage?.shared?.setGenerationConfig) return
		try {
			void ctx.storage.shared
				.setGenerationConfig(
					JSON.stringify({
						version: SHARED_GENERATION_CONFIG_CACHE_VERSION,
						updatedAt: Date.now(),
						data: pickSharedGenerationConfig(source),
					}),
				)
				.catch((error) => {
					console.warn(
						"[MagicPluginKit] Failed to write shared generation config cache.",
						error,
					)
				})
		} catch (error) {
			console.warn("[MagicPluginKit] Failed to write shared generation config cache.", error)
		}
	}

	function buildGenerationCountOptions(model) {
		return Array.from({ length: getMaxOutputImages(model) }, (_, index) => {
			const count = index + 1
			return {
				value: count,
				label: String(count),
			}
		})
	}

	function createPanelStateSeed(initialState = {}) {
		return {
			/** 模型列表 */
			modelOptions: [],
			/** 模型 id */
			modelId: "",
			/** 画布尺寸/比例 key */
			ratioKey: "",
			/** 分辨率 */
			scale: "",
			/** 生成张数 */
			genCount: 1,
			/** 图片生成配置 */
			imageGenerationConfig: {},
			/** 加载状态 */
			loading: false,
			/** 错误信息 */
			error: "",
			/** 业务状态 */
			...(initialState ?? {}),
		}
	}

	function createPanelState(ctx, initialState = {}) {
		const stateSeed = createPanelStateSeed(initialState)
		return ctx?.state?.create ? ctx.state.create(stateSeed) : stateSeed
	}

	function ensurePanelStateDefaults(state, initialState = {}) {
		const stateSeed = createPanelStateSeed(initialState)
		Object.keys(stateSeed).forEach((key) => {
			if (!(key in state)) state[key] = stateSeed[key]
		})
		return state
	}

	// 计算遮罩的边界框
	function getMaskBoundingBox(canvas) {
		const { width, height } = canvas
		const data = canvas.getContext("2d").getImageData(0, 0, width, height).data
		let minX = width,
			minY = height,
			maxX = -1,
			maxY = -1
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

	function createMaskAlphaCanvas(maskCanvas, cropRect) {
		const alphaCanvas = document.createElement("canvas")
		alphaCanvas.width = cropRect.w
		alphaCanvas.height = cropRect.h
		const alphaCtx = alphaCanvas.getContext("2d")
		alphaCtx.drawImage(
			maskCanvas,
			cropRect.x,
			cropRect.y,
			cropRect.w,
			cropRect.h,
			0,
			0,
			cropRect.w,
			cropRect.h,
		)

		// maskCanvas 是黑白 RGB，黑色区域的 alpha 仍是 255，需要转成真正的透明遮罩。
		const imageData = alphaCtx.getImageData(0, 0, cropRect.w, cropRect.h)
		for (let i = 0; i < imageData.data.length; i += 4) {
			const alpha = imageData.data[i]
			imageData.data[i] = 255
			imageData.data[i + 1] = 255
			imageData.data[i + 2] = 255
			imageData.data[i + 3] = alpha
		}
		alphaCtx.putImageData(imageData, 0, 0)
		return alphaCanvas
	}

	function applyMaskToCropCanvas(cropCanvas, maskCanvas, cropRect) {
		const alphaCanvas = createMaskAlphaCanvas(maskCanvas, cropRect)
		const cropCtx = cropCanvas.getContext("2d")
		cropCtx.save()
		cropCtx.globalCompositeOperation = "destination-in"
		cropCtx.drawImage(alphaCanvas, 0, 0)
		cropCtx.restore()
	}

	function canvasToBlob(canvas, mimeType) {
		return new Promise((resolve) => {
			if (!canvas?.toBlob) {
				resolve(null)
				return
			}
			canvas.toBlob((blob) => {
				resolve(blob)
			}, mimeType)
		})
	}

	/** 渲染插件面板并返回 view controller */
	function render(ctx, root, config) {
		const t = (key, fallback) => ctx.i18n?.t?.(key, fallback) ?? fallback ?? key
		const state = config.state
			? ensurePanelStateDefaults(config.state, config.initialState)
			: createPanelState(ctx, config.initialState)
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
		let maskCropUploadSequence = 0
		// 记录插件内所有可接收画布图片拖入的区域，拖拽 move 时按坐标反查。
		const canvasAssetDropTargets = new Map()
		let activeCanvasAssetDropTarget = null
		let activeCanvasAssetDragSessionId = null

		function createMaskCropUploadName(section, sourceAsset) {
			maskCropUploadSequence += 1
			const sourceNameStem = getFileNameStem(getImageFileName(sourceAsset))
			const sourcePrefix = sanitizeFileNamePart(sourceNameStem, "image")
			const cropSuffix = sanitizeFileNamePart(section.cropNameSuffix || "crop", "crop")
			return `${sourcePrefix}-${cropSuffix}-${Date.now()}-${maskCropUploadSequence}.png`
		}

		function getElements() {
			return {
				root,
				panel: view.panel,
				content: view.content,
				footer: view.footer,
				slots: view.slots,
			}
		}

		/** 更新高度 */
		function updateHeight() {
			requestAnimationFrame(() => {
				ctx.ui?.setHeight?.(Math.max(root.scrollHeight, DEFAULT_PANEL_HEIGHT))
			})
		}

		function getCallbackContext(currentState = state) {
			return { state: currentState, setState, helpers, t, elements: getElements() }
		}

		function getDefaultStartMessage() {
			const locale = String(ctx.i18n?.locale ?? navigator.language ?? "").toLowerCase()
			return locale.startsWith("zh") ? "开始生成" : "Generation started"
		}

		function getCanvasImportHintFallback() {
			const locale = String(ctx.i18n?.locale ?? navigator.language ?? "").toLowerCase()
			return locale.startsWith("zh")
				? "支持点击上传、拖入或粘贴图片；画布图片可先复制（⌘C）再点击此处粘贴（⌘V），或按住 （Alt/Option） 批量拖入"
				: "Click to upload, drag, or paste images here. From canvas: copy (⌘C), click here and paste (⌘V), or hold (Alt/Option) to batch drag"
		}

		function normalizeTextareaValue(value, maxLength, hasMaxLength) {
			const nextValue = String(value ?? "")
			return hasMaxLength ? nextValue.slice(0, maxLength) : nextValue
		}

		function setTextareaCountText(counter, value, maxLength, hasMaxLength) {
			if (!counter || !hasMaxLength) return
			counter.textContent = `${value.length} / ${maxLength}`
		}

		function isTextareaAiGenerateEnabled(section) {
			return Boolean(
				section.aiGenerate &&
				(typeof section.aiGenerate.generate === "function" ||
					section.aiGenerate.completeImagePrompt),
			)
		}

		/* 生成 AI 提示词 */
		async function generateTextareaAiValue(aiConfig) {
			const callbackContext = getCallbackContext()
			if (typeof aiConfig.generate === "function") {
				return aiConfig.generate(callbackContext)
			}

			const promptConfig = resolveValue(aiConfig.completeImagePrompt, callbackContext) ?? {}
			if (!ctx.ai?.completeImagePrompt) {
				throw new Error(
					resolveValue(
						promptConfig.unavailableMessage ?? aiConfig.unavailableMessage,
						callbackContext,
					) ?? t("error.aiPromptUnavailable", "AI 提示词补全能力暂不可用"),
				)
			}

			const referenceAssets =
				(await resolveValue(promptConfig.referenceImages, callbackContext)) ?? []
			const referenceImages = helpers.collectReferenceIds(referenceAssets)
			if (!referenceImages.length) {
				throw new Error(
					resolveValue(
						promptConfig.referencesMessage ?? aiConfig.referencesMessage,
						callbackContext,
					) ?? t("error.references", "图片缺少可用于生成的资源标识"),
				)
			}

			const userPrompt = await resolveValue(promptConfig.userPrompt, callbackContext)
			if (!String(userPrompt ?? "").trim()) {
				throw new Error(
					resolveValue(
						promptConfig.userPromptMessage ?? aiConfig.userPromptMessage,
						callbackContext,
					) ?? t("error.aiPromptInvalid", "AI 提示词参数无效"),
				)
			}
			const request = {
				...((await resolveValue(promptConfig.request, callbackContext)) ?? {}),
				user_prompt: userPrompt,
				reference_images: referenceImages,
			}
			const result = await ctx.ai.completeImagePrompt(request)
			const prompt = String(result?.prompt ?? "").trim()
			if (!prompt) {
				throw new Error(
					resolveValue(promptConfig.emptyMessage, callbackContext) ??
						t("error.aiPromptEmpty", "AI 未生成有效提示词，请重试"),
				)
			}
			return prompt
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

		function normalizeImageGenerationConfigForModel(model, currentConfig = {}) {
			const defaultConfig = buildDefaultImageGenerationConfig(model)
			return normalizeImageSettings(model).reduce((configMap, setting) => {
				const currentValue = currentConfig?.[setting.requestKey]
				const hasCurrentValue = setting.options.some(
					(option) => option.value === currentValue,
				)
				configMap[setting.requestKey] = hasCurrentValue
					? currentValue
					: defaultConfig[setting.requestKey]
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
			if (
				section.kind === "option-group" &&
				section.stateKey === "genCount" &&
				section.options === undefined
			) {
				return buildGenerationCountOptions(getSelectedModel(currentState))
			}
			const options = resolveValue(section.options ?? [], getCallbackContext(currentState))
			return Array.isArray(options) ? options : []
		}

		function getValidatedOptionValue(section, options, currentState = state) {
			const value = section.stateKey ? currentState[section.stateKey] : undefined
			if (section.allowDeselect && (value === null || value === undefined || value === "")) {
				return value
			}
			if (options.some((option) => option.value === value)) return value
			return options[0]?.value
		}

		function getSelectedOptionValues(section, options, currentState = state) {
			if (section.multiple !== true) return []
			const value = section.stateKey ? currentState[section.stateKey] : []
			const validValues = new Set(options.map((option) => option.value))
			return Array.isArray(value) ? value.filter((item) => validValues.has(item)) : []
		}

		function getActiveTabsValue(tabsSection, currentState = state) {
			const options = getSectionOptions(tabsSection, currentState)
			return getValidatedOptionValue(tabsSection, options, currentState)
		}

		/** 应用模型默认值 */
		function applyModelDefaults(model) {
			const currentRatioKey = state.ratioKey
			const currentScale = state.scale

			const sizes = model?.image_size_config?.sizes ?? []
			const hasCurrentResolution = currentScale
				? sizes.some((size) => size.scale === currentScale)
				: false
			const matchedSize = currentRatioKey
				? sizes.find(
						(size) =>
							size.label === currentRatioKey &&
							(!currentScale || size.scale === currentScale),
					)
				: null
			const canKeepCurrentSelection = Boolean(
				currentRatioKey && currentScale && hasCurrentResolution && matchedSize,
			)
			const fallbackMatchedSize = currentRatioKey
				? sizes.find((size) => size.label === currentRatioKey)
				: null
			const targetResolution = canKeepCurrentSelection
				? currentScale
				: (fallbackMatchedSize?.scale ?? getDefaultResolution(model))
			const sizesForResolution = targetResolution
				? sizes.filter((size) => size.scale === targetResolution)
				: sizes
			const targetSize = sizesForResolution[0] ?? sizes[0]
			const defaults = {
				ratioKey: canKeepCurrentSelection
					? currentRatioKey
					: (fallbackMatchedSize?.label ?? targetSize?.label ?? ""),
				scale: targetResolution,
				genCount: clampGenerationCount(state.genCount, model),
				imageGenerationConfig: normalizeImageGenerationConfigForModel(
					model,
					state.imageGenerationConfig,
				),
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
			const ratioOptions = getSizeControlRatioOptions(section, currentState)
			const rawRatioValue = currentState.ratioKey
			const ratioValue = ratioOptions.some((option) => option.value === rawRatioValue)
				? rawRatioValue
				: (ratioOptions[0]?.value ?? "")

			return {
				ratioOptions,
				ratioValue,
			}
		}

		/** 选择图片 */
		async function pickImageFiles(options) {
			if (ctx.assets?.pickFiles) {
				return ctx.assets.pickFiles({ ...options, type: "image" })
			}
			throw new Error("ctx.assets.pickFiles is not connected yet.")
		}

		function getSectionImportLimit(section, currentCount) {
			const maxCount = Math.max(
				1,
				resolveValue(section.maxCount ?? 1, { state, helpers, t }) ?? 1,
			)
			return {
				maxCount,
				remaining: Math.max(maxCount - Math.max(0, currentCount || 0), 0),
			}
		}

		function validateSectionAcquire(section) {
			const beforePickError = section.beforePick?.({ state, helpers, t })
			if (beforePickError) {
				setState({ error: beforePickError })
				return beforePickError
			}
			setState({ error: "" })
			return ""
		}

		async function uploadDroppedFiles(files) {
			if (!files.length) return []
			if (!ctx.assets?.uploadFile) {
				throw new Error("ctx.assets.uploadFile is not connected yet.")
			}
			const uploaded = []
			for (const file of files) {
				if (!isImageFile(file)) {
					throw new Error(t("error.pickFiles", "图片上传失败，请重试"))
				}
				const asset = await ctx.assets.uploadFile(
					file,
					file.name || "image.png",
					file.type || inferImageMimeType(file.name),
				)
				if (asset) uploaded.push(asset)
			}
			return uploaded
		}

		/** 将画布剪贴板 metadata 中的 sourceRef.src 解析为 PluginFileAsset，不 upload。 */
		async function resolveCanvasClipboardAssets(metadataList) {
			if (!metadataList.length) return []
			if (!ctx.assets?.resolveFileAssets) {
				throw new Error("ctx.assets.resolveFileAssets is not connected yet.")
			}
			return ctx.assets.resolveFileAssets(
				metadataList.map((file) => ({
					path: file.sourceRef.src,
					fileName: file.filename,
				})),
				{ type: "image" },
			)
		}

		/**
		 * 粘贴导入的统一入口：先读 metadata，再决定 resolve 还是 upload。
		 * 见模块顶部「画布复制粘贴」注释中的读取/导入优先级。
		 */
		async function resolvePastedImageAssets(maxCount, clipboardData, options = {}) {
			if (maxCount <= 0) return []

			let payload = null
			let hostUploadedAssets = []
			let resolveError = null

			// 画布剪贴板粘贴导入
			const hostResult =
				options.hostResult !== undefined
					? options.hostResult
					: await readCanvasClipboardPayloadFromHost(ctx)
			if (hostResult) {
				payload = hostResult.payload
				hostUploadedAssets = hostResult.uploadedAssets
			}

			// copy-as-png（复制为PNG） 场景，Host 已上传，直接返回
			if (hostUploadedAssets.length) {
				return hostUploadedAssets.slice(0, maxCount)
			}

			// copy-elements（复制画布元素） 场景，Host 未上传，需要 resolve
			const metadataList = payload ? getReusableCanvasClipboardFiles(payload, maxCount) : []

			if (metadataList.length) {
				try {
					const resolved = await resolveCanvasClipboardAssets(metadataList)
					if (resolved.length) {
						return resolved.slice(0, maxCount)
					}
				} catch (error) {
					resolveError = error
				}
			}

			// 常规本地文件复制粘贴导入
			const imageFiles = clipboardData ? getImageFilesFromDataTransfer(clipboardData) : []
			if (imageFiles.length) {
				try {
					return await uploadDroppedFiles(imageFiles.slice(0, maxCount))
				} catch (uploadError) {
					throw resolveError || uploadError
				}
			}

			if (resolveError) {
				throw resolveError
			}

			if (metadataList.length) {
				throw new Error(t("error.pasteResolve", "粘贴失败，无法引用画布图片"))
			}

			return []
		}

		/** 获取仍处于草稿或上传中的遮罩区块，已确认完成的不重复上传 */
		function isPendingMaskPainterView(sectionView) {
			// 是否是遮罩涂抹区块
			if (sectionView?.kind !== "mask-painter") return false
			// 非激活 panel 中的区块已从 DOM 移除，不应在生成前提交
			if (sectionView.sectionNode && !sectionView.sectionNode.isConnected) return false
			// 是否有未确认的涂抹变化
			const hasPendingMaskChange = sectionView.hasPendingMaskChange?.()
			// 是否有正在进行的提交
			const hasCommitInFlight = Boolean(sectionView.getCommitPromise?.())
			return hasPendingMaskChange || hasCommitInFlight
		}

		function getPendingMaskPainterViews() {
			return Object.values(view.sectionViews).filter(isPendingMaskPainterView)
		}

		function hasPendingMask(sectionId) {
			if (!sectionId) return getPendingMaskPainterViews().length > 0
			return isPendingMaskPainterView(view.sectionViews[sectionId])
		}

		/** 生成 */
		async function handleGenerate() {
			if (state.loading) return
			const pendingMaskPainters = getPendingMaskPainterViews()
			if (!pendingMaskPainters.length) {
				const validationError = config.generate?.validate?.({ state, helpers, t })
				if (validationError) {
					setState({ error: validationError })
					return
				}
			}

			setState({ loading: true, error: "" })

			try {
				if (pendingMaskPainters.length) {
					await Promise.all(
						pendingMaskPainters
							.map((sectionView) => sectionView.commitPendingMask?.())
							.filter(Boolean),
					)
					const validationError = config.generate?.validate?.({ state, helpers, t })
					if (validationError) {
						setState({ error: validationError })
						return
					}
				}

				ctx.ui?.toast?.(
					config.generate.startMessage ?? t("toast.start", getDefaultStartMessage()),
					config.generate.startToastType ?? "info",
				)

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
					if (config.generate.successMessage) {
						ctx.ui?.toast?.(config.generate.successMessage, "success")
					}
					if (config.generate.closeOnSuccess === true) {
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

		let didHydrateSharedGenerationConfigCache = false

		/* 合并共享配置缓存到状态 */
		async function hydrateSharedGenerationConfigCache() {
			if (didHydrateSharedGenerationConfigCache) return
			didHydrateSharedGenerationConfigCache = true
			const cachedConfig = await readSharedGenerationConfigCache(ctx)
			const patch = {}
			Object.keys(cachedConfig).forEach((key) => {
				if (state[key] !== cachedConfig[key]) patch[key] = cachedConfig[key]
			})
			if (!Object.keys(patch).length) return
			if (ctx.state?.patch) {
				ctx.state.patch(state, patch)
				return
			}
			Object.assign(state, patch)
			updateView(patch)
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
				const preferredModelId =
					state.modelId || config.modelConfig?.defaultModelId || firstModel.model_id
				const selectedModel =
					models.find((model) => model.model_id === preferredModelId) ?? firstModel
				setState({
					modelOptions: models,
					modelId: selectedModel.model_id,
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

		function isSectionVisible(section) {
			return !section.when || section.when(getCallbackContext())
		}

		function isSectionRendered(section) {
			if (!isSectionVisible(section)) return false
			if (section.kind === "model-select" && !state.modelOptions.length) return false
			if (section.kind === "resolution-select") {
				const resolutionOptions = getResolutionOptions()
				if (resolutionOptions.length <= 1 && section.hideWhenSingle !== false) return false
			}
			if (
				(section.kind === "option-group" || section.kind === "tabs") &&
				!getSectionOptions(section).length
			) {
				return false
			}
			return true
		}

		function isSectionCurrentlyRequired(section, parentTabs = null, panelValue = null) {
			if (section.required !== true) return false
			if (parentTabs && panelValue !== getActiveTabsValue(parentTabs)) return false
			if (!isSectionRendered(section)) return false
			return true
		}

		function appendSectionTitle(titleLabel, section) {
			titleLabel.replaceChildren()
			titleLabel.append(document.createTextNode(section.title ?? ""))
			if (isSectionCurrentlyRequired(section)) {
				titleLabel.append(
					createElement("span", "mpk-section-required", t("required", "必填")),
				)
			}
		}

		function createSectionHeader(section) {
			const header = createElement("div", "mpk-section-header")
			const titleLabel = createElement("label", "mpk-section-title")
			appendSectionTitle(titleLabel, section)
			header.append(titleLabel)
			const suffix = resolveValue(section.suffix, getCallbackContext())
			if (suffix) {
				header.append(createElement("span", "mpk-section-suffix", String(suffix)))
			}
			return header
		}

		/** 创建区块 */
		function createSection(section) {
			const sectionNode = createElement("section", "mpk-section")
			if (section?.title || section?.suffix || section?.required) {
				sectionNode.append(createSectionHeader(section))
			}
			return sectionNode
		}

		/** 图片导入区是否展示空态 hover 说明（本地上传/拖拽/粘贴 + 画布导入）。 */
		function shouldShowCanvasImportHint(section) {
			if (section?.importHint === false) return false
			return Boolean(ctx.assets?.pickFiles)
		}

		/** 空态上传框 hover 说明文案。 */
		function resolveCanvasImportHint(section) {
			if (!shouldShowCanvasImportHint(section)) return null
			if (typeof section.importHint === "string") return section.importHint
			return t("imageImport.canvasHint", getCanvasImportHintFallback())
		}

		function createImportHintTooltip(section) {
			const text = resolveCanvasImportHint(section)
			if (!text) return null
			const tooltip = createElement("div", "mpk-import-hint-tooltip", text)
			tooltip.setAttribute("role", "tooltip")
			return tooltip
		}

		function bindEmptyImportHintTooltip(target, section) {
			if (!target) return null
			const text = resolveCanvasImportHint(section)
			if (!text) {
				removeImportHintTooltip(target)
				return null
			}

			let tooltip = target.querySelector(".mpk-import-hint-tooltip")
			if (!tooltip) {
				tooltip = createImportHintTooltip(section)
				if (!tooltip) return null
				target.append(tooltip)
			} else {
				tooltip.textContent = text
			}
			target.classList.add("has-import-hint-tooltip")
			return tooltip
		}

		function removeImportHintTooltip(target) {
			if (!target) return
			target.classList.remove("has-import-hint-tooltip")
			target.querySelector(".mpk-import-hint-tooltip")?.remove()
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
			const validationError = validateSectionAcquire(section)
			if (validationError) {
				return []
			}
			return pickImageFiles(options)
		}

		/** 获取画布图片投放区 ID，优先使用业务显式配置，保证重渲染后仍可匹配。 */
		function getCanvasAssetDropTargetId(section) {
			return section.id ?? section.stateKey
		}

		/** 判断指定 section 当前是否还能接收画布图片拖入。 */
		function canDropCanvasAssets(section, mode, incomingCount = 1) {
			if (!section?.stateKey) return false
			const beforePickError = section.beforePick?.({ state, helpers, t })
			if (beforePickError) return false
			if (mode !== "grid") return true
			const currentAssets = Array.isArray(state[section.stateKey])
				? state[section.stateKey]
				: []
			return (
				getSectionImportLimit(section, currentAssets.length).remaining > 0 &&
				incomingCount > 0
			)
		}

		/** 维护插件内部的 hover 样式，同一时间只允许一个 drop target 高亮。 */
		function setActiveCanvasAssetDropTarget(target) {
			if (activeCanvasAssetDropTarget === target) return
			activeCanvasAssetDropTarget?.classList.remove("is-drag-over")
			activeCanvasAssetDropTarget = target
			activeCanvasAssetDropTarget?.classList.add("is-drag-over")
		}

		function clearActiveCanvasAssetDropTarget() {
			setActiveCanvasAssetDropTarget(null)
		}

		/** 把插件内部命中的投放目标回报给宿主，宿主会在 mouseup 时决定是否真正 drop。 */
		function reportCanvasAssetDropTarget(targetId, mode, canDrop, importRemaining) {
			ctx.assets?.reportCanvasAssetDragTarget?.({
				targetId: targetId ?? null,
				mode,
				canDrop,
				importRemaining: canDrop ? importRemaining : undefined,
			})
		}

		function getCanvasAssetImportRemaining(section, mode) {
			if (mode !== "grid") return 1
			const currentAssets = Array.isArray(state[section.stateKey])
				? state[section.stateKey]
				: []
			return getSectionImportLimit(section, currentAssets.length).remaining
		}

		/** 根据 iframe 内局部坐标找到当前指针下的画布图片投放区。 */
		function getCanvasAssetDropTargetFromPoint(clientX, clientY, incomingCount) {
			const hit = document.elementFromPoint(clientX, clientY)
			const target = hit?.closest?.("[data-mpk-canvas-drop-target-id]")
			if (!target) return null
			const targetId = target.getAttribute("data-mpk-canvas-drop-target-id")
			if (!targetId) return null
			const entry = canvasAssetDropTargets.get(targetId)
			if (!entry || entry.target !== target || !entry.target.isConnected) return null
			return {
				...entry,
				targetId,
				canDrop: canDropCanvasAssets(entry.section, entry.mode, incomingCount),
			}
		}

		/** 将宿主传入的图片文件写回对应 section：grid 追加多图，slot 替换单图。 */
		async function importCanvasAssetFiles(section, mode, assets) {
			const validationError = validateSectionAcquire(section)
			if (validationError) return
			const incomingAssets = Array.isArray(assets) ? assets.filter(Boolean) : []
			if (!incomingAssets.length) return

			const currentAssets = Array.isArray(state[section.stateKey])
				? state[section.stateKey]
				: []
			const importLimit =
				mode === "grid"
					? getSectionImportLimit(section, currentAssets.length)
					: { maxCount: 1, remaining: 1 }
			const maxCount = mode === "grid" ? importLimit.remaining : 1
			if (maxCount <= 0) return

			const images = incomingAssets.slice(0, maxCount)
			if (mode === "grid") {
				setState({
					[section.stateKey]: mergeUniqueImageAssets(
						currentAssets,
						images,
						importLimit.maxCount,
					),
					error: "",
				})
				return
			}
			setState({ [section.stateKey]: images[0] ?? null, error: "" })
		}

		/** 把普通图片导入区域登记为画布图片 drop target。 */
		function registerCanvasAssetDropTarget(target, section, mode) {
			const targetId = getCanvasAssetDropTargetId(section)
			if (!targetId) return
			target.setAttribute("data-mpk-canvas-drop-target-id", targetId)
			target.setAttribute("data-mpk-canvas-drop-target-mode", mode)
			canvasAssetDropTargets.set(targetId, {
				target,
				section,
				mode,
			})
		}

		/** 响应宿主转发的画布图片拖拽 move，更新 hover 并回报当前可 drop 状态。 */
		function handleCanvasAssetDragMove(event) {
			const detail = event.detail ?? {}
			const dragSessionId =
				typeof detail.dragSessionId === "string" ? detail.dragSessionId.trim() : ""
			activeCanvasAssetDragSessionId = dragSessionId || null
			const incomingCount = Math.max(1, Number(detail.assetsMeta?.count) || 1)
			const entry =
				typeof detail.clientX === "number" && typeof detail.clientY === "number"
					? getCanvasAssetDropTargetFromPoint(
							detail.clientX,
							detail.clientY,
							incomingCount,
						)
					: null
			if (!entry || !entry.canDrop) {
				clearActiveCanvasAssetDropTarget()
				reportCanvasAssetDropTarget(entry?.targetId, entry?.mode, false)
				return
			}

			setActiveCanvasAssetDropTarget(entry.target)
			reportCanvasAssetDropTarget(
				entry.targetId,
				entry.mode,
				true,
				getCanvasAssetImportRemaining(entry.section, entry.mode),
			)
		}

		/** 指针离开 iframe 或拖拽结束时清理投放状态。 */
		function handleCanvasAssetDragLeave() {
			activeCanvasAssetDragSessionId = null
			clearActiveCanvasAssetDropTarget()
			reportCanvasAssetDropTarget(null, undefined, false)
		}

		/** 宿主确认 drop 后，把文件列表导入到最后一次命中的投放区。 */
		function handleCanvasAssetDrop(event) {
			const detail = event.detail ?? {}
			const dragSessionId =
				typeof detail.dragSessionId === "string" ? detail.dragSessionId.trim() : ""
			if (
				!dragSessionId ||
				!activeCanvasAssetDragSessionId ||
				dragSessionId !== activeCanvasAssetDragSessionId
			) {
				return
			}
			activeCanvasAssetDragSessionId = null
			const targetId = typeof detail.targetId === "string" ? detail.targetId : ""
			const entry = canvasAssetDropTargets.get(targetId)
			clearActiveCanvasAssetDropTarget()
			if (!entry || !entry.target.isConnected) {
				return
			}
			void importCanvasAssetFiles(entry.section, entry.mode, detail.files).catch((error) => {
				setState({
					error:
						getErrorMessage(error) ||
						entry.section.pickErrorMessage ||
						t("error.pickFiles", "图片上传失败，请重试"),
				})
			})
		}

		/** 绑定图片插槽事件 */
		function bindImageImportTarget(target, section, options) {
			if (!target) return

			const mode = options.mode
			let dragDepth = 0
			registerCanvasAssetDropTarget(target, section, mode)

			const setDragState = (isActive) => {
				target.classList.toggle("is-drag-over", Boolean(isActive))
			}

			const handleImportError = (error) => {
				setState({
					error:
						getErrorMessage(error) ||
						section.pickErrorMessage ||
						t("error.pickFiles", "图片上传失败，请重试"),
				})
			}

			const handlePasteError = (error) => {
				const message =
					getErrorMessage(error) ||
					section.pasteErrorMessage ||
					t("error.pasteFiles", "粘贴失败，请重试")
				setState({ error: message })
				ctx.ui?.toast?.(message, "error")
			}

			const importLocalFiles = async (files) => {
				const validationError = validateSectionAcquire(section)
				if (validationError) return

				const currentAssets = Array.isArray(state[section.stateKey])
					? state[section.stateKey]
					: []
				const importLimit =
					mode === "grid"
						? getSectionImportLimit(section, currentAssets.length)
						: { maxCount: 1, remaining: 1 }
				const maxCount = mode === "grid" ? importLimit.remaining : 1
				if (maxCount <= 0) return

				const images = await uploadDroppedFiles(files.slice(0, maxCount))
				if (!images?.length) return
				if (mode === "grid") {
					setState({
						[section.stateKey]: [...currentAssets, ...images].slice(
							0,
							importLimit.maxCount,
						),
						error: "",
					})
					return
				}
				setState({ [section.stateKey]: images[0] ?? null, error: "" })
			}

			/* 粘贴导入资源 */
			const importPastedAssets = async (clipboardData, options = {}) => {
				// 检验
				const validationError = validateSectionAcquire(section)
				if (validationError) return

				const currentAssets = Array.isArray(state[section.stateKey])
					? state[section.stateKey]
					: []
				const importLimit =
					mode === "grid"
						? getSectionImportLimit(section, currentAssets.length)
						: { maxCount: 1, remaining: 1 }
				const maxCount = mode === "grid" ? importLimit.remaining : 1
				if (maxCount <= 0) return

				const images = await resolvePastedImageAssets(maxCount, clipboardData, options)
				if (!images?.length) return
				if (mode === "grid") {
					setState({
						[section.stateKey]: mergeUniqueImageAssets(
							currentAssets,
							images,
							importLimit.maxCount,
						),
						error: "",
					})
					return
				}
				setState({ [section.stateKey]: images[0] ?? null, error: "" })
			}

			target.addEventListener("dragenter", (event) => {
				if (!hasImageFilesInDataTransfer(event.dataTransfer)) return
				event.preventDefault()
				dragDepth += 1
				setDragState(true)
			})

			target.addEventListener("dragover", (event) => {
				if (!hasImageFilesInDataTransfer(event.dataTransfer)) {
					dragDepth = 0
					setDragState(false)
					return
				}
				event.preventDefault()
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = "copy"
				}
				setDragState(true)
			})

			target.addEventListener("dragleave", (event) => {
				event.preventDefault()
				dragDepth = Math.max(0, dragDepth - 1)
				if (dragDepth === 0) {
					setDragState(false)
				}
			})

			target.addEventListener("drop", async (event) => {
				event.preventDefault()
				dragDepth = 0
				setDragState(false)
				const dataTransfer = event.dataTransfer
				if (!dataTransfer) return
				const localFiles = getImageFilesFromDataTransfer(dataTransfer)
				if (!localFiles.length) return

				try {
					await importLocalFiles(localFiles)
				} catch (error) {
					handleImportError(error)
				}
			})

			target.addEventListener("paste", async (event) => {
				const clipboardData = event.clipboardData
				const imageFiles = clipboardData ? getImageFilesFromDataTransfer(clipboardData) : []
				const canReadCanvasClipboard = Boolean(ctx.assets?.readCanvasClipboard)

				if (!imageFiles.length && !canReadCanvasClipboard) return

				const showPastingToast = () => {
					ctx.ui?.toast?.(
						section.pasteHint ?? t("imageImport.pasting", "正在粘贴…"),
						"info",
					)
				}

				try {
					if (imageFiles.length) {
						event.preventDefault()
						showPastingToast()
						await importPastedAssets(clipboardData)
						return
					}

					event.preventDefault()
					const hostResult = await readCanvasClipboardPayloadFromHost(ctx)
					if (!hasHostImportableContent(hostResult)) return

					showPastingToast()
					await importPastedAssets(clipboardData, { hostResult })
				} catch (error) {
					handlePasteError(error)
				}
			})
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
				deps.add("ratioKey")
			}

			if (section.kind === "option-group" && section.stateKey === "genCount") {
				deps.add("modelOptions")
				deps.add("modelId")
			}

			if (section.kind === "tabs") {
				for (const panel of section.panels ?? []) {
					for (const child of panel.sections ?? []) {
						for (const dep of resolveSectionDeps(child)) {
							deps.add(dep)
						}
					}
				}
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
			const title = createElement("label", "mpk-section-title")
			appendSectionTitle(title, section)
			const suffix = createElement("span", "mpk-section-suffix")
			const grid = createElement(
				"div",
				`mpk-image-grid ${section.gridClassName ?? ""}`.trim(),
			)
			grid.tabIndex = 0
			grid.setAttribute(
				"data-drop-hint",
				section.dropHint ?? t("imageGrid.dropHint", "拖拽或粘贴图片到这里"),
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
				title,
				suffix,
				grid,
				help,
				items: new Map(),
				addButton: null,
			}
			bindImageImportTarget(grid, section, { mode: "grid" })
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

			appendSectionTitle(sectionView.title, section)
			sectionView.suffix.textContent = `${assets.length}/${maxCount}`
			if (sectionView.help) {
				sectionView.help.textContent = section.help ?? ""
			}

			if (assets.length === 0) {
				bindEmptyImportHintTooltip(sectionView.grid, section)
			} else {
				removeImportHintTooltip(sectionView.grid)
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
			const sectionNode = createSection(section)
			const body = createElement("div", "mpk-image-slot-body")

			if (!asset) {
				const uploadButton = createElement("button", "mpk-image-slot-upload")
				uploadButton.type = "button"
				uploadButton.append(
					createElement("span", "mpk-image-slot-upload-label", section.uploadLabel),
				)
				uploadButton.setAttribute(
					"data-drop-hint",
					section.dropHint ?? t("imageSlot.dropHint", "拖拽或粘贴图片到这里"),
				)
				bindEmptyImportHintTooltip(uploadButton, section)
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
				bindImageImportTarget(uploadButton, section, { mode: "slot" })
				body.append(uploadButton)
			} else {
				const preview = createElement("div", "mpk-image-slot-preview")
				preview.tabIndex = 0
				preview.setAttribute(
					"data-drop-hint",
					section.dropHint ?? t("imageSlot.dropHint", "拖拽或粘贴图片到这里"),
				)
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
				bindImageImportTarget(preview, section, { mode: "slot" })
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
			const sectionNode = createSection(section)

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
			// maskCanvas 存黑白数据，overlayCanvas 存可视化标记形状，displayCanvas 负责合成展示。
			const maskCanvas = document.createElement("canvas")
			const overlayCanvas = document.createElement("canvas")
			const displayCanvas = document.createElement("canvas")
			displayCanvas.className = "mpk-mask-canvas"
			let painting = false
			let paintMode = "paint"
			let imgLoaded = false
			let cursorX = -1
			let cursorY = -1
			let hasPendingMaskChange = false
			let commitPromise = null
			let commitVersion = 0
			let confirmBtn = null
			let paintBtn = null
			let eraseBtn = null
			let brushSlider = null
			let previewNode = null
			let previewImage = null
			let previewVersion = 0
			const minBrushSize = Math.max(1, Number(section.minBrushSize) || 12)
			const maxBrushSize = Math.max(minBrushSize, Number(section.maxBrushSize) || 120)
			const brushStep = Math.max(1, Number(section.brushStep) || 2)
			let currentBrushSize = clampBrushSize(section.brushSize ?? 28)
			const overlayStyle = normalizeOverlayStyle(section.overlayColor)
			const overlayFillStyle = overlayStyle.color
			const overlayOpacity = clampOverlayOpacity(
				section.overlayOpacity ?? overlayStyle.opacity,
			)

			const img = new Image()
			// cropImg 通过 host 代理 fetch 得到 blob URL，避免 null-origin iframe tainted canvas 问题
			const cropImg = new Image()
			let cropImgObjUrl = null
			let cropImgLoaded = false
			let cropImgLoadPromise = null
			if (ctx.assets?.fetchBlob && sourceUrl) {
				cropImgLoadPromise = ctx.assets
					.fetchBlob(sourceUrl)
					.then((blob) => {
						return new Promise((resolve) => {
							cropImgObjUrl = URL.createObjectURL(blob)
							cropImg.onload = () => {
								cropImgLoaded = true
								URL.revokeObjectURL(cropImgObjUrl)
								resolve(true)
							}
							cropImg.onerror = () => {
								URL.revokeObjectURL(cropImgObjUrl)
								resolve(false)
							}
							cropImg.src = cropImgObjUrl
						})
					})
					.catch(() => false) // CORS/network fail, crop will be skipped
			}

			// 获取显示缩放比例
			function getDisplayScale() {
				const rect = displayCanvas.getBoundingClientRect()
				if (rect.width > 0) {
					return displayCanvas.width / rect.width
				}
				if (rect.height > 0) {
					return displayCanvas.height / rect.height
				}
				return 1
			}

			// 将 CSS 像素转换为 canvas 像素
			function toCanvasPx(cssPx) {
				const scale = getDisplayScale()
				if (!Number.isFinite(scale) || scale <= 0) return cssPx
				return cssPx * scale
			}

			// 限制 brushSize 的值在 minBrushSize 和 maxBrushSize 之间
			function clampBrushSize(value) {
				const parsedValue = Number(value)
				const safeValue = Number.isFinite(parsedValue) ? parsedValue : 28
				return Math.max(minBrushSize, Math.min(maxBrushSize, safeValue))
			}

			// 限制 overlayOpacity 的值在 0-1 之间
			function clampOverlayOpacity(value) {
				const parsedValue = Number(value)
				const safeValue = Number.isFinite(parsedValue) ? parsedValue : 0.42
				return Math.max(0, Math.min(1, safeValue))
			}

			// 解析 overlayColor 字符串，返回颜色和透明度对象
			function normalizeOverlayStyle(value) {
				const fallback = {
					color: "rgb(43,139,224)",
					opacity: 0.42,
				}
				if (typeof value !== "string" || !value.trim()) {
					return fallback
				}
				const color = value.trim()
				const rgbaMatch = color.match(
					/^rgba\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i,
				)
				if (!rgbaMatch) {
					return {
						color,
						opacity: fallback.opacity,
					}
				}
				const opacity = Number(rgbaMatch[4])
				return {
					color: `rgb(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]})`,
					opacity: Number.isFinite(opacity) ? opacity : fallback.opacity,
				}
			}

			function getBrushRadius() {
				return toCanvasPx(currentBrushSize) / 2
			}

			function drawFilledCircle(context, x, y, radius) {
				context.beginPath()
				context.arc(x, y, radius, 0, Math.PI * 2)
				context.fill()
			}

			function syncMaskToolState() {
				if (paintBtn) {
					const isActive = paintMode === "paint"
					paintBtn.classList.toggle("is-active", isActive)
					paintBtn.setAttribute("aria-pressed", isActive ? "true" : "false")
				}
				if (eraseBtn) {
					const isActive = paintMode === "erase"
					eraseBtn.classList.toggle("is-active", isActive)
					eraseBtn.setAttribute("aria-pressed", isActive ? "true" : "false")
				}
				if (brushSlider) {
					brushSlider.value = String(currentBrushSize)
				}
			}

			function setPaintMode(nextMode) {
				paintMode = nextMode === "erase" ? "erase" : "paint"
				syncMaskToolState()
				redrawDisplay()
			}

			function setCurrentBrushSize(nextSize) {
				currentBrushSize = clampBrushSize(nextSize)
				syncMaskToolState()
				redrawDisplay()
			}

			// 刷新显示（先显示原图，再按固定透明度叠加蓝色遮罩，最后绘制笔刷预览）
			function redrawDisplay() {
				if (!imgLoaded) return
				// 画源图
				const dc = displayCanvas.getContext("2d")
				dc.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
				dc.drawImage(img, 0, 0)

				dc.save()
				dc.globalAlpha = overlayOpacity
				dc.drawImage(overlayCanvas, 0, 0)
				dc.restore()
				// 绘制笔刷预览圆圈
				if (cursorX >= 0) {
					const brushRadius = getBrushRadius()
					dc.save()
					dc.beginPath()
					dc.arc(cursorX, cursorY, brushRadius, 0, Math.PI * 2)
					dc.strokeStyle = "rgba(0,0,0,0.75)"
					dc.lineWidth = toCanvasPx(4)
					dc.stroke()
					dc.beginPath()
					dc.arc(cursorX, cursorY, brushRadius, 0, Math.PI * 2)
					dc.strokeStyle =
						paintMode === "erase" ? "rgba(255,255,255,0.95)" : "rgba(255,214,10,1)"
					dc.lineWidth = toCanvasPx(2.5)
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
				overlayCanvas.width = img.naturalWidth
				overlayCanvas.height = img.naturalHeight
				const mc = maskCanvas.getContext("2d")
				mc.fillStyle = "#000000"
				mc.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
				overlayCanvas
					.getContext("2d")
					.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
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
				const radius = getBrushRadius()
				const mc = maskCanvas.getContext("2d")
				mc.save()
				mc.fillStyle = paintMode === "erase" ? "#000000" : "#ffffff"
				drawFilledCircle(mc, x, y, radius)
				mc.restore()

				const oc = overlayCanvas.getContext("2d")
				oc.save()
				if (paintMode === "erase") {
					oc.globalCompositeOperation = "destination-out"
					oc.fillStyle = "rgba(0,0,0,1)"
				} else {
					oc.globalCompositeOperation = "source-over"
					oc.fillStyle = overlayFillStyle
				}
				drawFilledCircle(oc, x, y, radius)
				oc.restore()
				setPendingMaskChange(true)
				redrawDisplay()
			}

			function setPendingMaskChange(nextValue) {
				const hasChanged = hasPendingMaskChange !== nextValue
				hasPendingMaskChange = nextValue
				if (confirmBtn) confirmBtn.disabled = !nextValue
				if (hasChanged) {
					renderFooter()
				} else {
					updateGenerateButtonState()
				}
			}

			async function ensureCropImageLoaded() {
				if (cropImgLoaded) return true
				if (!cropImgLoadPromise) return false
				return (await cropImgLoadPromise) === true
			}

			function createMaskCropCanvas() {
				const bbox = getMaskBoundingBox(maskCanvas)
				if (!bbox) return null

				const useMaskedCrop = section.maskCropMode !== "rect"
				const pad = section.cropPadding ?? (useMaskedCrop ? 0 : 40)
				const cx = Math.max(0, bbox.x - pad)
				const cy = Math.max(0, bbox.y - pad)
				const cw = Math.min(maskCanvas.width - cx, bbox.w + pad * 2)
				const ch = Math.min(maskCanvas.height - cy, bbox.h + pad * 2)
				const cropRect = { x: cx, y: cy, w: cw, h: ch }
				const cropCanvas = document.createElement("canvas")
				cropCanvas.width = cw
				cropCanvas.height = ch
				cropCanvas.getContext("2d").drawImage(cropImg, cx, cy, cw, ch, 0, 0, cw, ch)
				if (useMaskedCrop) {
					applyMaskToCropCanvas(cropCanvas, maskCanvas, cropRect)
				}
				return cropCanvas
			}

			function hideMaskPreview() {
				if (previewNode) previewNode.classList.remove("is-visible")
				if (previewImage) previewImage.removeAttribute("src")
			}

			function clearMaskPreview() {
				previewVersion += 1
				hideMaskPreview()
			}

			function createMaskPreviewDataUrl(cropCanvas) {
				const maxPreviewSize = Math.max(1, Number(section.previewPixelSize) || 160)
				const maxSourceSize = Math.max(cropCanvas.width, cropCanvas.height)
				const scale = Math.min(1, maxPreviewSize / maxSourceSize)
				const previewCanvas = document.createElement("canvas")
				previewCanvas.width = Math.max(1, Math.round(cropCanvas.width * scale))
				previewCanvas.height = Math.max(1, Math.round(cropCanvas.height * scale))
				const previewContext = previewCanvas.getContext("2d")
				if (!previewContext) return null
				previewContext.drawImage(
					cropCanvas,
					0,
					0,
					previewCanvas.width,
					previewCanvas.height,
				)
				return previewCanvas.toDataURL("image/png")
			}

			async function updateMaskPreview() {
				const version = previewVersion + 1
				previewVersion = version
				const canCrop = await ensureCropImageLoaded()
				if (version !== previewVersion) return
				if (!canCrop || !previewNode || !previewImage) {
					hideMaskPreview()
					return
				}
				const cropCanvas = createMaskCropCanvas()
				if (version !== previewVersion) return
				if (!cropCanvas?.toDataURL) {
					hideMaskPreview()
					return
				}
				try {
					const previewDataUrl = createMaskPreviewDataUrl(cropCanvas)
					if (!previewDataUrl) {
						hideMaskPreview()
						return
					}
					previewImage.src = previewDataUrl
					previewNode.classList.add("is-visible")
				} catch (_error) {
					hideMaskPreview()
				}
			}

			function requestMaskPreviewUpdate() {
				void updateMaskPreview().catch(() => {
					hideMaskPreview()
				})
			}

			async function createMaskCropAsset() {
				const canCrop = await ensureCropImageLoaded()
				if (!canCrop || !ctx.assets?.uploadFile) return null
				const cropCanvas = createMaskCropCanvas()
				if (!cropCanvas) return null

				const cropBlob = await canvasToBlob(cropCanvas, "image/png")
				if (!cropBlob) return null
				return ctx.assets.uploadFile(
					cropBlob,
					createMaskCropUploadName(section, sourceAsset),
					"image/png",
				)
			}

			// 裁剪涂抹 bbox，对裁剪图 uploadFile
			function commitMaskChange() {
				if (commitPromise) return commitPromise

				setPendingMaskChange(false)
				const version = commitVersion
				commitPromise = createMaskCropAsset()
					.then((asset) => {
						if (version === commitVersion) {
							setState({ [section.stateKey]: asset || null })
						}
						return asset || null
					})
					.catch((error) => {
						if (version !== commitVersion) return null
						setState({ [section.stateKey]: null })
						throw error
					})
					.finally(() => {
						commitPromise = null
					})
				return commitPromise
			}

			// 提交遮罩涂抹结果
			async function commitPendingMask() {
				while (commitPromise || hasPendingMaskChange) {
					if (commitPromise) {
						await commitPromise
						continue
					}
					if (hasPendingMaskChange) {
						await commitMaskChange()
					}
				}
			}

			function cancelPendingMaskCommit() {
				commitVersion += 1
				setPendingMaskChange(false)
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
				requestMaskPreviewUpdate()
			})
			displayCanvas.addEventListener("mouseleave", () => {
				cursorX = -1
				cursorY = -1
				redrawDisplay()
				if (!painting) return
				painting = false
				requestMaskPreviewUpdate()
			})
			displayCanvas.addEventListener(
				"touchstart",
				(e) => {
					e.preventDefault()
					painting = true
					doPaint(e)
				},
				{ passive: false },
			)
			displayCanvas.addEventListener(
				"touchmove",
				(e) => {
					e.preventDefault()
					doPaint(e)
				},
				{ passive: false },
			)
			displayCanvas.addEventListener("touchend", () => {
				if (!painting) return
				painting = false
				requestMaskPreviewUpdate()
			})
			displayCanvas.addEventListener("touchcancel", () => {
				if (!painting) return
				painting = false
				requestMaskPreviewUpdate()
			})

			const wrap = createElement("div", "mpk-mask-painter")
			previewNode = createElement("div", "mpk-mask-preview")
			previewNode.setAttribute("aria-hidden", "true")
			previewImage = createElement("img", "mpk-mask-preview-image")
			previewImage.alt = ""
			previewNode.append(previewImage)
			wrap.append(displayCanvas, previewNode)

			const controls = createElement("div", "mpk-mask-controls")
			confirmBtn = createElement(
				"button",
				"mpk-mask-confirm-btn",
				section.confirmLabel || t("maskPainter.confirm", "确认"),
			)
			confirmBtn.type = "button"
			confirmBtn.disabled = true
			confirmBtn.addEventListener("click", () => {
				if (!hasPendingMaskChange) return
				void commitPendingMask().catch((error) => {
					setState({
						error:
							getErrorMessage(error) ||
							section.pickErrorMessage ||
							t("error.pickFiles", "图片上传失败，请重试"),
					})
				})
			})
			const clearBtn = createElement(
				"button",
				"mpk-mask-clear-btn",
				section.clearLabel || t("maskPainter.clear", "重置"),
			)
			clearBtn.type = "button"
			clearBtn.addEventListener("click", () => {
				const mc = maskCanvas.getContext("2d")
				mc.fillStyle = "#000000"
				mc.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
				overlayCanvas
					.getContext("2d")
					.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
				redrawDisplay()
				clearMaskPreview()
				cancelPendingMaskCommit()
				const clearPatch = { [section.stateKey]: null }
				setState(clearPatch)
			})
			paintBtn = createElement(
				"button",
				"mpk-mask-mode-btn is-active",
				section.paintLabel || t("maskPainter.paint", "涂抹"),
			)
			paintBtn.type = "button"
			paintBtn.setAttribute("aria-pressed", "true")
			paintBtn.addEventListener("click", () => setPaintMode("paint"))
			eraseBtn = createElement(
				"button",
				"mpk-mask-mode-btn",
				section.eraseLabel || t("maskPainter.erase", "擦除"),
			)
			eraseBtn.type = "button"
			eraseBtn.setAttribute("aria-pressed", "false")
			eraseBtn.addEventListener("click", () => setPaintMode("erase"))
			const modeGroup = createElement("div", "mpk-mask-mode-group")
			modeGroup.append(paintBtn, eraseBtn)

			brushSlider = createElement("input", "mpk-mask-brush-slider")
			brushSlider.type = "range"
			brushSlider.min = String(minBrushSize)
			brushSlider.max = String(maxBrushSize)
			brushSlider.step = String(brushStep)
			brushSlider.value = String(currentBrushSize)
			brushSlider.setAttribute("aria-label", t("maskPainter.brushSize", "笔刷大小"))
			brushSlider.addEventListener("input", () => {
				setCurrentBrushSize(brushSlider.value)
			})

			const actions = createElement("div", "mpk-mask-actions")
			actions.append(confirmBtn, clearBtn)
			controls.append(modeGroup, brushSlider, actions)
			sectionNode.append(wrap, controls)

			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}

			view.sectionViews[section.id] = {
				sectionNode,
				kind: "mask-painter",
				maskCanvas,
				overlayCanvas,
				displayCanvas,
				lastSourceUrl: sourceUrl,
				cancelUpload: cancelPendingMaskCommit,
				hasPendingMaskChange: () => hasPendingMaskChange,
				getCommitPromise: () => commitPromise,
				commitPendingMask,
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

		/* 渲染 textarea */
		function renderTextarea(section) {
			const value = typeof state[section.stateKey] === "string" ? state[section.stateKey] : ""
			const maxLength = section.maxLength ? Number(section.maxLength) : MAX_TEXT_LENGTH
			const hasMaxLength = Number.isFinite(maxLength) && maxLength > 0
			const hasAiGenerate = isTextareaAiGenerateEnabled(section)
			const aiConfig = section.aiGenerate
			const sectionNode = createSection(section)
			const textarea = createElement("textarea", "mpk-textarea mpk-textarea-ai-field")
			const count = hasMaxLength
				? createElement("span", "mpk-textarea-count", `${value.length} / ${maxLength}`)
				: null
			textarea.rows = Number(section.rows) > 0 ? Number(section.rows) : MAX_TEXT_AREA_ROWS
			textarea.placeholder = resolveValue(section.placeholder, getCallbackContext()) ?? ""
			textarea.value = value
			if (hasMaxLength) {
				textarea.maxLength = maxLength
			}

			const wrap = createElement(
				"div",
				`mpk-textarea-ai-wrap ${section.shellClassName ?? ""}`.trim(),
			)
			const leftActions = createElement(
				"div",
				"mpk-textarea-ai-actions mpk-textarea-ai-actions-left",
			)
			const rightActions = createElement(
				"div",
				"mpk-textarea-ai-actions mpk-textarea-ai-actions-right",
			)
			const clearButton = createElement("button", "mpk-textarea-clear-button", "×")
			clearButton.type = "button"
			clearButton.setAttribute("aria-label", t("textarea.clear", "清空"))
			clearButton.title = t("textarea.clear", "清空")
			clearButton.hidden = value.length === 0

			const sectionView = {
				textarea,
				count,
				aiButton: null,
				clearButton,
				generating: false,
			}
			view.sectionViews[section.id] = sectionView

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
				clearButton.hidden = nextValue.length === 0
				updateGenerateButtonState()
				updateHeight()
			})

			clearButton.addEventListener("click", () => {
				textarea.value = ""
				setTextareaCountText(count, "", maxLength, hasMaxLength)
				clearButton.hidden = true
				setState({ [section.stateKey]: "", error: "" })
			})

			if (hasAiGenerate) {
				const aiButton = createElement("button", "mpk-textarea-ai-button")
				aiButton.type = "button"
				sectionView.aiButton = aiButton

				const syncAiButton = () => {
					const disabled = Boolean(resolveValue(aiConfig.disabled, getCallbackContext()))
					aiButton.disabled = disabled || sectionView.generating
					aiButton.replaceChildren()
					if (sectionView.generating) {
						aiButton.append(
							createElement(
								"span",
								"mpk-textarea-ai-button-label",
								resolveValue(aiConfig.loadingLabel, getCallbackContext()) ??
									t("textarea.aiGenerating", "Generating…"),
							),
						)
						return
					}
					aiButton.append(createElement("span", "mpk-textarea-ai-button-icon", "✦"))
					aiButton.append(
						createElement(
							"span",
							"mpk-textarea-ai-button-label",
							resolveValue(aiConfig.label, getCallbackContext()) ??
								t("textarea.aiGenerate", "AI"),
						),
					)
				}

				syncAiButton()
				aiButton.addEventListener("click", async () => {
					if (aiButton.disabled) return
					sectionView.generating = true
					syncAiButton()
					try {
						const result = await generateTextareaAiValue(aiConfig)
						const nextValue = normalizeTextareaValue(result, maxLength, hasMaxLength)
						if (!nextValue.trim()) return
						textarea.value = nextValue
						setTextareaCountText(count, nextValue, maxLength, hasMaxLength)
						clearButton.hidden = false
						setState({ [section.stateKey]: nextValue, error: "" })
					} catch (error) {
						setState({
							error:
								getErrorMessage(error) ||
								t("error.aiGenerate", "AI 生成失败，请重试"),
						})
					} finally {
						sectionView.generating = false
						syncAiButton()
					}
				})
				leftActions.append(aiButton)
			}

			if (hasMaxLength && count) {
				rightActions.append(count)
			}
			rightActions.append(clearButton)
			wrap.append(textarea)
			if (hasAiGenerate) {
				wrap.append(leftActions)
			}
			wrap.append(rightActions)
			sectionNode.append(wrap)
			if (section.help) {
				sectionNode.append(createElement("p", "mpk-help", section.help))
			}

			return sectionNode
		}

		/** 渲染开关 */
		function renderToggle(section) {
			const isChecked = Boolean(state[section.stateKey])
			const sectionNode = createSection(section)
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
			const sectionNode = createSection(section)
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
					setState({
						ratioKey: option.value,
					})
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

		/** 渲染 tabs 及其面板内容 */
		function updateTabsSection(section) {
			const options = getSectionOptions(section)
			if (!options.length) {
				delete view.sectionViews[section.id]
				return
			}

			const activeValue = getValidatedOptionValue(section, options)
			let sectionView = view.sectionViews[section.id]

			if (!sectionView) {
				const sectionNode = createSection(section)
				const hasPanels = Array.isArray(section.panels) && section.panels.length > 0
				const tabsRoot = createElement(
					"div",
					`mpk-tabs ${section.tabsClassName ?? ""}`.trim(),
				)
				const tabsList = createElement("div", "mpk-tabs-list")
				const panelHost = hasPanels ? createElement("div", "mpk-tabs-panel") : null
				sectionNode.append(tabsRoot)
				tabsRoot.append(tabsList)
				if (panelHost) tabsRoot.append(panelHost)
				if (section.help) {
					sectionNode.append(createElement("p", "mpk-help", section.help))
				}

				sectionView = {
					sectionNode,
					tabsList,
					panelHost,
					triggers: new Map(),
				}
				view.sectionViews[section.id] = sectionView

				options.forEach((option) => {
					const button = createElement("button", "mpk-tabs-trigger", option.label)
					button.type = "button"
					button.title = option.description ?? ""
					button.disabled = Boolean(option.disabled)
					button.addEventListener("click", () => {
						const currentValue = state[section.stateKey]
						if (option.disabled || currentValue === option.value) return
						const patch = { [section.stateKey]: option.value }
						if (typeof section.patchOnSelect === "function") {
							const nextState = { ...state, ...patch }
							Object.assign(
								patch,
								section.patchOnSelect(
									option.value,
									getCallbackContext(nextState),
								) || {},
							)
						}
						setState(patch)
					})
					sectionView.triggers.set(String(option.value), button)
					tabsList.append(button)
				})
			}

			options.forEach((option) => {
				const button = sectionView.triggers.get(String(option.value))
				if (!button) return
				button.classList.toggle("is-active", option.value === activeValue)
				button.disabled = Boolean(option.disabled)
				button.title = option.description ?? ""
			})

			if (!sectionView.panelHost) return
			sectionView.panelHost.replaceChildren()
			const activePanel = (section.panels ?? []).find((panel) => panel.value === activeValue)
			for (const childSection of activePanel?.sections ?? []) {
				const childNode = renderSection(childSection)
				if (childNode instanceof DocumentFragment) {
					sectionView.panelHost.append(childNode)
				} else if (childNode) {
					sectionView.panelHost.append(childNode)
				}
			}
		}

		function renderTabs(section) {
			updateTabsSection(section)
			return view.sectionViews[section.id]?.sectionNode ?? document.createDocumentFragment()
		}

		/** 渲染选项组 */
		function renderOptionGroup(section) {
			const options = getSectionOptions(section)
			if (!options.length) return document.createDocumentFragment()
			const isCardVariant = section.variant === "card"
			const isMultiple = section.multiple === true
			const descriptionMode =
				section.descriptionMode ?? (section.showDescriptionOnHover ? "tooltip" : "title")
			const sectionNode = createSection(section)
			const list = createElement(
				"div",
				`mpk-option-group${isCardVariant ? " is-card" : ""}${isMultiple ? " is-multiple" : ""} ${section.groupClassName ?? ""}`.trim(),
			)
			const activeValue = getValidatedOptionValue(section, options)
			const activeValues = getSelectedOptionValues(section, options)
			options.forEach((option) => {
				const hasTooltip = Boolean(descriptionMode === "tooltip" && option.description)
				const showsInlineDescription = Boolean(
					isCardVariant && descriptionMode === "inline" && option.description,
				)
				const isActive = isMultiple
					? activeValues.includes(option.value)
					: activeValue === option.value
				const optionNode = createElement(
					"div",
					`mpk-option-item${hasTooltip ? " has-tooltip" : ""}`,
				)
				const button = createElement(
					"button",
					`${isCardVariant ? "mpk-card-tab" : "mpk-option"}${isActive ? " is-active" : ""}`,
				)
				button.type = "button"
				button.setAttribute("aria-pressed", isActive ? "true" : "false")
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
					if (option.swatch) {
						const swatch = createElement("span", "mpk-option-swatch")
						swatch.style.background = option.swatch
						button.append(swatch)
					}
					if (isMultiple) {
						button.append(
							createElement("span", "mpk-option-check", isActive ? "✓" : ""),
						)
						button.append(createElement("span", "mpk-option-label", option.label))
					} else {
						button.append(createElement("span", "mpk-option-label", option.label))
					}
				}
				button.addEventListener("click", () => {
					if (option.disabled) return
					let patch
					if (isMultiple) {
						const currentValues = getSelectedOptionValues(section, options)
						const nextValues = currentValues.includes(option.value)
							? currentValues.filter((item) => item !== option.value)
							: [...currentValues, option.value]
						const maxSelected = Number(section.maxSelected)
						if (
							Number.isFinite(maxSelected) &&
							maxSelected > 0 &&
							nextValues.length > maxSelected
						) {
							return
						}
						patch = { [section.stateKey]: nextValues }
					} else {
						if (activeValue === option.value) {
							if (!section.allowDeselect) return
							patch = { [section.stateKey]: section.emptyValue ?? "" }
						} else {
							patch = { [section.stateKey]: option.value }
						}
					}
					if (typeof section.patchOnSelect === "function") {
						const nextState = { ...state, ...patch }
						Object.assign(
							patch,
							section.patchOnSelect(option.value, getCallbackContext(nextState)) ||
								{},
						)
					}
					setState(patch)
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
		function closeModelSelectMenu(sectionView) {
			if (!sectionView?.menuOpen) return
			sectionView.menu.hidden = true
			sectionView.trigger.classList.remove("is-open")
			sectionView.menuOpen = false
			if (sectionView.outsideHandler) {
				document.removeEventListener("mousedown", sectionView.outsideHandler)
				sectionView.outsideHandler = null
			}
		}

		function disposeModelSelectView(sectionView) {
			closeModelSelectMenu(sectionView)
		}

		function syncModelSelectView(sectionView) {
			const selected = getSelectedModel()
			sectionView.label.textContent =
				selected?.model_name ?? selected?.model_id ?? state.modelId ?? ""
			sectionView.menu.querySelectorAll(".mpk-model-select-option").forEach((button) => {
				button.classList.toggle("is-active", button.dataset.modelId === state.modelId)
			})
		}

		/* 渲染模型选择 */
		function renderModelSelect(section) {
			if (!state.modelOptions.length) return document.createDocumentFragment()
			disposeModelSelectView(view.sectionViews[section.id])

			const sectionNode = createSection(section)
			const wrap = createElement("div", "mpk-model-select")
			const trigger = createElement("button", "mpk-model-select-trigger")
			trigger.type = "button"
			const label = createElement("span", "mpk-model-select-label")
			const chevron = createElement("span", "mpk-model-select-chevron", "▾")
			const menu = createElement("div", "mpk-model-select-menu")
			menu.hidden = true

			const sectionView = {
				wrap,
				trigger,
				menu,
				label,
				menuOpen: false,
				outsideHandler: null,
			}

			state.modelOptions.forEach((model) => {
				const option = createElement("button", "mpk-model-select-option")
				option.type = "button"
				option.dataset.modelId = model.model_id
				option.append(
					createElement(
						"span",
						"mpk-model-select-option-label",
						model.model_name ?? model.model_id,
					),
				)
				option.addEventListener("click", () => {
					closeModelSelectMenu(sectionView)
					if (model.model_id === state.modelId) return
					setState({
						error: "",
						modelId: model.model_id,
						...applyModelDefaults(model),
					})
				})
				menu.append(option)
			})

			trigger.append(label, chevron)
			trigger.addEventListener("click", () => {
				if (sectionView.menuOpen) {
					closeModelSelectMenu(sectionView)
					return
				}
				sectionView.menu.hidden = false
				trigger.classList.add("is-open")
				sectionView.menuOpen = true
				sectionView.outsideHandler = (event) => {
					if (!wrap.contains(event.target)) {
						closeModelSelectMenu(sectionView)
					}
				}
				document.addEventListener("mousedown", sectionView.outsideHandler)
			})

			wrap.append(trigger, menu)
			sectionNode.append(wrap)
			view.sectionViews[section.id] = sectionView
			syncModelSelectView(sectionView)
			return sectionNode
		}

		/** 渲染分辨率选择 */
		function renderResolutionSelect(section) {
			const resolutionOptions = getResolutionOptions()
			if (resolutionOptions.length <= 1 && section.hideWhenSingle !== false) {
				return document.createDocumentFragment()
			}
			const sectionNode = createSection(section)
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
					})
				})
				list.append(button)
			})
			sectionNode.append(list)
			return sectionNode
		}

		/** 渲染区块 */
		function renderSection(section) {
			if (section.when && !section.when(getCallbackContext())) {
				delete view.sectionViews[section.id]
				return document.createDocumentFragment()
			}
			if (section.kind === "image-grid") return renderImageGrid(section)
			if (section.kind === "image-slot") return renderImageSlot(section)
			if (section.kind === "mask-painter") return renderMaskPainter(section)
			if (section.kind === "textarea") return renderTextarea(section)
			if (section.kind === "toggle") return renderToggle(section)
			if (section.kind === "size-control") return renderSizeControl(section)
			if (section.kind === "tabs") return renderTabs(section)
			if (section.kind === "option-group") return renderOptionGroup(section)
			if (section.kind === "model-select") return renderModelSelect(section)
			if (section.kind === "resolution-select") return renderResolutionSelect(section)
			if (section.kind === "custom") return section.render(getCallbackContext())
			return document.createDocumentFragment()
		}

		/** 更新区块 */
		function updateSection(section) {
			if (section.when && !section.when(getCallbackContext())) {
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

			if (section.kind === "tabs") {
				updateTabsSection(section)
				view.slots[section.id].replaceChildren(
					view.sectionViews[section.id]?.sectionNode ?? document.createDocumentFragment(),
				)
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

		/** 计算生成按钮是否应禁用 */
		function getGenerateButtonDisabled() {
			return Boolean(state.loading || config.generate?.isDisabled?.({ state, helpers, t }))
		}

		/** 仅同步已有生成按钮的 disabled，避免输入时整段 footer 重绘 */
		function updateGenerateButtonState() {
			const button = view.slots.footer.querySelector("button.mpk-generate")
			if (!button) {
				renderFooter()
				return
			}
			button.disabled = getGenerateButtonDisabled()
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
			button.disabled = getGenerateButtonDisabled()
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
			const shouldCacheSharedGenerationConfig = hasSharedGenerationConfigKey(patch)
			const nextSharedGenerationConfig = shouldCacheSharedGenerationConfig
				? pickSharedGenerationConfig({ ...state, ...patch })
				: null
			if (ctx.state?.patch) {
				ctx.state.patch(state, patch)
				if (shouldCacheSharedGenerationConfig) {
					writeSharedGenerationConfigCache(ctx, nextSharedGenerationConfig)
				}
				return
			}
			Object.assign(state, patch)
			if (shouldCacheSharedGenerationConfig) {
				writeSharedGenerationConfigCache(ctx, nextSharedGenerationConfig)
			}
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
			hasPendingMask,
		}

		// 这些事件由宿主 runtime 从 postMessage 转发为 iframe 内 CustomEvent。
		window.addEventListener(
			"magic-canvas-plugin:canvas-asset-drag-move",
			handleCanvasAssetDragMove,
		)
		window.addEventListener(
			"magic-canvas-plugin:canvas-asset-drag-leave",
			handleCanvasAssetDragLeave,
		)
		window.addEventListener("magic-canvas-plugin:canvas-asset-drop", handleCanvasAssetDrop)

		createLayout()
		updateView()
		void hydrateSharedGenerationConfigCache().finally(() => {
			void loadImageModels()
		})

		return {
			elements: getElements(),
			update(change) {
				if (!change?.keys) {
					updateView()
					return
				}
				const patch = {}
				change.keys.forEach((key) => {
					patch[key] = state[key]
				})
				updateView(patch)
			},
			dispose() {
				window.removeEventListener(
					"magic-canvas-plugin:canvas-asset-drag-move",
					handleCanvasAssetDragMove,
				)
				window.removeEventListener(
					"magic-canvas-plugin:canvas-asset-drag-leave",
					handleCanvasAssetDragLeave,
				)
				window.removeEventListener(
					"magic-canvas-plugin:canvas-asset-drop",
					handleCanvasAssetDrop,
				)
				clearActiveCanvasAssetDropTarget()
				canvasAssetDropTargets.clear()
				Object.values(view.sectionViews).forEach((sectionView) => {
					disposeModelSelectView(sectionView)
				})
				root.replaceChildren()
			},
		}
	}

	/** 旧插件协议兼容入口 */
	function mount(ctx, root, config) {
		const view = render(ctx, root, config)
		return function cleanup() {
			view?.dispose?.()
		}
	}

	global.MagicPluginKit = {
		createPanelState,
		render,
		mount,
	}
})(window)
