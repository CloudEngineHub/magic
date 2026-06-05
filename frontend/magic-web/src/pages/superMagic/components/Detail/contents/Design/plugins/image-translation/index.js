/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const LANGUAGE_SELECTION_LIMIT = 20
const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
	value: count,
	label: String(count),
}))

const QUICK_LANGUAGE_CODES = ["en", "fr", "de", "es", "pt", "ja", "ko", "ar", "th", "vi", "zh"]

const LANGUAGE_CATALOG = [
	{
		key: "europe",
		label: { zh: "欧洲", en: "Europe" },
		languages: [
			{
				code: "en",
				label: { zh: "英语", en: "English" },
				promptText: { zh: "英语", en: "English" },
			},
			{
				code: "fr",
				label: { zh: "法语", en: "French" },
				promptText: { zh: "法语", en: "French" },
			},
			{
				code: "de",
				label: { zh: "德语", en: "German" },
				promptText: { zh: "德语", en: "German" },
			},
			{
				code: "es",
				label: { zh: "西班牙语", en: "Spanish" },
				promptText: { zh: "西班牙语", en: "Spanish" },
			},
			{
				code: "it",
				label: { zh: "意大利语", en: "Italian" },
				promptText: { zh: "意大利语", en: "Italian" },
			},
			{
				code: "pt",
				label: { zh: "葡萄牙语", en: "Portuguese" },
				promptText: { zh: "葡萄牙语", en: "Portuguese" },
			},
			{
				code: "nl",
				label: { zh: "荷兰语", en: "Dutch" },
				promptText: { zh: "荷兰语", en: "Dutch" },
			},
			{
				code: "pl",
				label: { zh: "波兰语", en: "Polish" },
				promptText: { zh: "波兰语", en: "Polish" },
			},
			{
				code: "sv",
				label: { zh: "瑞典语", en: "Swedish" },
				promptText: { zh: "瑞典语", en: "Swedish" },
			},
		],
	},
	{
		key: "asia",
		label: { zh: "亚洲", en: "Asia" },
		languages: [
			{
				code: "zh",
				label: { zh: "中文", en: "Chinese" },
				promptText: { zh: "中文", en: "Chinese" },
			},
			{
				code: "ja",
				label: { zh: "日语", en: "Japanese" },
				promptText: { zh: "日语", en: "Japanese" },
			},
			{
				code: "ko",
				label: { zh: "韩语", en: "Korean" },
				promptText: { zh: "韩语", en: "Korean" },
			},
			{
				code: "th",
				label: { zh: "泰语", en: "Thai" },
				promptText: { zh: "泰语", en: "Thai" },
			},
			{
				code: "vi",
				label: { zh: "越南语", en: "Vietnamese" },
				promptText: { zh: "越南语", en: "Vietnamese" },
			},
			{
				code: "id",
				label: { zh: "印尼语", en: "Indonesian" },
				promptText: { zh: "印尼语", en: "Indonesian" },
			},
			{
				code: "ms",
				label: { zh: "马来语", en: "Malay" },
				promptText: { zh: "马来语", en: "Malay" },
			},
			{
				code: "hi",
				label: { zh: "印地语", en: "Hindi" },
				promptText: { zh: "印地语", en: "Hindi" },
			},
		],
	},
	{
		key: "africa",
		label: { zh: "非洲", en: "Africa" },
		languages: [
			{
				code: "ar",
				label: { zh: "阿拉伯语", en: "Arabic" },
				promptText: { zh: "阿拉伯语", en: "Arabic" },
			},
			{
				code: "sw",
				label: { zh: "斯瓦希里语", en: "Swahili" },
				promptText: { zh: "斯瓦希里语", en: "Swahili" },
			},
			{
				code: "am",
				label: { zh: "阿姆哈拉语", en: "Amharic" },
				promptText: { zh: "阿姆哈拉语", en: "Amharic" },
			},
			{
				code: "ha",
				label: { zh: "豪萨语", en: "Hausa" },
				promptText: { zh: "豪萨语", en: "Hausa" },
			},
		],
	},
	{
		key: "other",
		label: { zh: "其他", en: "Other" },
		languages: [
			{
				code: "ru",
				label: { zh: "俄语", en: "Russian" },
				promptText: { zh: "俄语", en: "Russian" },
			},
			{
				code: "tr",
				label: { zh: "土耳其语", en: "Turkish" },
				promptText: { zh: "土耳其语", en: "Turkish" },
			},
			{
				code: "he",
				label: { zh: "希伯来语", en: "Hebrew" },
				promptText: { zh: "希伯来语", en: "Hebrew" },
			},
			{
				code: "fa",
				label: { zh: "波斯语", en: "Persian" },
				promptText: { zh: "波斯语", en: "Persian" },
			},
		],
	},
]

function getLanguageItem(code) {
	for (const group of LANGUAGE_CATALOG) {
		const match = group.languages.find((item) => item.code === code)
		if (match) return match
	}
	return null
}

function getLanguageLabel(language, locale) {
	return MagicPromptLocale.pickText(language?.label, locale)
}

function getRegionLabel(group, locale) {
	return MagicPromptLocale.pickText(group?.label, locale)
}

function searchLanguages(query, filterGroup) {
	const normalizedQuery = query.trim().toLowerCase()
	return LANGUAGE_CATALOG.flatMap((group) => {
		if (filterGroup && filterGroup !== "__all__" && group.key !== filterGroup) return []
		const languages = normalizedQuery
			? group.languages.filter((item) => {
					const keywords = [
						item.code,
						item.label.zh,
						item.label.en,
						item.promptText.zh,
						item.promptText.en,
					]
						.filter(Boolean)
						.map((value) => String(value).toLowerCase())
					return keywords.some((value) => value.includes(normalizedQuery))
				})
			: group.languages
		if (!languages.length) return []
		return [{ ...group, languages }]
	})
}

function toggleLanguageSelection(selectedLanguages, code) {
	if (selectedLanguages.includes(code)) {
		return selectedLanguages.filter((item) => item !== code)
	}
	if (selectedLanguages.length >= LANGUAGE_SELECTION_LIMIT) return null
	return [...selectedLanguages, code]
}

function createSectionNode(title, suffix) {
	const section = document.createElement("section")
	section.className = "mpk-section"
	const header = document.createElement("div")
	header.className = "mpk-section-header"
	const titleEl = document.createElement("label")
	titleEl.className = "mpk-section-title"
	titleEl.textContent = title
	header.append(titleEl)
	if (suffix) {
		const suffixEl = document.createElement("span")
		suffixEl.className = "mpk-section-suffix"
		suffixEl.textContent = suffix
		header.append(suffixEl)
	}
	section.append(header)
	return section
}

function createDrawerPillButton(label, isActive, onClick) {
	const button = document.createElement("button")
	button.type = "button"
	button.className = `pis-pill${isActive ? " is-active" : ""}`
	button.textContent = label
	button.addEventListener("click", onClick)
	return button
}

function createLanguageDrawer(panelEl, t, locale, onConfirm, onLimitReached) {
	const drawer = document.createElement("div")
	drawer.className = "pis-drawer"

	const header = document.createElement("div")
	header.className = "pis-drawer-header"
	const backBtn = document.createElement("button")
	backBtn.type = "button"
	backBtn.className = "pis-drawer-back"
	backBtn.textContent = "←"
	const title = document.createElement("span")
	title.className = "pis-drawer-title"
	title.textContent = t("drawer.title", "选择目标语言")
	header.append(backBtn, title)

	const body = document.createElement("div")
	body.className = "it-drawer-body"
	const sidebar = document.createElement("div")
	sidebar.className = "it-drawer-sidebar"
	const main = document.createElement("div")
	main.className = "it-drawer-main"
	const searchBar = document.createElement("div")
	searchBar.className = "it-search-bar"
	const searchInput = document.createElement("input")
	searchInput.className = "it-search-input"
	searchInput.type = "text"
	searchInput.placeholder = t("drawer.searchPlaceholder", "搜索语言")
	searchBar.append(searchInput)
	const list = document.createElement("div")
	list.className = "it-language-list"
	main.append(searchBar, list)
	body.append(sidebar, main)

	const footer = document.createElement("div")
	footer.className = "pis-drawer-footer"
	const confirmBtn = document.createElement("button")
	confirmBtn.type = "button"
	confirmBtn.className = "pis-primary-btn"
	confirmBtn.textContent = t("common.confirm", "确认")
	footer.append(confirmBtn)

	drawer.append(header, body, footer)
	panelEl.style.position = "relative"
	panelEl.append(drawer)

	let draftLanguages = []
	let activeRegion = "__all__"
	let searchQuery = ""

	function close() {
		drawer.classList.remove("is-open")
	}

	function renderSidebar() {
		sidebar.innerHTML = ""
		const allButton = document.createElement("button")
		allButton.type = "button"
		allButton.className = `it-filter-btn${activeRegion === "__all__" ? " is-active" : ""}`
		allButton.textContent = t("drawer.filter.all", "全部")
		allButton.addEventListener("click", () => {
			activeRegion = "__all__"
			renderAll()
		})
		sidebar.append(allButton)

		LANGUAGE_CATALOG.forEach((group) => {
			const button = document.createElement("button")
			button.type = "button"
			button.className = `it-filter-btn${activeRegion === group.key ? " is-active" : ""}`
			button.textContent = getRegionLabel(group, locale)
			button.title = getRegionLabel(group, locale)
			button.addEventListener("click", () => {
				activeRegion = group.key
				renderAll()
			})
			sidebar.append(button)
		})
	}

	function renderLanguageList() {
		const scrollTop = list.scrollTop
		list.innerHTML = ""
		const groups = searchLanguages(searchQuery, activeRegion)

		if (!groups.length) {
			const empty = document.createElement("div")
			empty.className = "it-language-empty"
			empty.textContent = t("drawer.empty", "没有匹配的语言")
			list.append(empty)
			return
		}

		groups.forEach((group) => {
			const titleEl = document.createElement("div")
			titleEl.className = "it-language-group-title"
			titleEl.textContent = getRegionLabel(group, locale)
			list.append(titleEl)

			const grid = document.createElement("div")
			grid.className = "it-language-grid"
			group.languages.forEach((language) => {
				grid.append(
					createDrawerPillButton(
						getLanguageLabel(language, locale),
						draftLanguages.includes(language.code),
						() => {
							const nextLanguages = toggleLanguageSelection(
								draftLanguages,
								language.code,
							)
							if (!nextLanguages) {
								onLimitReached()
								return
							}
							draftLanguages = nextLanguages
							renderLanguageList()
						},
					),
				)
			})
			list.append(grid)
		})

		list.scrollTop = scrollTop
	}

	function renderAll() {
		const sidebarScrollTop = sidebar.scrollTop
		renderSidebar()
		renderLanguageList()
		sidebar.scrollTop = sidebarScrollTop
	}

	function open(selectedLanguages) {
		draftLanguages = [...selectedLanguages]
		activeRegion = "__all__"
		searchQuery = ""
		searchInput.value = ""
		renderAll()
		requestAnimationFrame(() => drawer.classList.add("is-open"))
	}

	searchInput.addEventListener("input", () => {
		searchQuery = searchInput.value
		renderLanguageList()
	})
	backBtn.addEventListener("click", close)
	confirmBtn.addEventListener("click", () => {
		onConfirm([...draftLanguages])
		close()
	})

	function destroy() {
		drawer.remove()
	}

	return { open, close, destroy }
}

function createTargetLanguageSection({ state, setState, t, locale, getDrawer }) {
	const section = createSectionNode(
		t("section.targetLanguages", "目标语言可多选"),
		`${t("section.targetLanguages.selected", "已选")} ${state.targetLanguages.length}/${LANGUAGE_SELECTION_LIMIT}`,
	)
	const body = document.createElement("div")
	body.className = "it-language-section"
	const grid = document.createElement("div")
	grid.className = "it-quick-grid"

	function updateLanguages(nextLanguages) {
		setState({
			targetLanguages: nextLanguages,
			error: "",
		})
	}

	function handleToggleLanguage(code) {
		const nextLanguages = toggleLanguageSelection(state.targetLanguages, code)
		if (!nextLanguages) {
			setState({
				error: t("error.targetLanguagesLimit", "目标语言最多可选 20 个"),
			})
			return
		}
		updateLanguages(nextLanguages)
	}

	QUICK_LANGUAGE_CODES.forEach((code) => {
		const language = getLanguageItem(code)
		const button = document.createElement("button")
		button.type = "button"
		button.className = `it-quick-language${state.targetLanguages.includes(code) ? " is-active" : ""}`
		button.textContent = getLanguageLabel(language, locale)
		button.addEventListener("click", () => handleToggleLanguage(code))
		grid.append(button)
	})

	const moreButton = document.createElement("button")
	moreButton.type = "button"
	moreButton.className = "it-quick-language it-quick-language-more"
	moreButton.textContent = t("targetLanguages.more", "更多 >")
	moreButton.addEventListener("click", () => getDrawer().open(state.targetLanguages))
	grid.append(moreButton)

	body.append(grid)
	section.append(body)
	return section
}

function resolveSceneRequestSize(sceneImage, state, helpers) {
	const fallbackSize = helpers.getSelectedSize(state)
	if (!sceneImage?.width || !sceneImage?.height) {
		return fallbackSize
	}

	const targetRatio = sceneImage.width / sceneImage.height
	const candidateSizes = helpers.getVisibleSizes(state)
	let bestMatch = null

	for (const size of candidateSizes) {
		const parsedSize = helpers.parseSizeValue(size.value)
		if (!parsedSize?.width || !parsedSize?.height) continue
		const candidateRatio = parsedSize.width / parsedSize.height
		const score = Math.abs(candidateRatio - targetRatio)

		if (!bestMatch || score < bestMatch.score) {
			bestMatch = {
				...size,
				genW: parsedSize.width,
				genH: parsedSize.height,
				score,
			}
		}
	}

	return bestMatch || fallbackSize
}

function createInitialState() {
	return {
		sourceImage: null,
		targetLanguages: [],
		genCount: 1,
	}
}

function buildImageTranslationRequests({ state, helpers, locale, selectedSize }) {
	return state.targetLanguages.map((targetLanguage) =>
		buildImageTranslationRequest({
			state,
			helpers,
			locale,
			selectedSize,
			targetLanguage,
		}),
	)
}

function buildImageTranslationRequest({ state, helpers, locale, selectedSize, targetLanguage }) {
	const width = selectedSize.genW
	const height = selectedSize.genH
	const referenceImages = helpers.collectReferenceIds([state.sourceImage])

	return {
		model_id: state.modelId,
		prompt: buildImageTranslationPrompt({ targetLanguage, locale }),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution: state.scale || undefined,
		width,
		height,
		count: state.genCount,
		select: false,
	}
}

function buildImageTranslationPrompt({ targetLanguage, locale }) {
	const language = getLanguageItem(targetLanguage)
	const targetLanguageText = MagicPromptLocale.pickText(language?.promptText, locale)

	if (MagicPromptLocale.isChinese(locale)) {
		return (
			`先读取参考图 1，识别图片中所有可见文字内容，并将其准确翻译为${targetLanguageText}。` +
			"必须尽量保持原有内容结构、标题与正文层级、段落关系、对齐方式、换行逻辑、版面布局、视觉节奏和主要设计风格不变。" +
			"图片中的非文字主体内容，包括商品、人物、背景、图形、图标、装饰元素、材质、光影和构图都必须严格保留，不得改写或替换。" +
			"如果目标语言字数发生变化，只允许做保证可读性的最小排版调整，不得重做整张图片版式，不得新增无关文字，不得漏翻、错翻、重复翻译，也不要输出双语对照。" +
			"最终结果应是一张已经完成本地化翻译、可直接用于跨境场景的完整图片。"
		)
	}

	return (
		`First read reference image 1, identify all visible text in the image, and translate it accurately into ${targetLanguageText}. ` +
		"You must preserve the original content structure, title-to-body hierarchy, paragraph relationships, alignment, line breaks, layout composition, visual rhythm, and overall design style as much as possible. " +
		"All non-text visual content, including products, people, backgrounds, graphics, icons, decorative elements, materials, lighting, and composition, must remain unchanged and must not be rewritten or replaced. " +
		"If the target language becomes longer or shorter, make only the minimum layout adjustments needed for readability. Do not redesign the whole image, do not add unrelated text, do not miss, mistranslate, or duplicate translations, and do not output bilingual comparisons. " +
		"The final result should be a fully localized image that can be used directly in cross-border scenarios."
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
		let panelEl = null
		let languageDrawer = null
		let setTranslationState = null
		const getPanelEl = () => panelEl || root
		const getLanguageDrawer = () => {
			if (!languageDrawer) {
				languageDrawer = createLanguageDrawer(
					getPanelEl(),
					t,
					promptLocale,
					(targetLanguages) => {
						setTranslationState?.({ targetLanguages, error: "" })
					},
					() => {
						setTranslationState?.({
							error: t("error.targetLanguagesLimit", "目标语言最多可选 20 个"),
						})
					},
				)
			}
			return languageDrawer
		}

		const view = ctx.panel.render(root, {
			panelClassName: "image-translation",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "sourceImage",
					kind: "image-slot",
					stateKey: "sourceImage",
					title: t("section.sourceImage", "待翻译图"),
					required: true,
					uploadLabel: t("upload.sourceImage", "点击上传待翻译图"),
					alt: t("section.sourceImage", "待翻译图"),
					help: t(
						"upload.sourceImage.help",
						"请上传文字清晰、无遮挡图片，以获得更好的翻译效果",
					),
				},
				{
					id: "targetLanguages",
					kind: "custom",
					stateKey: "targetLanguages",
					required: {
						validate: ({ value }) => Array.isArray(value) && value.length > 0,
					},
					deps: ["targetLanguages"],
					render: ({ state, setState, elements }) => {
						panelEl = elements.panel || panelEl || root
						setTranslationState = setState
						return createTargetLanguageSection({
							state,
							setState,
							t,
							locale: promptLocale,
							getDrawer: getLanguageDrawer,
						})
					},
				},
				{
					id: "modelSelect",
					kind: "model-select",
					required: true,
					title: t("section.modelSelect", "AI 模型"),
				},
				{
					id: "resolution",
					kind: "resolution-select",
					required: true,
					title: t("section.resolution", "分辨率"),
					deps: ["modelId", "modelOptions"],
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: t("section.count", "生成张数"),
					suffix: t("section.count.suffix", "每图每语言"),
					options: GENERATION_COUNT_GROUP_OPTIONS,
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成图片翻译")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state }) => {
					return ""
				},
				isDisabled: ({ state }) => !state.sourceImage || !state.targetLanguages.length,
				validate: ({ state, helpers }) => {
					if (helpers.collectReferenceIds([state.sourceImage]).length !== 1) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					const selectedSize = resolveSceneRequestSize(state.sourceImage, state, helpers)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = resolveSceneRequestSize(state.sourceImage, state, helpers)
					const requests = buildImageTranslationRequests({
						state,
						helpers,
						locale: promptLocale,
						selectedSize,
					})
					const results = []
					for (const request of requests) {
						results.push(await generateAndPlace(request))
					}
					return results
				},
				onSuccess: ({ ctx }) => {
					ctx.ui.toast(t("toast.success", "图片翻译生成成功！"), "success")
					ctx.ui.close?.()
				},
			},
		})

		return {
			update(change) {
				return view?.update?.(change)
			},
			activate(nextScope) {
				return view?.activate?.(nextScope)
			},
			deactivate(nextScope) {
				return view?.deactivate?.(nextScope)
			},
			dispose(reason) {
				languageDrawer?.destroy()
				languageDrawer = null
				setTranslationState = null
				view?.dispose?.(reason)
			},
		}
	},
})
