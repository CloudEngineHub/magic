import { AnimatePresence, motion, type MotionValue } from "framer-motion"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { type TemplateCanvasPoint, type TemplateCanvasSize } from "./canvasLayout"
import {
	type SlidesTemplateCanvasTile,
	getTemplateKey,
	getTemplatePreviewUrls,
} from "./canvasInteraction"
import { getFeaturedSlidesTemplateTag } from "@/pages/superMagic/components/MainInputContainer/panels/slides-preset/templateMeta"
import SlidesTemplateCoverTile from "./SlidesTemplateCoverTile"

export interface SlidesTemplateCanvasTileLoopState {
	duplicateY: MotionValue<number>
	isRunning: boolean
	show: boolean
	y: MotionValue<number>
}

interface SlidesTemplateCanvasTileItemProps {
	anchorTileId: string
	column: number
	focusedAnchorTileId: string
	imageLoading?: "eager" | "lazy"
	loopState?: SlidesTemplateCanvasTileLoopState
	onPreviewClick: (anchorTileId: string, tile: SlidesTemplateCanvasTile) => void
	onTemplateSelect: (template: OptionItem) => void
	position: TemplateCanvasPoint
	reduceMotion: boolean
	selectedTemplateValue: string
	shouldPlayIntro: boolean
	size: TemplateCanvasSize
	tile: SlidesTemplateCanvasTile
	visibleIndex: number
}

export default function SlidesTemplateCanvasTileItem({
	anchorTileId,
	column,
	focusedAnchorTileId,
	imageLoading,
	loopState,
	onPreviewClick,
	onTemplateSelect,
	position,
	reduceMotion,
	selectedTemplateValue,
	shouldPlayIntro,
	size,
	tile,
	visibleIndex,
}: SlidesTemplateCanvasTileItemProps) {
	const value = getTemplateKey(tile.template)
	const isExpanded = focusedAnchorTileId === anchorTileId
	const isFeatured = Boolean(getFeaturedSlidesTemplateTag(tile.template))
	const previewImageUrls = getTemplatePreviewUrls(tile.template)
	const introDelay = Math.min(visibleIndex * 0.018, 0.3)
	const showLoopOverlay = Boolean(loopState?.show) && !reduceMotion
	const isLoopRunning = Boolean(loopState?.isRunning) && !reduceMotion

	function renderCover() {
		return (
			<SlidesTemplateCoverTile
				template={tile.template}
				imageUrl={tile.imageUrl}
				imageLoading={imageLoading}
				isSelected={selectedTemplateValue === value}
				isExpanded={isExpanded}
				canPreview={previewImageUrls.length > 0}
				onSelect={onTemplateSelect}
				onPreviewClick={() => onPreviewClick(anchorTileId, tile)}
			/>
		)
	}

	function renderLoopCover(isDuplicate: boolean) {
		return (
			<div data-testid="slides-template-loop-cover" className="pointer-events-auto size-full">
				<SlidesTemplateCoverTile
					template={tile.template}
					imageUrl={tile.imageUrl}
					imageLoading="lazy"
					isKeyboardAccessible={!isDuplicate}
					isSelected={selectedTemplateValue === value}
					isExpanded={isExpanded}
					canPreview={previewImageUrls.length > 0}
					onSelect={onTemplateSelect}
					onPreviewClick={() => onPreviewClick(anchorTileId, tile)}
				/>
			</div>
		)
	}

	return (
		<div
			data-slides-template-canvas-item="true"
			data-testid="slides-template-canvas-tile-item"
			className="absolute [contain:layout_style]"
			style={{
				height: size.height,
				transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`,
				width: size.width,
				zIndex: isExpanded
					? 30
					: selectedTemplateValue === value
						? 20
						: isFeatured
							? 10
							: 1,
			}}
		>
			<motion.div
				className="size-full"
				data-testid="slides-template-static-cover"
				data-slides-template-idle-animation={isLoopRunning ? "true" : "false"}
				initial={
					shouldPlayIntro && !reduceMotion
						? { opacity: 0, scale: 0.985, y: 14 + (Math.abs(column) % 2) * 6 }
						: false
				}
				animate={{ opacity: showLoopOverlay ? 0 : 1, scale: 1, y: 0 }}
				aria-hidden={showLoopOverlay || undefined}
				style={{
					pointerEvents: showLoopOverlay ? "none" : undefined,
					willChange:
						shouldPlayIntro || showLoopOverlay ? "transform, opacity" : undefined,
				}}
				transition={{
					opacity: { duration: 0.42, delay: shouldPlayIntro ? introDelay : 0 },
					scale: {
						duration: 0.56,
						delay: shouldPlayIntro ? introDelay : 0,
						ease: [0.22, 1, 0.36, 1],
					},
					y: {
						duration: shouldPlayIntro ? 0.62 : 0.45,
						delay: shouldPlayIntro ? introDelay : 0,
						ease: [0.22, 1, 0.36, 1],
					},
				}}
			>
				{renderCover()}
			</motion.div>
			<AnimatePresence>
				{showLoopOverlay && loopState ? (
					<motion.div
						key="idle-column-loop"
						className="pointer-events-none absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
					>
						<motion.div
							className="absolute inset-0 will-change-transform"
							style={{ y: loopState.y }}
						>
							{renderLoopCover(false)}
						</motion.div>
						<motion.div
							className="absolute inset-0 will-change-transform"
							style={{ y: loopState.duplicateY }}
						>
							{renderLoopCover(true)}
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	)
}
