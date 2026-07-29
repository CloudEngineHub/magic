import { useEffect } from "react"

const PURE_SHARE_DOCUMENT_FLOW_CLASS_NAME = "magic-pure-share-document-flow"

let activePureShareDocumentFlowHooks = 0
let pureShareDocumentFlowClassWasPresent = false

/**
 * Temporarily releases the fixed-height application shell for a pure share page.
 *
 * Normal workspace routes rely on these shell nodes to own scrolling. A pure HTML share
 * expands an iframe into the document instead, so each boundary must permit its height to flow
 * through to the browser document for whole-page screenshots. A class keeps this global layout
 * change declarative, so route cleanup cannot overwrite inline styles owned by other features.
 */
export default function usePureShareDocumentFlow(enabled: boolean) {
	useEffect(() => {
		if (!enabled) return

		const documentElement = document.documentElement
		if (activePureShareDocumentFlowHooks === 0) {
			pureShareDocumentFlowClassWasPresent = documentElement.classList.contains(
				PURE_SHARE_DOCUMENT_FLOW_CLASS_NAME,
			)
			documentElement.classList.add(PURE_SHARE_DOCUMENT_FLOW_CLASS_NAME)
		}
		activePureShareDocumentFlowHooks += 1

		return () => {
			activePureShareDocumentFlowHooks -= 1
			if (activePureShareDocumentFlowHooks !== 0 || pureShareDocumentFlowClassWasPresent) {
				return
			}
			documentElement.classList.remove(PURE_SHARE_DOCUMENT_FLOW_CLASS_NAME)
		}
	}, [enabled])
}
