export { useElementInspector } from "./useElementInspector"
export {
	ElementInspectorOverlay,
	buildAgentPromptContent,
	buildHtmlMultiSelectionPromptContent,
} from "./ElementInspectorOverlay"
export type {
	InspectedElementInfo,
	InspectedElementRect,
	InspectedElementDomContext,
	BoxModelSides,
	HtmlSelectionTarget,
	HtmlElementSelectionTarget,
	HtmlScreenshotSelectionTarget,
	HtmlMultiSelectionRequest,
	HtmlMultiSelectionRequestTarget,
	HtmlScreenshotUploadRequest,
	HtmlMultiSelectionSubmitState,
} from "./types"
export { INSPECTOR_MSG } from "./types"
export {
	buildHtmlMultiSelectionRequest,
	createHtmlSelectionTarget,
	getHtmlElementLabel,
	getHtmlSelectionTargetRect,
	upsertHtmlSelectionTarget,
} from "./selection"
