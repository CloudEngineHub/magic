import type { ElementNode } from "../ir/dom"
import type { PPTImageNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { computeEffectiveOpacity } from "../shared/color"
import { pxToInch, resolveEffectiveRadius, getGlobalTransform } from "../shared/unit"

/**
 * 解析图片 (IMG 标签或 background-image)
 */
export function parseImage(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	iWindow: Window,
): PPTImageNode | null {
	const { tagName, style, element, rect } = node

	// 计算累积透明度（复用 ElementNode 已收集的 opacity，避免额外 getComputedStyle）
	const opacity = computeEffectiveOpacity(node)
	const transparency = opacity < 1 ? Math.round((1 - opacity) * 100) : undefined

	const radiusPx = resolveEffectiveRadius(node)
	const radius = radiusPx > 0 ? pxToInch(radiusPx, config) : undefined

	// 处理变换修正 (旋转 + 缩放)
	const { rotation, scaleX, scaleY } = getGlobalTransform(node)
	
	let finalRect = { ...base }
	let rotate = rotation !== 0 ? rotation : undefined

	// 只要有旋转或显著缩放，就进行修正
	if (rotate || Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
		// 使用 layout (原始尺寸) * 累积缩放比例
		const realW = node.layout.offsetWidth * scaleX
		const realH = node.layout.offsetHeight * scaleY

		// 计算当前外接矩形的中心点
		const cx = rect.x + rect.w / 2
		const cy = rect.y + rect.h / 2

		// 倒推变换前的左上角
		const x = cx - realW / 2
		const y = cy - realH / 2

		finalRect.x = pxToInch(x, config)
		finalRect.y = pxToInch(y, config)
		finalRect.w = pxToInch(realW, config)
		finalRect.h = pxToInch(realH, config)
	}

	// 处理 IMG 标签
	if (tagName === "IMG") {
		const imgElement = element as HTMLImageElement
		const src = imgElement.src || imgElement.getAttribute("src")

		if (!src) return null

		// 按 CSS object-fit 映射缩放模式，避免默认 cover 导致裁切
		const objectFit = (style.objectFit || "").trim().toLowerCase()
		let sizing: "cover" | "contain" | "stretch" = "stretch"
		if (objectFit === "cover") sizing = "cover"
		else if (objectFit === "contain" || objectFit === "scale-down" || objectFit === "none") sizing = "contain"
		else if (objectFit === "fill" || !objectFit) sizing = "stretch"

		return {
			...finalRect,
			type: "image",
			src,
			sizing,
			transparency,
			radius, // 应用圆角
			rotate, // 应用旋转
		}
	}

	// 处理 background-image
	const bgImage = style.backgroundImage
	if (!bgImage || bgImage === "none") return null

	// 跳过渐变背景（由 parseShape 处理）
	if (bgImage.includes("gradient")) return null

	// 提取 url() 中的图片地址
	const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/)
	if (!urlMatch || !urlMatch[1]) return null

	const src = urlMatch[1]

	// 解析 background-size 确定缩放模式
	const bgSize = style.backgroundSize
	let sizing: "cover" | "contain" | "stretch" = "cover"
	if (bgSize === "contain") sizing = "contain"
	else if (bgSize === "100% 100%" || bgSize === "stretch") sizing = "stretch"

	return {
		...finalRect,
		type: "image",
		src,
		sizing,
		transparency,
		radius, // 应用圆角
		rotate, // 应用旋转
	}
}
