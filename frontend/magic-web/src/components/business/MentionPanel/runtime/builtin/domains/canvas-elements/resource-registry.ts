import { useSyncExternalStore } from "react"
import type { Canvas } from "@/components/CanvasDesign/runtime/core/Canvas"

type CanvasGetter = () => Canvas | null | undefined

const canvasGettersByDesignProjectId = new Map<string, CanvasGetter>()
const listeners = new Set<() => void>()

function emitChange() {
	listeners.forEach((listener) => listener())
}

export function subscribeCanvasElementResourceRegistry(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function setCanvasElementResourceGetter(
	designProjectId: string,
	getCanvas: CanvasGetter | null,
) {
	if (!designProjectId) return
	if (getCanvas) {
		canvasGettersByDesignProjectId.set(designProjectId, getCanvas)
	} else {
		canvasGettersByDesignProjectId.delete(designProjectId)
	}
	emitChange()
}

export function getCanvasElementResourceCanvas(designProjectId?: string): Canvas | null {
	if (!designProjectId) return null
	return canvasGettersByDesignProjectId.get(designProjectId)?.() ?? null
}

export function useCanvasElementResourceCanvas(designProjectId?: string): Canvas | null {
	return useSyncExternalStore(
		subscribeCanvasElementResourceRegistry,
		() => getCanvasElementResourceCanvas(designProjectId),
		() => null,
	)
}
