import { useSyncExternalStore } from "react"
import { useCanvas } from "../../providers/CanvasProvider"
import type { GenerationRuntimeTargetState } from "../../../runtime/generation/GenerationRuntimeManager"

export function useGenerationRuntime(
	elementId: string | null,
): GenerationRuntimeTargetState | null {
	const { canvas } = useCanvas()
	const manager = canvas?.generationRuntimeManager

	return useSyncExternalStore(
		(listener) => {
			if (!manager || !elementId) return () => undefined
			return manager.subscribeElement(elementId, listener)
		},
		() => (manager && elementId ? manager.getTargetState(elementId) : null),
		() => null,
	)
}
