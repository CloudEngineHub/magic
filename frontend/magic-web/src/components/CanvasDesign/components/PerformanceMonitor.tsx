import { useEffect, useRef, useState } from "react"
import { useCanvas } from "../context/CanvasContext"
import { ElementTypeEnum } from "../canvas/types"
import type { Canvas } from "../canvas/Canvas"
import type { CanvasEventMap } from "../canvas/EventEmitter"
import styles from "./PerformanceMonitor.module.css"

export const ENABLE_CANVAS_PERFORMANCE_MONITOR = false

const SAMPLE_INTERVAL_MS = 1000
const LONG_FRAME_MS = 50

const MONITORED_EVENTS = [
	"element:change",
	"element:rerendered",
	"element:dragmove",
	"elements:transform:dragmove",
	"elements:transform:anchorDragmove",
	"viewport:pan",
	"viewport:scale",
	"resource:image:loaded",
	"resource:image:load-failed",
] as const satisfies readonly (keyof CanvasEventMap)[]

type MonitoredEvent = (typeof MONITORED_EVENTS)[number]
type EventCounters = Record<MonitoredEvent, number>

interface CanvasPerformanceSnapshot {
	fps: number
	longFrames: number
	totalElements: number
	imageElements: number
	videoElements: number
	konvaNodes: number
	jsHeapUsedBytes: number | null
	jsHeapLimitBytes: number | null
	imageResourceEntries: number
	imageResourcesLoaded: number
	imageResourcesLoading: number
	imageResourceFailures: number
	imageDecodedBytes: number
	estimatedNativeImageBytes: number
	listeners: {
		elementChange: number
		imageLoaded: number
	}
	eventsPerSecond: EventCounters
}

type PerformanceWithMemory = Performance & {
	memory?: {
		usedJSHeapSize: number
		jsHeapSizeLimit: number
	}
}

function now() {
	return typeof performance === "undefined" ? Date.now() : performance.now()
}

function createEventCounters(): EventCounters {
	return MONITORED_EVENTS.reduce((acc, eventName) => {
		acc[eventName] = 0
		return acc
	}, {} as EventCounters)
}

function formatBytes(bytes: number | null): string {
	if (bytes === null || !Number.isFinite(bytes)) return "-"
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function countKonvaNodes(node: unknown): number {
	if (!node) return 0
	const children =
		typeof (node as { getChildren?: () => unknown[] }).getChildren === "function"
			? (node as { getChildren: () => unknown[] }).getChildren()
			: []
	return 1 + children.reduce<number>((sum, child) => sum + countKonvaNodes(child), 0)
}

function getJsHeapSnapshot() {
	const memory = (performance as PerformanceWithMemory | undefined)?.memory
	return {
		jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
		jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
	}
}

function buildSnapshot(
	canvas: Canvas,
	fps: number,
	longFrames: number,
	eventsPerSecond: EventCounters,
): CanvasPerformanceSnapshot {
	const elements = Object.values(canvas.elementManager.getElementsDict())
	const imageResources = canvas.imageResourceManager.getDebugSnapshot()

	let imageElements = 0
	let videoElements = 0

	for (const element of elements) {
		if (element.type === ElementTypeEnum.Image) imageElements += 1
		if (element.type === ElementTypeEnum.Video) videoElements += 1
	}

	return {
		fps,
		longFrames,
		totalElements: elements.length,
		imageElements,
		videoElements,
		konvaNodes: countKonvaNodes(canvas.stage),
		...getJsHeapSnapshot(),
		imageResourceEntries: imageResources.entries,
		imageResourcesLoaded: imageResources.loaded,
		imageResourcesLoading: imageResources.loading + imageResources.exchanging,
		imageResourceFailures: imageResources.failed,
		imageDecodedBytes: imageResources.estimatedDecodedBytes,
		estimatedNativeImageBytes: imageResources.estimatedNativeBytes,
		listeners: {
			elementChange: canvas.eventEmitter.listenerCount("element:change"),
			imageLoaded: canvas.eventEmitter.listenerCount("resource:image:loaded"),
		},
		eventsPerSecond,
	}
}

function getFpsClassName(fps: number) {
	if (fps >= 50) return styles.ok
	if (fps >= 30) return styles.warn
	return styles.bad
}

function getMemoryClassName(bytes: number) {
	if (bytes >= 768 * 1024 * 1024) return styles.bad
	if (bytes >= 384 * 1024 * 1024) return styles.warn
	return styles.value
}

export default function CanvasPerformanceMonitor() {
	const { canvas } = useCanvas()
	const [snapshot, setSnapshot] = useState<CanvasPerformanceSnapshot | null>(null)
	const eventSamplesRef = useRef<EventCounters>(createEventCounters())
	const fpsRef = useRef(0)
	const longFramesRef = useRef(0)

	useEffect(() => {
		if (!canvas) {
			setSnapshot(null)
			return
		}

		let frameId: number | null = null
		let frameCount = 0
		let lastFrameAt = now()
		let lastFpsSampleAt = now()

		const recordEvent = (eventName: MonitoredEvent) => {
			eventSamplesRef.current[eventName] += 1
		}

		const unsubscribers = MONITORED_EVENTS.map((eventName) =>
			canvas.eventEmitter.on(eventName, () => recordEvent(eventName)),
		)

		const tick = () => {
			const currentTime = now()
			const frameDelta = currentTime - lastFrameAt
			frameCount += 1

			if (frameDelta > LONG_FRAME_MS) {
				longFramesRef.current += 1
			}

			if (currentTime - lastFpsSampleAt >= SAMPLE_INTERVAL_MS) {
				fpsRef.current = Math.round((frameCount * 1000) / (currentTime - lastFpsSampleAt))
				frameCount = 0
				lastFpsSampleAt = currentTime
			}

			lastFrameAt = currentTime
			frameId = requestAnimationFrame(tick)
		}

		frameId = requestAnimationFrame(tick)

		const intervalId = window.setInterval(() => {
			const eventSamples = eventSamplesRef.current
			eventSamplesRef.current = createEventCounters()
			setSnapshot(buildSnapshot(canvas, fpsRef.current, longFramesRef.current, eventSamples))
		}, SAMPLE_INTERVAL_MS)

		setSnapshot(
			buildSnapshot(canvas, fpsRef.current, longFramesRef.current, createEventCounters()),
		)

		return () => {
			unsubscribers.forEach((unsubscribe) => unsubscribe())
			window.clearInterval(intervalId)
			if (frameId !== null) cancelAnimationFrame(frameId)
		}
	}, [canvas])

	if (!snapshot) return null

	return (
		<div className={styles.performanceMonitor} data-canvas-ui-component>
			<div className={styles.header}>
				<span>Canvas perf</span>
				<span className={getFpsClassName(snapshot.fps)}>{snapshot.fps} fps</span>
			</div>

			<div className={styles.section}>
				<Row label="long frames" value={snapshot.longFrames} />
				<Row label="elements" value={snapshot.totalElements} />
				<Row
					label="images / videos"
					value={`${snapshot.imageElements} / ${snapshot.videoElements}`}
				/>
				<Row label="konva nodes" value={snapshot.konvaNodes} />
			</div>

			<div className={styles.section}>
				<Row
					label="image decoded"
					value={formatBytes(snapshot.imageDecodedBytes)}
					valueClassName={getMemoryClassName(snapshot.imageDecodedBytes)}
				/>
				<Row
					label="image native est"
					value={formatBytes(snapshot.estimatedNativeImageBytes)}
					valueClassName={getMemoryClassName(snapshot.estimatedNativeImageBytes)}
				/>
				<Row
					label="js heap"
					value={`${formatBytes(snapshot.jsHeapUsedBytes)} / ${formatBytes(snapshot.jsHeapLimitBytes)}`}
				/>
				<Row
					label="resources"
					value={`${snapshot.imageResourcesLoaded}/${snapshot.imageResourceEntries} ready`}
				/>
				<Row
					label="loading / failed"
					value={`${snapshot.imageResourcesLoading} / ${snapshot.imageResourceFailures}`}
				/>
			</div>

			<div className={styles.section}>
				<Row label="element change/s" value={snapshot.eventsPerSecond["element:change"]} />
				<Row label="rerender/s" value={snapshot.eventsPerSecond["element:rerendered"]} />
				<Row label="drag move/s" value={snapshot.eventsPerSecond["element:dragmove"]} />
				<Row
					label="transform move/s"
					value={snapshot.eventsPerSecond["elements:transform:dragmove"]}
				/>
				<Row label="viewport pan/s" value={snapshot.eventsPerSecond["viewport:pan"]} />
				<Row label="viewport scale/s" value={snapshot.eventsPerSecond["viewport:scale"]} />
				<Row
					label="image load/s"
					value={snapshot.eventsPerSecond["resource:image:loaded"]}
				/>
			</div>

			<div className={styles.section}>
				<Row
					label="listeners change/img"
					value={`${snapshot.listeners.elementChange} / ${snapshot.listeners.imageLoaded}`}
				/>
			</div>
		</div>
	)
}

function Row({
	label,
	value,
	valueClassName,
}: {
	label: string
	value: string | number
	valueClassName?: string
}) {
	return (
		<div className={styles.row}>
			<span className={styles.label}>{label}</span>
			<span className={valueClassName ?? styles.value}>{value}</span>
		</div>
	)
}
