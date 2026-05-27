import { useRef, useEffect } from "react"
import type { TFunction } from "i18next"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { buildAgentPromptContent } from "@/components/business/ElementInspector"
import type { useElementInspector } from "@/components/business/ElementInspector"

type ElementInspector = ReturnType<typeof useElementInspector>

/** Minimal file info needed to build a project-file @mention in the prompt */
export interface InspectorFileInfo {
	fileId: string
	fileName: string
	filePath: string
}

/**
 * Manages the "toolbar mode" for the element inspector.
 *
 * When activated via `startInToolbarMode()`:
 *  - The inspector runs but the info card is hidden.
 *  - On element selection: appends a pre-filled prompt with a super-placeholder
 *    into the current topic's chat editor without overwriting existing content.
 */
export function useInspectorToolbarMode(
	elementInspector: ElementInspector,
	t: TFunction<"super">,
	fileInfo?: InspectorFileInfo,
) {
	const inspectorModeRef = useRef<"devConsole" | "toolbar">("devConsole")

	useEffect(() => {
		if (inspectorModeRef.current !== "toolbar") return
		if (!elementInspector.selectedElement) return

		const content = buildAgentPromptContent(elementInspector.selectedElement, t, fileInfo)
		elementInspector.clearSelection()
		elementInspector.stop()
		inspectorModeRef.current = "devConsole"

		// Append to current editor without replacing existing content
		pubsub.publish(PubSubEvents.Append_Content_To_Editor, content)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [elementInspector.selectedElement])

	const startInToolbarMode = () => {
		inspectorModeRef.current = "toolbar"
		elementInspector.start()
	}

	return {
		/** Pass to `hideInfoCard` prop of ElementInspectorOverlay */
		hideInfoCard: inspectorModeRef.current === "toolbar",
		/** Call from useImperativeHandle to trigger toolbar-mode inspection */
		startInToolbarMode,
		inspectorModeRef,
	}
}
