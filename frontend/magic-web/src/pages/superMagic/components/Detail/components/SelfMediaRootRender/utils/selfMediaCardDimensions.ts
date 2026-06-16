import type { CanonicalContentDimensions } from "../../../contents/HTML/utils/slide-dimensions"
import type { SelfMediaPlatform } from "../../../types"

const CARD_PLATFORM_DIMENSIONS: Partial<Record<SelfMediaPlatform, CanonicalContentDimensions>> = {
	rednote: { width: 540, height: 720 },
	instagram: { width: 540, height: 675 },
}

function parsePositivePixelDimension(value: string | null | undefined): number | null {
	if (!value) return null
	const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i)
	if (!match) return null
	const parsed = Number.parseFloat(match[1])
	if (!Number.isFinite(parsed) || parsed <= 0) return null
	return Math.ceil(parsed)
}

function getInlineCanvasDimensions(html: string): CanonicalContentDimensions | null {
	if (typeof DOMParser === "undefined") return null

	try {
		const doc = new DOMParser().parseFromString(html, "text/html")
		const width =
			parsePositivePixelDimension(doc.documentElement.style.width) ??
			parsePositivePixelDimension(doc.body?.style.width)
		const height =
			parsePositivePixelDimension(doc.documentElement.style.height) ??
			parsePositivePixelDimension(doc.body?.style.height)

		if (!width || !height) return null
		return { width, height }
	} catch {
		return null
	}
}

function getStyleRuleCanvasDimensions(html: string): CanonicalContentDimensions | null {
	const styleBlocks = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []

	for (const styleBlock of styleBlocks) {
		const styleText = styleBlock.replace(/^<style\b[^>]*>/i, "").replace(/<\/style>$/i, "")
		const ruleRegex = /(?:html\s*,\s*body|body\s*,\s*html|html|body)\s*\{([^}]*)\}/gi
		let rule: RegExpExecArray | null

		while ((rule = ruleRegex.exec(styleText))) {
			const declaration = rule[1]
			const width = parsePositivePixelDimension(
				declaration.match(/\bwidth\s*:\s*([^;]+);?/i)?.[1],
			)
			const height = parsePositivePixelDimension(
				declaration.match(/\bheight\s*:\s*([^;]+);?/i)?.[1],
			)

			if (width && height) return { width, height }
		}
	}

	return null
}

export function resolveSelfMediaCardScaleContentDimensions(
	platform: SelfMediaPlatform | null | undefined,
	html?: string | null,
): CanonicalContentDimensions | null {
	const explicitDimensions = html
		? (getInlineCanvasDimensions(html) ?? getStyleRuleCanvasDimensions(html))
		: null

	return explicitDimensions ?? (platform ? (CARD_PLATFORM_DIMENSIONS[platform] ?? null) : null)
}
