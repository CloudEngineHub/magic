import { useRef, useEffect, useCallback } from "react"
import { useSize } from "ahooks"
import { useCanvas } from "../../providers/CanvasProvider"
import {
	getConnectionGeometryPointAt,
	resolveConnectionGeometry,
	type ConnectionPoint,
} from "../../../runtime/interaction/connection/connectionGeometry"

export interface UseConnectionPositionEffectOptions {
	connectionId: string | null
	sourceElementId?: string | null
	targetElementId?: string | null
	offset: number
	shouldShow?: (point: ConnectionPoint | null) => boolean
}

function hideContainer(container: HTMLDivElement | null): void {
	if (!container) return
	container.style.opacity = "0"
	container.style.pointerEvents = "none"
}

export default function useConnectionPositionEffect(options: UseConnectionPositionEffectOptions) {
	const { connectionId, sourceElementId, targetElementId, offset, shouldShow } = options
	const { canvas } = useCanvas()
	const containerRef = useRef<HTMLDivElement | null>(null)
	const containerSize = useSize(containerRef)
	const pointRef = useRef<ConnectionPoint | null>(null)

	const resolveConnectionPoint = useCallback((): ConnectionPoint | null => {
		if (!canvas || !connectionId) return null

		const connection =
			canvas.connectionManager.getConnections().find((item) => item.id === connectionId) ??
			null
		const sourceId = connection?.sourceElementId ?? sourceElementId
		const targetId = connection?.targetElementId ?? targetElementId
		if (!sourceId || !targetId) return null

		const sourceRect = canvas.geometryCacheManager.getElementBounds(sourceId)
		const targetRect = canvas.geometryCacheManager.getElementBounds(targetId)
		const geometry = resolveConnectionGeometry(sourceRect, targetRect)
		if (!geometry) return null

		return getConnectionGeometryPointAt(geometry, 0.5)
	}, [canvas, connectionId, sourceElementId, targetElementId])

	const updatePosition = useCallback(
		(point: ConnectionPoint | null) => {
			const container = containerRef.current
			const shouldDisplay = shouldShow ? shouldShow(point) : true

			if (!container || !canvas || !point || !containerSize || !shouldDisplay) {
				hideContainer(container)
				return
			}

			const stage = canvas.getStage()
			const stageScale = stage.scaleX()
			const stageX = stage.x()
			const stageY = stage.y()
			const screenX = point.x * stageScale + stageX
			const screenY = point.y * stageScale + stageY
			const left = screenX - containerSize.width / 2
			const top = screenY + offset

			container.style.transform = `translate(${left}px, ${top}px)`
			container.style.opacity = "1"
			container.style.pointerEvents = "auto"
		},
		[canvas, containerSize, offset, shouldShow],
	)

	useEffect(() => {
		if (!canvas || !connectionId) {
			pointRef.current = null
			updatePosition(null)
			return
		}

		const updateFromConnection = () => {
			const point = resolveConnectionPoint()
			pointRef.current = point
			updatePosition(point)
		}
		const updateFromCachedPoint = () => {
			updatePosition(pointRef.current)
		}

		updateFromConnection()

		const unsubscribeList = [
			canvas.eventEmitter.on("canvas:resize", updateFromCachedPoint),
			canvas.eventEmitter.on("viewport:scale", updateFromCachedPoint),
			canvas.eventEmitter.on("viewport:pan", updateFromCachedPoint),
			canvas.eventEmitter.on("document:loaded", updateFromConnection),
			canvas.eventEmitter.on("document:restored", updateFromConnection),
			canvas.eventEmitter.on("connection:change", updateFromConnection),
			canvas.eventEmitter.on("element:change", updateFromConnection),
			canvas.eventEmitter.on("element:updated", updateFromConnection),
			canvas.eventEmitter.on("element:rerendered", updateFromConnection),
			canvas.eventEmitter.on("element:deleted", updateFromConnection),
			canvas.eventEmitter.on("element:batchupdated", updateFromConnection),
			canvas.eventEmitter.on("element:batchdeleted", updateFromConnection),
			canvas.eventEmitter.on("elements:transform:dragmove", updateFromConnection),
			canvas.eventEmitter.on("elements:transform:anchorDragmove", updateFromConnection),
		]

		return () => {
			unsubscribeList.forEach((unsubscribe) => unsubscribe())
		}
	}, [canvas, connectionId, resolveConnectionPoint, updatePosition])

	useEffect(() => {
		updatePosition(pointRef.current)
	}, [containerSize, updatePosition])

	return {
		containerRef,
	}
}
