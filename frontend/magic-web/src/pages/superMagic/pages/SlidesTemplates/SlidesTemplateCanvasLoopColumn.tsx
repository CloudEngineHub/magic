import { animate as animateMotion, useMotionValue, useTransform } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type { TemplateCanvasItem } from "./canvasLayout"
import { EAGER_TEMPLATE_COVER_COUNT, type SlidesTemplateCanvasTile } from "./canvasInteraction"
import SlidesTemplateCanvasTileItem from "./SlidesTemplateCanvasTileItem"
import type { SlidesTemplateCanvasIdleLoop } from "./canvasIdleLoop"

export interface SlidesTemplateCanvasColumnItem {
	canvasItem: TemplateCanvasItem<SlidesTemplateCanvasTile>
	visibleIndex: number
}

interface SlidesTemplateCanvasLoopColumnProps {
	focusedAnchorTileId: string
	idleLoop: SlidesTemplateCanvasIdleLoop | null
	isIdleAnimationActive: boolean
	items: SlidesTemplateCanvasColumnItem[]
	onPreviewClick: (anchorTileId: string, tile: SlidesTemplateCanvasTile) => void
	onTemplateSelect: (template: OptionItem) => void
	reduceMotion: boolean
	selectedTemplateValue: string
	shouldPlayIntro: boolean
}

export default function SlidesTemplateCanvasLoopColumn({
	focusedAnchorTileId,
	idleLoop,
	isIdleAnimationActive,
	items,
	onPreviewClick,
	onTemplateSelect,
	reduceMotion,
	selectedTemplateValue,
	shouldPlayIntro,
}: SlidesTemplateCanvasLoopColumnProps) {
	const loopEndY = idleLoop ? idleLoop.direction * idleLoop.distance : 0
	const loopY = useMotionValue(0)
	const duplicateLoopY = useTransform(loopY, (currentY) => currentY - loopEndY)
	const loopAnimationRef = useRef<ReturnType<typeof animateMotion> | null>(null)
	const hasLoopStartedRef = useRef(false)
	const [showLoopOverlay, setShowLoopOverlay] = useState(false)
	const canAnimateIdleLoop = Boolean(idleLoop) && !reduceMotion
	const isLoopRunning = isIdleAnimationActive && canAnimateIdleLoop

	useEffect(() => {
		loopAnimationRef.current?.stop()
		loopAnimationRef.current = null

		if (!idleLoop || !canAnimateIdleLoop) {
			loopY.set(0)
			hasLoopStartedRef.current = false
			setShowLoopOverlay(false)
			return
		}

		if (!showLoopOverlay) {
			if (!isLoopRunning) return
			setShowLoopOverlay(true)
			return
		}

		if (!isLoopRunning) return

		function startFullLoop(delay = 0) {
			loopY.set(0)
			hasLoopStartedRef.current = true
			loopAnimationRef.current = animateMotion(loopY, loopEndY, {
				delay,
				duration: idleLoop.duration,
				ease: "linear",
				repeat: Number.POSITIVE_INFINITY,
			})
		}

		const currentY = loopY.get()
		if (Math.abs(currentY) < 0.5) {
			startFullLoop(hasLoopStartedRef.current ? 0 : idleLoop.delay)
			return () => loopAnimationRef.current?.stop()
		}

		const remainingRatio = Math.min(1, Math.abs(loopEndY - currentY) / idleLoop.distance)
		loopAnimationRef.current = animateMotion(loopY, loopEndY, {
			duration: idleLoop.duration * remainingRatio,
			ease: "linear",
			onComplete: () => startFullLoop(),
		})

		return () => loopAnimationRef.current?.stop()
	}, [canAnimateIdleLoop, idleLoop, isLoopRunning, loopEndY, loopY, showLoopOverlay])

	const loopState = idleLoop
		? {
				duplicateY: duplicateLoopY,
				isRunning: isLoopRunning,
				show: showLoopOverlay,
				y: loopY,
			}
		: undefined

	return items.map(({ canvasItem, visibleIndex }) => {
		const { grid, item: tile, position, size } = canvasItem
		const anchorTileId = `${tile.id}:${grid.x}:${grid.y}`

		return (
			<SlidesTemplateCanvasTileItem
				key={anchorTileId}
				anchorTileId={anchorTileId}
				column={grid.x}
				tile={tile}
				position={position}
				reduceMotion={reduceMotion}
				size={size}
				imageLoading={visibleIndex < EAGER_TEMPLATE_COVER_COUNT ? "eager" : "lazy"}
				focusedAnchorTileId={focusedAnchorTileId}
				loopState={loopState}
				selectedTemplateValue={selectedTemplateValue}
				onTemplateSelect={onTemplateSelect}
				onPreviewClick={onPreviewClick}
				shouldPlayIntro={shouldPlayIntro}
				visibleIndex={visibleIndex}
			/>
		)
	})
}
