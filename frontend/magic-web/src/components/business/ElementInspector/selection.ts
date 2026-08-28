import type { HtmlMultiSelectionRequest, HtmlSelectionTarget, InspectedElementInfo } from "./types"

const MAX_INSTRUCTION_LENGTH = 2000
const MAX_TEXT_LENGTH = 240
const MAX_HTML_LENGTH = 1200

export function createHtmlSelectionTarget(
	info: InspectedElementInfo,
	instruction = "",
): HtmlSelectionTarget {
	return {
		id: info.selector,
		kind: "element",
		info,
		instruction,
	}
}

export function getHtmlSelectionTargetRect(
	target: HtmlSelectionTarget,
): InspectedElementInfo["rect"] | null {
	return target.kind === "element"
		? (target.info?.rect ?? null)
		: (target.screenshot?.rect ?? null)
}

/** Keep selector identity stable so re-selecting an element edits its existing item. */
export function upsertHtmlSelectionTarget(
	targets: HtmlSelectionTarget[],
	target: HtmlSelectionTarget,
): HtmlSelectionTarget[] {
	const index = targets.findIndex((item) => {
		if (item.kind !== target.kind) return false
		if (item.kind === "element" && target.kind === "element") {
			return item.info?.selector === target.info?.selector
		}
		return item.id === target.id
	})
	if (index < 0) return [...targets, target]

	return targets.map((item, itemIndex) => (itemIndex === index ? target : item))
}

export function getHtmlElementLabel(info: InspectedElementInfo): string {
	if (info.id) return `${info.tagName}#${info.id}`
	if (info.classList.length > 0) return `${info.tagName}.${info.classList[0]}`
	return info.tagName
}

export function buildHtmlMultiSelectionRequest(
	fileId: string,
	targets: HtmlSelectionTarget[],
	instruction: string,
	fileName = "",
	filePath = "",
): HtmlMultiSelectionRequest {
	return {
		fileId,
		...(fileName ? { fileName } : {}),
		...(filePath ? { filePath } : {}),
		instruction: instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH),
		targets: targets.map((target) => {
			if (target.kind === "screenshot") {
				return {
					id: target.id,
					kind: "screenshot",
					selector: "",
					elementLabel: "Screenshot",
					// Keep host-only display metadata out of the submission contract.
					screenshot: {
						dataUrl: target.screenshot.dataUrl,
						rect: target.screenshot.rect,
						...(target.screenshot.mention
							? { mention: target.screenshot.mention }
							: {}),
					},
					instruction: target.instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH),
				}
			}

			const info = target.info
			return {
				kind: "element",
				selector: info?.selector ?? "",
				elementLabel: info ? getHtmlElementLabel(info) : "Element",
				textContent: info?.textContent?.trim().slice(0, MAX_TEXT_LENGTH) || undefined,
				domContext: info?.domContext,
				elementHtml: info?.elementHtml?.slice(0, MAX_HTML_LENGTH) || undefined,
				instruction: target.instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH),
			}
		}),
	}
}
