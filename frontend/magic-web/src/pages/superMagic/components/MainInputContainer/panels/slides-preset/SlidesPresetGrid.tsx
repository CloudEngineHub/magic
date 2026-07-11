import { useCallback, useEffect, useRef, useState, type UIEvent } from "react"
import { observer } from "mobx-react-lite"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { OptionItem } from "../types"
import { localeTextToDisplayString } from "../utils"
import SlidesPresetCard from "./SlidesPresetCard"
import SlidesPresetPreviewDialog from "./SlidesPresetPreviewDialog"
import { useFinePointerHover } from "./useFinePointerHover"

interface SlidesPresetGridProps {
	selectedTemplate?: OptionItem
	templates: OptionItem[]
	onTemplateClick?: (template: OptionItem) => void
	className?: string
	isLoading?: boolean
	isRefreshing?: boolean
	isLoadingMore?: boolean
	hasMore?: boolean
	onLoadMore?: () => void
	onPreviewOpenChange?: (open: boolean) => void
	showHoverDetails?: boolean
	hoverDetailsContainer?: HTMLElement | null
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.08,
			delayChildren: 0.1,
		},
	},
}

const itemVariants = {
	hidden: {
		opacity: 0,
		y: 40,
		scale: 0.85,
		rotateX: 10,
	},
	visible: {
		opacity: 1,
		y: 0,
		scale: 1,
		rotateX: 0,
		transition: {
			type: "spring" as const,
			stiffness: 280,
			damping: 20,
			mass: 0.8,
			duration: 0.5,
		},
	},
}

const hoverAnimation = { scale: 1.03, y: -4, zIndex: 40 }

const SlidesPresetGrid = observer(
	({
		selectedTemplate,
		templates,
		onTemplateClick,
		className,
		isLoading = false,
		isRefreshing = false,
		isLoadingMore = false,
		hasMore = false,
		onLoadMore,
		onPreviewOpenChange,
		showHoverDetails = true,
		hoverDetailsContainer,
	}: SlidesPresetGridProps) => {
		const { t } = useTranslation("crew/create")
		const [previewTemplate, setPreviewTemplate] = useState<OptionItem | null>(null)
		const [preloadedPreviewTemplate, setPreloadedPreviewTemplate] = useState<OptionItem | null>(
			null,
		)
		const gridRef = useRef<HTMLDivElement>(null)
		const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
		const scrollLoadRequestedRef = useRef(false)
		const canUseHoverPreview = useFinePointerHover()
		const isPreviewOpen = Boolean(previewTemplate)

		useEffect(() => {
			if (isLoadingMore) return
			scrollLoadRequestedRef.current = false
		}, [hasMore, isLoadingMore, templates.length])

		useEffect(() => {
			onPreviewOpenChange?.(isPreviewOpen)
		}, [isPreviewOpen, onPreviewOpenChange])

		useEffect(() => {
			return () => {
				onPreviewOpenChange?.(false)
			}
		}, [onPreviewOpenChange])

		function handlePreviewOpenChange(open: boolean) {
			if (open) return
			setPreviewTemplate(null)
		}

		function handlePreviewPreload(template: OptionItem) {
			if (!template.preview_url) return
			setPreloadedPreviewTemplate(template)
		}

		const preloadedPreviewUrl = preloadedPreviewTemplate?.preview_url
		const openedPreviewUrl = previewTemplate?.preview_url
		const selectedTemplateValue = localeTextToDisplayString(selectedTemplate?.value)
		const showEmptyState = !isLoading && templates.length === 0

		const requestLoadMore = useCallback(() => {
			if (
				!hasMore ||
				isLoading ||
				isRefreshing ||
				isLoadingMore ||
				scrollLoadRequestedRef.current ||
				!onLoadMore
			) {
				return
			}

			scrollLoadRequestedRef.current = true
			onLoadMore()
		}, [hasMore, isLoading, isRefreshing, isLoadingMore, onLoadMore])

		useEffect(() => {
			const sentinel = loadMoreSentinelRef.current
			if (
				!sentinel ||
				!hasMore ||
				isLoading ||
				isRefreshing ||
				isLoadingMore ||
				!onLoadMore
			) {
				return
			}

			const grid = gridRef.current
			const root = grid && grid.scrollHeight > grid.clientHeight + 1 ? grid : null
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						requestLoadMore()
					}
				},
				{
					root,
					rootMargin: "0px 0px 160px 0px",
				},
			)

			observer.observe(sentinel)

			return () => {
				observer.disconnect()
			}
		}, [
			hasMore,
			isLoading,
			isRefreshing,
			isLoadingMore,
			onLoadMore,
			requestLoadMore,
			templates.length,
		])

		function handleScroll(event: UIEvent<HTMLDivElement>) {
			const target = event.currentTarget
			const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
			if (distanceToBottom <= 96) {
				requestLoadMore()
			}
		}

		return (
			<>
				<motion.div
					ref={gridRef}
					data-testid="slides-preset-grid"
					className={cn(
						"scrollbar-hide relative grid w-full grid-cols-2 content-start gap-4 overflow-y-auto overflow-x-hidden p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
						className,
					)}
					variants={containerVariants}
					initial="hidden"
					animate="visible"
					onScroll={handleScroll}
				>
					{isRefreshing && templates.length > 0 ? (
						<div
							className="pointer-events-none absolute right-4 top-3 z-30 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
							data-testid="slides-preset-grid-refreshing"
						>
							{t("playbook.edit.presets.form.refreshing")}
						</div>
					) : null}
					{isLoading && templates.length === 0 ? (
						<div
							className="col-span-full flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
							data-testid="slides-preset-grid-loading"
						>
							{t("playbook.edit.presets.form.loading")}
						</div>
					) : null}
					{showEmptyState ? (
						<div
							className="col-span-full flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
							data-testid="slides-preset-grid-empty"
						>
							{t("playbook.edit.presets.form.emptySlidesTemplates")}
						</div>
					) : null}
					{templates.map((template) => {
						const value = localeTextToDisplayString(template.value)

						return (
							<motion.div
								key={value}
								variants={itemVariants}
								whileInView="visible"
								initial="hidden"
								viewport={{ once: true, amount: 0.1 }}
								whileHover={canUseHoverPreview ? hoverAnimation : undefined}
								transition={{ type: "spring", stiffness: 300, damping: 20 }}
								className={cn(
									"relative flex size-full [contain-intrinsic-size:260px] [content-visibility:auto]",
									canUseHoverPreview && "will-change-transform",
								)}
							>
								<SlidesPresetCard
									template={template}
									isSelected={selectedTemplateValue === value}
									onClick={onTemplateClick}
									onPreviewClick={setPreviewTemplate}
									onPreviewPreload={handlePreviewPreload}
									canUseHoverPreview={canUseHoverPreview}
									showHoverDetails={showHoverDetails}
									hoverDetailsContainer={hoverDetailsContainer}
								/>
							</motion.div>
						)
					})}
					{hasMore ? (
						<div
							ref={loadMoreSentinelRef}
							className="col-span-full h-px"
							aria-hidden="true"
							data-testid="slides-preset-grid-load-more-sentinel"
						/>
					) : null}
					{templates.length > 0 && isLoadingMore ? (
						<div
							className="col-span-full flex items-center justify-center px-4 py-3 text-sm text-muted-foreground"
							data-testid="slides-preset-grid-loading-more"
						>
							{t("playbook.edit.presets.form.loadingMore")}
						</div>
					) : null}
				</motion.div>
				{preloadedPreviewUrl && preloadedPreviewUrl !== openedPreviewUrl ? (
					<iframe
						data-testid="slides-preset-preview-preload-iframe"
						title="Preload slide preset preview"
						src={preloadedPreviewUrl}
						className="pointer-events-none fixed size-px opacity-0"
						aria-hidden="true"
						tabIndex={-1}
						referrerPolicy="no-referrer"
						sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
					/>
				) : null}
				<SlidesPresetPreviewDialog
					template={previewTemplate}
					open={isPreviewOpen}
					onOpenChange={handlePreviewOpenChange}
					onSelect={onTemplateClick}
				/>
			</>
		)
	},
)

SlidesPresetGrid.displayName = "SlidesPresetGrid"

export default SlidesPresetGrid
