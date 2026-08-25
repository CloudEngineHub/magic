import type { InspectedElementInfo } from "./types"

export function getShortSelector(info: InspectedElementInfo): string {
	let selector = info.tagName
	if (info.id) selector += `#${info.id}`
	if (info.classList.length > 0) {
		selector += `.${info.classList.slice(0, 2).join(".")}`
	}
	return selector
}

export function formatElementSize(width: number, height: number): string {
	return `${Math.round(width)} × ${Math.round(height)}`
}
