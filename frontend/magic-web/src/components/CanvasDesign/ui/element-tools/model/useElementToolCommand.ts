import { useLayoutEffect, useMemo, useSyncExternalStore } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import type {
	ElementToolCommand,
	ElementToolRuntimeState,
	ElementToolType,
} from "../../../runtime/element-tools"

interface ElementToolCommandRegistration {
	elementId: string
	toolId: ElementToolType
	contentId?: string
	operationId?: string
	state?: Omit<ElementToolRuntimeState, "available"> & { available?: boolean }
	execute: (command: ElementToolCommand) => void | Promise<void>
}

/** 编辑器只暴露命令能力，不再拥有底部工具的展示生命周期。 */
export function useElementToolCommand(registration: ElementToolCommandRegistration | null): void {
	const { canvas } = useCanvas()
	useLayoutEffect(() => {
		if (!canvas?.elementToolCommandBus || !registration) return
		const capturedContentId = registration.contentId
		return canvas.elementToolCommandBus.register(
			{
				elementId: registration.elementId,
				toolId: registration.toolId,
				contentId: registration.contentId,
				operationId: registration.operationId,
			},
			(command: ElementToolCommand) => {
				if (capturedContentId && command.contentId !== capturedContentId) return
				return registration.execute(command)
			},
			registration.state,
		)
	}, [canvas, registration])
}

export function useElementToolRuntimeStates(elementId: string | null) {
	const { canvas } = useCanvas()
	const bus = canvas?.elementToolCommandBus
	const contentId = useCanvasElementContentId(elementId)
	const subscribe = useMemo(
		() => (listener: () => void) => {
			if (!bus || !elementId) return () => undefined
			return bus.subscribeElement(elementId, contentId, listener)
		},
		[bus, contentId, elementId],
	)
	const getSnapshot = useMemo(
		() => () =>
			bus && elementId ? bus.getElementToolStates(elementId, contentId) : EMPTY_TOOL_STATES,
		[bus, contentId, elementId],
	)
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const EMPTY_TOOL_STATES = new Map<ElementToolType, ElementToolRuntimeState>()

function useCanvasElementContentId(elementId: string | null): string | undefined {
	const { canvas } = useCanvas()
	const element = elementId ? canvas?.elementManager?.getElementData(elementId) : undefined
	return element && "activeContentId" in element
		? (element.activeContentId ?? undefined)
		: undefined
}
