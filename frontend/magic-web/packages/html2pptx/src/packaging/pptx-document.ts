import pptxgen from "pptxgenjs"
import type { SlideConfig } from "../api/options"
import type { Pptx, Slide } from "../ir/node"

const CUSTOM_LAYOUT_NAME = "CUSTOM_LAYOUT"

type PptxWithInternalLayout = Pptx & {
	presLayout: unknown
	slides: Array<Slide & { _presLayout?: unknown }>
}

export function createPresentation(config: SlideConfig): Pptx {
	const pres = new pptxgen()
	setPresentationLayout(pres, config)
	return pres
}

/** Update the global slide size and existing slides' layout reference for auto-size exports. */
export function setPresentationLayout(pres: Pptx, config: SlideConfig): void {
	pres.defineLayout({
		name: CUSTOM_LAYOUT_NAME,
		width: config.slideWidth,
		height: config.slideHeight,
	})
	pres.layout = CUSTOM_LAYOUT_NAME
	const internal = pres as PptxWithInternalLayout
	for (const slide of internal.slides ?? []) slide._presLayout = internal.presLayout
}

export function ensureFileName(fileName: string): string {
	if (fileName.endsWith(".pptx")) return fileName
	return `${fileName}.pptx`
}
