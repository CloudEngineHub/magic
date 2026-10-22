import { collectPPTBuilds } from "../utils/pptBuild"

const HIDDEN_MARKER = "data-magic-ppt-build-hidden"
const PREVIEW_STYLE_ATTRIBUTE = "data-magic-ppt-build-preview"

/**
 * Shows the slide as it looks after a given step while authoring. Purely visual: the hidden
 * marker and the style are runtime state that content cleaning removes from saved HTML.
 */
export class PPTBuildPreview {
	private style: HTMLStyleElement | null = null

	/** `steps` is the number of display steps already revealed (0 hides every configured element). */
	show(steps: number): void {
		const builds = collectPPTBuilds(document)
		const order = [...new Set(builds.map(({ build }) => build.step))].sort((a, b) => a - b)
		this.ensureStyle()
		for (const { element, build } of builds)
			element.toggleAttribute(HIDDEN_MARKER, order.indexOf(build.step) + 1 > steps)
	}

	clear(): void {
		document.querySelectorAll(`[${HIDDEN_MARKER}]`).forEach((element) => {
			element.removeAttribute(HIDDEN_MARKER)
		})
		this.style?.remove()
		this.style = null
	}

	private ensureStyle(): void {
		if (this.style?.isConnected) return
		const style = document.createElement("style")
		style.setAttribute("data-injected", "true")
		style.setAttribute(PREVIEW_STYLE_ATTRIBUTE, "")
		style.textContent = `[${HIDDEN_MARKER}], [${HIDDEN_MARKER}] * { visibility:hidden!important;pointer-events:none!important }`
		document.head.appendChild(style)
		this.style = style
	}
}
