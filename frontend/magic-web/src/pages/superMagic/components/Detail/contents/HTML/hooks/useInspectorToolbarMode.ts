import { useRef, useEffect } from "react"
import type { TFunction } from "i18next"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { buildAgentPromptContent } from "@/components/business/ElementInspector"
import type { useElementInspector } from "@/components/business/ElementInspector"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { roleStore } from "@/pages/superMagic/stores"
import { resolveDefaultAgentSelection } from "@/services/superMagic/DefaultAgentSelectionService"

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
	const inspectorModeRef = useRef<"devConsole" | "toolbar" | "appendToEditor">("devConsole")

	useEffect(() => {
		if (inspectorModeRef.current === "devConsole") return
		if (!elementInspector.selectedElement) return

		const currentMode = inspectorModeRef.current

		elementInspector.clearSelection()
		elementInspector.stop()
		inspectorModeRef.current = "devConsole"

		if (currentMode === "appendToEditor") {
			// Append inspector-detail rich node to the current editor
			const content = buildAgentPromptContent(
				elementInspector.selectedElement,
				t("stylePanel.inspector.agentPromptTitle"),
				fileInfo,
			)
			pubsub.publish(PubSubEvents.Append_Suggestion_To_Editor, content)
			return
		}

		// toolbar mode — create new topic with rich content
		const content = buildAgentPromptContent(
			elementInspector.selectedElement,
			t("stylePanel.inspector.agentPromptTitle"),
			fileInfo,
		)

		// In crew/skill/MagiClaw scenarios there's no Create_New_Topic listener;
		// fall back to setting the input message directly in the current editor.
		if (!pubsub.hasListeners(PubSubEvents.Create_New_Topic)) {
			pubsub.publish(PubSubEvents.Set_Input_Message, content)
			return
		}

		const defaultSelection = resolveDefaultAgentSelection()
		const topicMode = superMagicModeService.isModeValid(
			defaultSelection.modeIdentifier,
			defaultSelection.agentCode,
		)
			? (defaultSelection.modeIdentifier as TopicMode)
			: undefined

		// Sync the role store so tabPattern is consistent with the new topic's mode
		if (topicMode) {
			roleStore.applyResolvedRole(topicMode)
		}

		// Pass content via afterCreate so it is inserted AFTER navigation completes
		pubsub.publish(PubSubEvents.Create_New_Topic, {
			topicMode,
			afterCreate: { content, extraData: { hasInput: true } },
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [elementInspector.selectedElement])

	const startInToolbarMode = () => {
		inspectorModeRef.current = "toolbar"
		elementInspector.start()
	}

	const startInAppendMode = () => {
		inspectorModeRef.current = "appendToEditor"
		elementInspector.start()
	}

	return {
		/** Pass to `hideInfoCard` prop of ElementInspectorOverlay */
		hideInfoCard: inspectorModeRef.current !== "devConsole",
		/** Whether the inspector is currently active in append-to-editor mode */
		isAppendPicking: elementInspector.active && inspectorModeRef.current === "appendToEditor",
		/** Call from useImperativeHandle to trigger toolbar-mode inspection */
		startInToolbarMode,
		/** Call to trigger inspector; selection appends element info to current editor */
		startInAppendMode,
		inspectorModeRef,
	}
}
