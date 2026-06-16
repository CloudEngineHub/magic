import type { OutlineNode } from "../components/SelfMediaInitPanel/types"

let outlineIdCounter = 0

function generateOutlineId(): string {
	return `ai_outline_${Date.now()}_${++outlineIdCounter}`
}

/** Strip markdown code fences from LLM JSON output */
export function cleanJsonFromLlm(content: string): string {
	return content
		.replace(/```json?\s*\n?/g, "")
		.replace(/```\s*$/g, "")
		.trim()
}

export function isWechatOfficialAccount(platform?: string): boolean {
	return platform === "wechat-official-accounts"
}

export function isCardPlatform(platform?: string): boolean {
	return platform === "rednote" || platform === "instagram"
}

/** Count top-level bullet points in outline text (excludes indented sub-points). */
export function countTopLevelOutlinePointsFromText(outlineText: string): number {
	return outlineText
		.split("\n")
		.filter((line) => /^[-*•]\s/.test(line) && !/^\s+[-*•]\s/.test(line)).length
}

export function serializeOutlineToText(nodes: OutlineNode[], depth = 0): string {
	return nodes
		.map((node) => {
			const indent = "  ".repeat(depth)
			const line = `${indent}- ${node.text}`
			const children = node.children?.length
				? "\n" + serializeOutlineToText(node.children, depth + 1)
				: ""
			return line + children
		})
		.join("\n")
}

export function parseOutlineFromText(text: string): OutlineNode[] {
	const lines = text.split("\n").filter((l) => l.trim())
	const root: OutlineNode[] = []
	const stack: { nodes: OutlineNode[]; depth: number }[] = [{ nodes: root, depth: -1 }]

	for (const line of lines) {
		const match = line.match(/^(\s*)[-*•]?\s*(?:\d+[.、)]\s*)?(.+)/)
		if (!match) continue

		const indent = match[1].length
		const nodeText = match[2].trim()
		if (!nodeText) continue

		const node: OutlineNode = {
			id: generateOutlineId(),
			text: nodeText,
			children: [],
			materials: [],
		}

		while (stack.length > 1 && stack[stack.length - 1].depth >= indent) {
			stack.pop()
		}

		stack[stack.length - 1].nodes.push(node)
		stack.push({ nodes: node.children!, depth: indent })
	}

	return root
}

/** Parse flat card lines; does not pad to expected count. */
export function parseCardContentFromText(text: string): OutlineNode[] {
	const lines = text.split("\n").filter((l) => l.trim())
	const nodes: OutlineNode[] = []

	for (const line of lines) {
		const match = line.match(/^[-*•]?\s*(?:第?\s*\d+\s*[张.:、)]\s*)?(.+)/)
		if (!match) continue
		const content = match[1].trim()
		if (!content) continue
		nodes.push({ id: generateOutlineId(), text: content, children: [], materials: [] })
	}

	return nodes
}

/**
 * Align cardCount with parsed outline for card platforms.
 * Outline length wins when non-empty; WeChat always returns 0.
 */
export function reconcileCardCountWithOutline(
	platform: string,
	parsedCardCount: number | undefined,
	outline: OutlineNode[],
	outlineText?: string,
): number {
	if (isWechatOfficialAccount(platform)) return 0

	const fromNodes = outline.length
	const fromText = outlineText ? countTopLevelOutlinePointsFromText(outlineText) : 0
	const actualCount = fromNodes > 0 ? fromNodes : fromText

	if (actualCount > 0) return actualCount

	const fallback = parsedCardCount ?? 6
	return Math.max(1, Math.min(20, fallback))
}

/** Card content result: outline drives cardCount when items exist. */
export function buildCardContentResult(
	outline: OutlineNode[],
	fallbackCardCount: number,
): { outline: OutlineNode[]; cardCount: number } {
	const cardCount = outline.length > 0 ? outline.length : Math.max(1, fallbackCardCount || 6)
	return { outline, cardCount }
}
