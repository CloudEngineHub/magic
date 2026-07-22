import { useMemo } from "react"
import type { LinkedTextConnection } from "./linkedTextPrompt"
import { useLinkedEditorInputs } from "./useLinkedEditorInputs"

export interface LinkedTextPromptState {
	connections: LinkedTextConnection[]
	promptText: string
	removeConnection: (connectionId: string) => void
}

export function useLinkedTextPrompt(
	targetElementId: string,
	enabled = true,
): LinkedTextPromptState {
	const linkedInputs = useLinkedEditorInputs({
		targetElementId,
		targetKind: "image",
		enabled,
	})

	return useMemo(
		() => ({
			connections: linkedInputs.textConnections,
			promptText: linkedInputs.textPrompt,
			removeConnection: linkedInputs.removeConnection,
		}),
		[linkedInputs.removeConnection, linkedInputs.textConnections, linkedInputs.textPrompt],
	)
}
