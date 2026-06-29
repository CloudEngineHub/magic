/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

// ── 颜色数据表 ─────────────────────────────────────────────────────────────────
const COLOR_CATALOG = [
	{
		group: "黄色",
		colors: [
			{ name: "杏仁油色", hex: "#f5deb3" },
			{ name: "法国香草", hex: "#f3e5ab" },
			{ name: "柠檬色", hex: "#f9e04b" },
			{ name: "亮浅黄", hex: "#fffacd" },
			{ name: "阳光黄", hex: "#ffd700" },
			{ name: "电子黄", hex: "#ffff00" },
			{ name: "黄褐色", hex: "#d4a017" },
			{ name: "毛茛黄", hex: "#fcd116" },
			{ name: "雾黄色", hex: "#d5b942" },
			{ name: "橄榄油色", hex: "#8b7513" },
			{ name: "琥珀绿", hex: "#7d6608" },
			{ name: "背金色", hex: "#b8a830" },
			{ name: "猎犬色", hex: "#4d3b15" },
		],
	},
	{
		group: "橘黄色",
		colors: [
			{ name: "深草黄", hex: "#e5a225" },
			{ name: "暮金色", hex: "#d4a520" },
			{ name: "太阳能色", hex: "#ffb300" },
			{ name: "柠檬铬黄", hex: "#f0a500" },
			{ name: "鲜橘黄", hex: "#ffa500" },
			{ name: "蜂蜡色", hex: "#d4860a" },
			{ name: "金秋黄", hex: "#e8962c" },
			{ name: "金米色", hex: "#c8901e" },
			{ name: "蜜黄色", hex: "#e5a133" },
			{ name: "琥珀合色", hex: "#cc7722" },
			{ name: "茶园棕", hex: "#a0522d" },
			{ name: "栀子色", hex: "#d4a76a" },
		],
	},
	{
		group: "橙色",
		colors: [
			{ name: "橙色", hex: "#ff6600" },
			{ name: "深橙色", hex: "#e65c00" },
			{ name: "国际橙", hex: "#ff4f00" },
			{ name: "铁锈橙", hex: "#c46210" },
			{ name: "南瓜橙", hex: "#e87040" },
			{ name: "烧橙色", hex: "#cc5500" },
			{ name: "珊瑚橙", hex: "#ff7f50" },
			{ name: "炭橙色", hex: "#c74e1a" },
		],
	},
	{
		group: "橙红色",
		colors: [
			{ name: "火焰红", hex: "#ff3c00" },
			{ name: "橙红色", hex: "#ff4500" },
			{ name: "朱砂红", hex: "#e34234" },
			{ name: "番茄红", hex: "#ff6347" },
			{ name: "热辣红", hex: "#e8321c" },
		],
	},
	{
		group: "红色",
		colors: [
			{ name: "深玫红", hex: "#c0392b" },
			{ name: "鲜红色", hex: "#ff0000" },
			{ name: "枫叶红", hex: "#c1440e" },
			{ name: "玫瑰红", hex: "#e8084d" },
			{ name: "正红色", hex: "#dd0000" },
			{ name: "胭脂红", hex: "#c71585" },
			{ name: "覆盆子红", hex: "#872657" },
			{ name: "深红色", hex: "#8b0000" },
			{ name: "栗红色", hex: "#800000" },
		],
	},
	{
		group: "紫红色",
		colors: [
			{ name: "紫罗兰红", hex: "#c71585" },
			{ name: "浆果红", hex: "#990f3d" },
			{ name: "品红色", hex: "#ff00ff" },
			{ name: "洋红色", hex: "#dc143c" },
			{ name: "玫瑰粉", hex: "#ff007f" },
			{ name: "深品红", hex: "#8b008b" },
		],
	},
	{
		group: "紫色",
		colors: [
			{ name: "淡紫色", hex: "#d8b4fe" },
			{ name: "丁香紫", hex: "#b57edc" },
			{ name: "薰衣草紫", hex: "#9d4edd" },
			{ name: "紫色", hex: "#800080" },
			{ name: "深紫色", hex: "#4b0082" },
			{ name: "靛青紫", hex: "#6610f2" },
			{ name: "葡萄紫", hex: "#5b2c8d" },
		],
	},
	{
		group: "蓝紫色",
		colors: [
			{ name: "矢车菊蓝", hex: "#6495ed" },
			{ name: "中蓝紫", hex: "#7b2d8b" },
			{ name: "石板蓝", hex: "#6a5acd" },
			{ name: "蓝紫色", hex: "#8a2be2" },
			{ name: "靛蓝色", hex: "#4b0082" },
		],
	},
	{
		group: "蓝色",
		colors: [
			{ name: "天蓝色", hex: "#87ceeb" },
			{ name: "宝蓝色", hex: "#0047ab" },
			{ name: "钴蓝色", hex: "#0070b8" },
			{ name: "皇家蓝", hex: "#4169e1" },
			{ name: "海军蓝", hex: "#001f5b" },
			{ name: "深天蓝", hex: "#00bfff" },
			{ name: "湖蓝色", hex: "#0099cc" },
			{ name: "靛蓝色", hex: "#003153" },
			{ name: "普鲁士蓝", hex: "#003153" },
		],
	},
	{
		group: "绿色",
		colors: [
			{ name: "草绿色", hex: "#7cfc00" },
			{ name: "苹果绿", hex: "#8db600" },
			{ name: "橄榄绿", hex: "#6b8e23" },
			{ name: "松绿色", hex: "#228b22" },
			{ name: "翡翠绿", hex: "#50c878" },
			{ name: "军绿色", hex: "#4b5320" },
			{ name: "墨绿色", hex: "#004d00" },
			{ name: "薄荷绿", hex: "#98ff98" },
			{ name: "孔雀绿", hex: "#00a693" },
		],
	},
	{
		group: "中性色",
		colors: [
			{ name: "纯白色", hex: "#ffffff" },
			{ name: "米白色", hex: "#faf0e6" },
			{ name: "象牙白", hex: "#fffff0" },
			{ name: "浅灰色", hex: "#d3d3d3" },
			{ name: "银灰色", hex: "#c0c0c0" },
			{ name: "中灰色", hex: "#808080" },
			{ name: "深灰色", hex: "#404040" },
			{ name: "炭灰色", hex: "#202020" },
			{ name: "纯黑色", hex: "#000000" },
			{ name: "驼色", hex: "#c19a6b" },
			{ name: "卡其色", hex: "#c3b091" },
			{ name: "棕褐色", hex: "#8b5e3c" },
		],
	},
]

// ── 颜色工具函数 ───────────────────────────────────────────────────────────────

/** 搜索颜色：返回过滤后的分组列表 */
function searchColors(query, filterGroup) {
	const q = query.trim().toLowerCase()
	return COLOR_CATALOG.flatMap((group) => {
		if (filterGroup && filterGroup !== "__all__" && group.group !== filterGroup) return []
		const colors = q
			? group.colors.filter(
					(c) => c.name.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q),
				)
			: group.colors
		if (!colors.length) return []
		return [{ group: group.group, colors }]
	})
}

// ── 颜色侧拉框 ────────────────────────────────────────────────────────────────

/**
 * 创建颜色侧拉框并挂载到 panelEl
 * onSelect(color: { name: string|null, hex: string }) 选色回调
 * 返回 { open(), close() }
 */
function createColorDrawer(panelEl, t, onSelect) {
	const drawer = document.createElement("div")
	drawer.className = "ccc-drawer"

	// ── 标题栏 ──
	const header = document.createElement("div")
	header.className = "ccc-drawer-header"

	const backBtn = document.createElement("button")
	backBtn.className = "ccc-drawer-back-btn"
	backBtn.type = "button"
	backBtn.textContent = "←"
	backBtn.addEventListener("click", () => close())

	const titleEl = document.createElement("span")
	titleEl.className = "ccc-drawer-title"
	titleEl.textContent = t("drawer.title", "替换颜色")

	header.append(backBtn, titleEl)

	// ── 主体 ──
	const body = document.createElement("div")
	body.className = "ccc-drawer-body"

	// 左列：分类过滤
	const sidebar = document.createElement("div")
	sidebar.className = "ccc-drawer-sidebar"

	// 右列
	const mainCol = document.createElement("div")
	mainCol.className = "ccc-drawer-main"

	// 搜索栏
	const searchBar = document.createElement("div")
	searchBar.className = "ccc-search-bar"
	const searchInput = document.createElement("input")
	searchInput.className = "ccc-search-input"
	searchInput.type = "text"
	searchInput.placeholder = t("color.searchPlaceholder", "颜色名")
	searchBar.append(searchInput)

	// 颜色列表
	const colorList = document.createElement("div")
	colorList.className = "ccc-color-list"

	// 自定义色卡区
	const customArea = document.createElement("div")
	customArea.className = "ccc-custom-color"

	const customLabel = document.createElement("span")
	customLabel.className = "ccc-custom-label"
	customLabel.textContent = t("color.custom", "自定义")

	const swatchBtn = document.createElement("button")
	swatchBtn.className = "ccc-custom-swatch-btn"
	swatchBtn.type = "button"
	swatchBtn.title = t("color.customPlaceholder", "点击选取颜色")
	swatchBtn.style.background = "#e5e7eb"

	const colorInput = document.createElement("input")
	colorInput.className = "ccc-custom-color-input"
	colorInput.type = "color"
	colorInput.value = "#e5e7eb"
	swatchBtn.append(colorInput)

	const customHex = document.createElement("span")
	customHex.className = "ccc-custom-hex"
	customHex.textContent = ""

	customArea.append(customLabel, swatchBtn, customHex)
	mainCol.append(searchBar, colorList, customArea)
	body.append(sidebar, mainCol)
	drawer.append(header, body)
	panelEl.style.position = "relative"
	panelEl.append(drawer)

	// ── 状态 ──
	let activeGroup = "__all__"
	let searchQuery = ""
	let selectedHex = null // 当前选中的 hex（预置或自定义）
	let customColorActive = false
	let presetSwatches = []

	// ── 渲染侧边分类按钮 ──
	function renderSidebar() {
		sidebar.innerHTML = ""
		const allBtn = document.createElement("button")
		allBtn.className = `ccc-filter-btn${activeGroup === "__all__" ? " is-active" : ""}`
		allBtn.type = "button"
		allBtn.textContent = t("color.filterAll", "全部")
		allBtn.addEventListener("click", () => {
			activeGroup = "__all__"
			renderAll()
		})
		sidebar.append(allBtn)

		COLOR_CATALOG.forEach((group) => {
			const btn = document.createElement("button")
			btn.className = `ccc-filter-btn${activeGroup === group.group ? " is-active" : ""}`
			btn.type = "button"
			btn.textContent = group.group
			btn.title = group.group
			btn.addEventListener("click", () => {
				activeGroup = group.group
				renderAll()
			})
			sidebar.append(btn)
		})
	}

	const syncThemeColorSelection = (nextColor) => {
		presetSwatches.forEach(({ color, element }) => {
			element.classList.toggle("is-selected", color === nextColor)
		})
	}

	// ── 渲染颜色列表 ──
	function renderColorList() {
		colorList.innerHTML = ""
		const groups = searchColors(searchQuery, activeGroup)

		if (!groups.length) {
			const empty = document.createElement("div")
			empty.className = "ccc-color-empty"
			empty.textContent = "没有匹配的颜色"
			colorList.append(empty)
			return
		}

		groups.forEach((group) => {
			const groupTitle = document.createElement("div")
			groupTitle.className = "ccc-color-group-title"
			groupTitle.textContent = group.group
			colorList.append(groupTitle)

			const grid = document.createElement("div")
			grid.className = "ccc-color-grid"

			group.colors.forEach((color) => {
				const wrapper = document.createElement("div")
				wrapper.className = `ccc-color-dot-wrapper${!customColorActive && selectedHex === color.hex ? " is-selected" : ""}`
				wrapper.title = `${color.name}  ${color.hex}`

				const dot = document.createElement("span")
				dot.className = "ccc-color-dot"
				dot.style.background = color.hex
				presetSwatches.push({ color: color.hex, element: wrapper })

				const label = document.createElement("span")
				label.className = "ccc-color-dot-label"
				label.textContent = color.name

				wrapper.append(dot, label)
				wrapper.addEventListener("click", () => {
					selectedHex = color.hex
					customColorActive = false
					swatchBtn.classList.remove("is-selected")
					onSelect({ name: color.name, hex: color.hex })
					syncThemeColorSelection(color.hex)
					close()
				})
				grid.append(wrapper)
			})

			colorList.append(grid)
		})
	}

	// ── 自定义色卡事件 ──
	colorInput.addEventListener("input", () => {
		const hex = colorInput.value
		swatchBtn.style.background = hex
		customHex.textContent = hex.toUpperCase()
		selectedHex = hex
		customColorActive = true
		swatchBtn.classList.add("is-selected")
	})

	colorInput.addEventListener("change", () => {
		const hex = colorInput.value
		onSelect({ name: null, hex: hex.toUpperCase() })
		close()
	})

	// ── 搜索事件 ──
	searchInput.addEventListener("input", () => {
		searchQuery = searchInput.value
		renderColorList()
	})

	function renderAll() {
		renderSidebar()
		renderColorList()
	}

	// ── 开关 ──
	function syncSelection(color) {
		selectedHex = color?.hex ?? null
		customColorActive = Boolean(color?.hex) && !color?.name
		if (color?.hex) {
			swatchBtn.style.background = color.hex
			colorInput.value = color.hex
			customHex.textContent = color.hex.toUpperCase()
		} else {
			swatchBtn.style.background = "#e5e7eb"
			colorInput.value = "#e5e7eb"
			customHex.textContent = ""
		}
		swatchBtn.classList.toggle("is-selected", customColorActive)
	}

	function open(color) {
		syncSelection(color)
		renderAll()
		requestAnimationFrame(() => drawer.classList.add("is-open"))
	}

	function close() {
		drawer.classList.remove("is-open")
	}

	function destroy() {
		drawer.remove()
	}

	return { open, close, destroy }
}

// ── 颜色区块渲染 ──────────────────────────────────────────────────────────────

function createColorSection({ state, setState, t, getDrawer }) {
	const section = document.createElement("section")
	section.className = "mpk-section ccс-color-section"

	const header = document.createElement("div")
	header.className = "mpk-section-header"
	const titleEl = document.createElement("label")
	titleEl.className = "mpk-section-title"
	titleEl.textContent = t("section.color", "颜色")
	header.append(titleEl)
	section.append(header)

	const body = document.createElement("div")
	section.append(body)

	function renderBody() {
		body.innerHTML = ""
		const color = state.color

		if (!color) {
			// 未选状态
			const addBtn = document.createElement("button")
			addBtn.className = "ccc-color-add-btn"
			addBtn.type = "button"

			const icon = document.createElement("span")
			icon.className = "ccc-color-add-btn-icon"
			icon.textContent = "›"

			const label = document.createElement("span")
			label.textContent = t("color.selectHint", "请选择颜色")

			addBtn.append(label, icon)
			addBtn.addEventListener("click", () => getDrawer().open(color))
			body.append(addBtn)
		} else {
			// 已选状态
			const tag = document.createElement("div")
			tag.className = "ccc-color-tag"

			const colorPreview = document.createElement("div")
			colorPreview.className = "ccc-color-preview"

			const swatch = document.createElement("span")
			swatch.className = "ccc-color-swatch"
			swatch.style.background = color.hex

			const nameEl = color.name
				? (() => {
						const el = document.createElement("span")
						el.className = "ccc-color-name"
						el.textContent = color.name
						return el
					})()
				: null

			const hexEl = document.createElement("span")
			hexEl.className = "ccc-color-hex"
			hexEl.textContent = color.hex.toUpperCase()

			const clearBtn = document.createElement("button")
			clearBtn.className = "ccc-color-clear-btn"
			clearBtn.type = "button"
			clearBtn.title = "清除"
			clearBtn.textContent = "×"
			clearBtn.addEventListener("click", () => {
				setState({ color: null })
				renderBody()
			})

			const editBtn = document.createElement("button")
			editBtn.className = "ccc-color-edit-btn"
			editBtn.type = "button"
			editBtn.title = "重新选择"
			editBtn.textContent = "›"
			editBtn.addEventListener("click", () => getDrawer().open(color))

			colorPreview.append(swatch)

			if (nameEl) colorPreview.append(nameEl)
			colorPreview.append(hexEl, clearBtn)
			tag.append(colorPreview, editBtn)
			body.append(tag)
		}
	}

	renderBody()
	return section
}

// ── 部位快捷标签区块 ──────────────────────────────────────────────────────────

function createBodyPartTagsSection({ state, setState, t }) {
	const QUICK_TAGS = [
		{ key: "bodyPart.tag.top", fallback: "上衣" },
		{ key: "bodyPart.tag.trousers", fallback: "裤装" },
		{ key: "bodyPart.tag.jacket", fallback: "外套" },
		{ key: "bodyPart.tag.dress", fallback: "连衣裙" },
	]

	const wrapper = document.createElement("div")
	wrapper.className = "ccc-body-part-tags"

	QUICK_TAGS.forEach(({ key, fallback }) => {
		const tag = document.createElement("button")
		tag.className = "ccc-body-part-tag"
		tag.type = "button"
		tag.textContent = t(key, fallback)
		tag.addEventListener("click", () => {
			setState({ bodyPart: t(key, fallback) })
		})
		wrapper.append(tag)
	})

	return wrapper
}

// ── 插件注册 ──────────────────────────────────────────────────────────────────

function createInitialState() {
	return {
		modelImage: null,
		cropImage: null,
		bodyPart: "",
		color: null,
		genCount: 1,
	}
}

// ── 请求构建 ──────────────────────────────────────────────────────────────────

function buildColorChangeRequest({
	modelId,
	baseImage,
	helpers,
	width,
	height,
	resolution,
	count,
	bodyPart,
	cropImage,
	color,
	locale,
}) {
	const hasCrop = Boolean(cropImage)
	const referenceImages = helpers.collectReferenceIds([baseImage, cropImage].filter(Boolean))
	return {
		model_id: modelId,
		prompt: buildColorChangePrompt({ bodyPart, color, locale, hasCrop }),
		reference_images: referenceImages,
		size: `${width}x${height}`,
		resolution,
		width,
		height,
		count,
		select: false,
	}
}

function buildColorChangePrompt({ bodyPart, color, locale, hasCrop }) {
	const normalizedBodyPart = String(bodyPart ?? "").trim()
	const colorDesc = color.name ? `${color.name} (${color.hex})` : color.hex
	if (MagicPromptLocale.isChinese(locale)) {
		const targetInstruction = hasCrop
			? normalizedBodyPart
				? `这是基于参考图 1 的局部换色编辑任务。参考图 1 是唯一的完整原图、构图、主体和输出依据；参考图 2 只是用户涂抹标记出的目标换色区域定位图，不是构图参考、主体参考、商品参考或输出范围参考。换色部位描述为“${normalizedBodyPart}”。请在完全保持参考图 1 原始画幅、主体类型、服饰结构和画面布局不变的前提下，仅将参考图 1 中与参考图 2 对应的目标服饰区域颜色改为 ${colorDesc}。换色部位描述只用于理解该标记区域，不得扩大到未标记区域。`
				: `这是基于参考图 1 的局部换色编辑任务。参考图 1 是唯一的完整原图、构图、主体和输出依据；参考图 2 只是用户涂抹标记出的目标换色区域定位图，不是构图参考、主体参考、商品参考或输出范围参考。请在完全保持参考图 1 原始画幅、主体类型、服饰结构和画面布局不变的前提下，仅将参考图 1 中与参考图 2 对应的目标服饰区域颜色改为 ${colorDesc}。`
			: `这是基于参考图 1 的局部换色编辑任务。请仅将参考图 1 中${normalizedBodyPart}的颜色改为 ${colorDesc}，并保持参考图 1 的原始画幅、主体类型、服饰结构和画面布局不变。`
		return (
			targetInstruction +
			(hasCrop
				? "最终输出必须是参考图 1 的完整图像，不得输出参考图 2 的局部裁剪、局部放大图、透明蒙版图或只有目标服饰部位的图片。"
				: "") +
			"参考图 1 可能是真人模特穿着图、人台图、平铺图、挂拍图或商品图；无论是哪一种，都必须以参考图 1 当前画面为基础，只做目标区域换色，保持参考图 1 当前主体类型、主体数量、承载方式和拍摄状态不变。" +
			"不得把人台图、平铺图、挂拍图或商品图改成真人模特图，也不得把真人模特图改成人台图、平铺图或商品图。" +
			"严格保留参考图 1 中的服装轮廓、版型结构、面料纹理、褶皱、高光、阴影、图案、logo、辅料、背景场景、拍摄角度和目标服装部位以外的所有区域。" +
			"不得新增、删除或替换真人模特、人台、脸、手、腿、身体、姿势、挂架、道具或穿着场景；参考图 1 中原本没有的元素不要生成。" +
			"未标记或未指定的服装区域、配饰、主体载体、皮肤、头发、背景和商品细节不得跟随目标颜色变化。" +
			"不要生成拼贴、对比排版、多视图、局部特写或新构图。" +
			"最终结果应像在原图基础上只修改了目标颜色，自然、真实，并具备专业商业修图质感。"
		)
	}

	const targetInstructionEn = hasCrop
		? normalizedBodyPart
			? `This is a local recolor editing task based on reference image 1. Reference image 1 is the only source for the original full image, composition, subject, and output. Reference image 2 is only a locator image for the target recolor area painted by the user; it is not a composition reference, subject reference, product reference, or output range reference. The garment area description is "${normalizedBodyPart}". Keep the original canvas, subject type, garment construction, and image layout of reference image 1 completely unchanged, and recolor only the target garment area in reference image 1 that corresponds to reference image 2 to ${colorDesc}. Use the garment area description only to understand the marked region and do not expand it to unmarked areas. `
			: `This is a local recolor editing task based on reference image 1. Reference image 1 is the only source for the original full image, composition, subject, and output. Reference image 2 is only a locator image for the target recolor area painted by the user; it is not a composition reference, subject reference, product reference, or output range reference. Keep the original canvas, subject type, garment construction, and image layout of reference image 1 completely unchanged, and recolor only the target garment area in reference image 1 that corresponds to reference image 2 to ${colorDesc}. `
		: `This is a local recolor editing task based on reference image 1. Recolor only the ${normalizedBodyPart} in reference image 1 to ${colorDesc}, while keeping the original canvas, subject type, garment construction, and image layout of reference image 1 unchanged. `
	return (
		targetInstructionEn +
		(hasCrop
			? "The final output must be the complete image from reference image 1. Do not output the cropped region from reference image 2, a close-up, a transparent mask image, or an image containing only the target garment part. "
			: "") +
		"Reference image 1 may be a real model wearing the garment, a mannequin image, a flat-lay image, a hanging product image, or a product-only image. In all cases, edit based on the current image in reference image 1 only, recolor only the target area, and keep the current subject type, subject count, display method, and shooting state from reference image 1 unchanged. " +
		"Do not turn a mannequin, flat-lay, hanging product, or product-only image into a real-model image, and do not turn a real-model image into a mannequin, flat-lay, or product-only image. " +
		"Strictly preserve the garment silhouette, construction, fabric texture, folds, highlights, shadows, patterns, logos, trims, background scene, camera angle, and every area outside the target garment part in reference image 1. " +
		"Do not add, remove, or replace a real model, mannequin, face, hands, legs, body, pose, hanger, prop, or wearing scene; do not generate elements that are not already present in reference image 1. " +
		"Unmarked or unspecified garment areas, accessories, subject support, skin, hair, background, and product details must not shift toward the target color. " +
		"Do not generate collages, comparison layouts, multi-view outputs, close-ups, or a new composition. " +
		"The final result should look like the original image with only the target color edited, natural, realistic, and professionally retouched."
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

		// 获取面板根节点（kit 挂载后写入）
		let panelEl = null
		let colorDrawer = null
		let setColorState = null
		const getPanelEl = () => panelEl || root
		const getColorDrawer = () => {
			if (!colorDrawer) {
				colorDrawer = createColorDrawer(getPanelEl(), t, (color) => {
					setColorState?.({ color })
				})
			}
			return colorDrawer
		}

		const view = ctx.panel.render(root, {
			panelClassName: "clothing-color-change",
			state: instance.state,
			modelConfig: {
				autoLoad: true,
				showLoadErrors: true,
				noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
			},
			sections: [
				{
					id: "modelImage",
					kind: "image-slot",
					stateKey: "modelImage",
					title: t("section.modelImage", "服饰图"),
					required: true,
					uploadLabel: t("upload.modelImage", "点击上传服饰图"),
					alt: t("section.modelImage", "服饰图"),
					help: t(
						"upload.modelImage.help",
						"上传单张服饰图，支持真人模特、人台、平铺、挂拍或商品图；仅替换指定服饰部位颜色，保留原图主体与其他区域。",
					),
				},
				{
					id: "maskPainter",
					kind: "mask-painter",
					stateKey: "cropImage",
					sourceStateKey: "modelImage",
					title: t("section.maskPainter", "标记换色区域（可选）"),
					noSourceHint: t("maskPainter.noSource", "请先上传服饰图"),
					clearLabel: t("maskPainter.clear", "重置"),
					brushSize: 40,
					deps: ["modelImage"],
					help: t(
						"maskPainter.help",
						"可在服饰图上涂抹需要换色的区域；标记后涂抹区域优先，换色部位仅作为语义补充。",
					),
				},
				{
					id: "bodyPart",
					kind: "textarea",
					stateKey: "bodyPart",
					title: t("section.bodyPart", "换色部位"),
					placeholder: t("bodyPart.placeholder", '如"上衣"、"裤装"、"外套"、"连衣裙"…'),
					rows: 2,
					maxLength: 50,
				},
				{
					id: "color",
					kind: "custom",
					stateKey: "color",
					required: true,
					deps: ["color"],
					render: ({ state, setState, elements }) => {
						// 记录 kit 暴露的稳定 panel DOM，供 drawer 挂载使用
						panelEl = elements.panel || panelEl || root
						setColorState = setState
						return createColorSection({ state, setState, t, getDrawer: getColorDrawer })
					},
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
					title: t("section.count", "生成数量"),
				},
			],
			generate: {
				buttonLabel: `✨ ${t("button.generate", "生成换色图")}`,
				loadingLabel: t("button.generating", "生成中…"),
				getIdleHint: ({ state, helpers }) => {
					const hasRecolorMask =
						Boolean(state.cropImage) || helpers.hasPendingMask("maskPainter")
					if (!state.modelImage) {
						return t("empty.modelImage", "请先上传 1 张服饰图")
					}
					if (!state.bodyPart.trim() && !hasRecolorMask) {
						return t("empty.bodyPart", "请先输入或标记换色部位")
					}
					if (!state.color) {
						return t("empty.color", "请先选择颜色")
					}
					return ""
				},
				isDisabled: ({ state, helpers }) => {
					const hasRecolorMask =
						Boolean(state.cropImage) || helpers.hasPendingMask("maskPainter")
					return (
						!state.modelImage ||
						(!state.bodyPart.trim() && !hasRecolorMask) ||
						!state.color
					)
				},
				validate: ({ state, helpers }) => {
					if (helpers.collectReferenceIds([state.modelImage]).length !== 1) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					if (
						state.cropImage &&
						helpers.collectReferenceIds([state.cropImage]).length !== 1
					) {
						return t("error.references", "图片缺少可用于生成的资源标识")
					}
					const selectedSize = helpers.getSelectedSize(state)
					if (!selectedSize?.genW || !selectedSize?.genH) {
						return t("error.noSize", "当前模型缺少可用尺寸配置")
					}
					return null
				},
				execute: async ({ state, helpers, generateAndPlace }) => {
					const selectedSize = helpers.getSelectedSize(state)
					const width = selectedSize.genW
					const height = selectedSize.genH

					return generateAndPlace(
						buildColorChangeRequest({
							modelId: state.modelId,
							baseImage: state.modelImage,
							helpers,
							width,
							height,
							resolution: state.scale || undefined,
							count: state.genCount,
							bodyPart: state.bodyPart.trim(),
							cropImage: state.cropImage,
							color: state.color,
							locale: promptLocale,
						}),
					)
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
				colorDrawer?.destroy()
				colorDrawer = null
				setColorState = null
				view?.dispose?.(reason)
			},
		}
	},
})
