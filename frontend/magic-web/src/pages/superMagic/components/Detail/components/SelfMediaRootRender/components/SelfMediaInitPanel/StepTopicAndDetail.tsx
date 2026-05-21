import { useState, useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import type { ArticleDetail, SelfMediaInitGlobalSettings } from "./types"
import {
	generateTopics,
	generateTopicsWithDetails,
	parseOutlineFromText,
} from "../../services/selfMediaAiGenerate"
import type { GeneratedTopic } from "../../services/selfMediaAiGenerate"
import type { SelfMediaPlatform } from "../../../../types"
import type { SelfMediaFileStorageService } from "../../services/SelfMediaFileStorageService"
import {
	Sparkles,
	Plus,
	Layers,
	ChevronLeft,
	ChevronRight,
	Trash2,
	Inbox,
	FileDown,
	Folder,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipProvider,
} from "@/components/shadcn-ui/tooltip"
import AiTopicAssistant from "./AiTopicAssistant"
import ArticleCard from "./ArticleCard"
import InlineVoiceButton from "./InlineVoiceButton"

interface StepTopicAndDetailProps {
	articles: ArticleDetail[]
	onChange: (articles: ArticleDetail[]) => void
	onArticleUpdate: (index: number, article: ArticleDetail) => void
	globalSettings: SelfMediaInitGlobalSettings
	onPersistDraft?: () => void
	fileStorageService?: SelfMediaFileStorageService | null
}

function createEmptyArticle(): ArticleDetail {
	return {
		title: "",
		folderName: "",
		style: "professional",
		outline: [],
		cardCount: 6,
		materials: [],
		notes: "",
		platform: "rednote",
	}
}

function createArticleFromTopic(topic: GeneratedTopic): ArticleDetail {
	return {
		title: topic.title,
		folderName: "",
		style: "professional",
		outline: [],
		cardCount: 6,
		materials: [],
		notes: topic.description,
		platform: "rednote",
	}
}

// Helper to check if click/touch is on interactive elements
function isInteractiveElement(target: HTMLElement | null): boolean {
	if (!target) return false
	let el: HTMLElement | null = target
	while (el) {
		const tagName = el.tagName.toLowerCase()
		if (
			tagName === "input" ||
			tagName === "textarea" ||
			tagName === "button" ||
			tagName === "select" ||
			tagName === "a" ||
			el.getAttribute("role") === "button" ||
			el.classList.contains("cursor-pointer") ||
			el.classList.contains("no-swipe") ||
			el.hasAttribute("contenteditable") ||
			// Avoid swiping when editing material list or outline lists
			el.closest(".outline-node-item") ||
			el.closest(".editor-card")
		) {
			return true
		}
		el = el.parentElement
	}
	return false
}

export default function StepTopicAndDetail({
	articles,
	onChange,
	onArticleUpdate,
	globalSettings,
	onPersistDraft,
	fileStorageService,
}: StepTopicAndDetailProps) {
	const [showAiPanel, setShowAiPanel] = useState(true)
	const [activeIndex, setActiveIndex] = useState(0)
	const [slideDirection, setSlideDirection] = useState<"left" | "right">("left")
	const { t } = useTranslation("super")
	const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)

	// Clamp activeIndex when articles count changes
	const safeActiveIndex = Math.min(Math.max(0, activeIndex), Math.max(0, articles.length - 1))

	const handleAdd = useCallback(() => {
		const newArticle = createEmptyArticle()
		onChange([...articles, newArticle])
		setActiveIndex(articles.length) // Focus on the newly added article
		setSlideDirection("left")
	}, [articles, onChange])

	const handleRemove = useCallback(
		(index: number) => {
			const updated = articles.filter((_, i) => i !== index)
			onChange(updated)
			// Adjust active index
			if (safeActiveIndex >= updated.length && updated.length > 0) {
				setActiveIndex(updated.length - 1)
			}
		},
		[articles, onChange, safeActiveIndex],
	)

	const handlePrevArticle = useCallback(() => {
		if (safeActiveIndex > 0) {
			setSlideDirection("right")
			setActiveIndex(safeActiveIndex - 1)
		}
	}, [safeActiveIndex])

	const handleNextArticle = useCallback(() => {
		if (safeActiveIndex < articles.length - 1) {
			setSlideDirection("left")
			setActiveIndex(safeActiveIndex + 1)
		}
	}, [safeActiveIndex, articles.length])

	// 1. Swipe and Drag States
	const [dragOffset, setDragOffset] = useState(0)
	const [isDragging, setIsDragging] = useState(false)
	const startXRef = useRef(0)
	const startYRef = useRef(0)
	const isDragEligibleRef = useRef(false)
	const isDraggingRef = useRef(false)
	const dragOffsetRef = useRef(0)

	// Keep references of crucial changing values to prevent closure staleness in window listeners
	const activeIndexRef = useRef(safeActiveIndex)
	const articlesCountRef = useRef(articles.length)

	useEffect(() => {
		activeIndexRef.current = safeActiveIndex
		articlesCountRef.current = articles.length
	}, [safeActiveIndex, articles.length])

	// Event: mousedown/touchstart
	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		if (e.button !== 0) return // Only left-clicks
		if (isInteractiveElement(e.target as HTMLElement)) return

		startXRef.current = e.clientX
		startYRef.current = e.clientY
		isDragEligibleRef.current = true
		isDraggingRef.current = false
		dragOffsetRef.current = 0
	}, [])

	const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
		if (isInteractiveElement(e.target as HTMLElement)) return

		const touch = e.touches[0]
		startXRef.current = touch.clientX
		startYRef.current = touch.clientY
		isDragEligibleRef.current = true
		isDraggingRef.current = false
		dragOffsetRef.current = 0
	}, [])

	// Setup window drag-and-swipe event listeners
	useEffect(() => {
		const handleMove = (clientX: number, clientY: number) => {
			if (!isDragEligibleRef.current) return

			const diffX = clientX - startXRef.current
			const diffY = clientY - startYRef.current

			if (!isDraggingRef.current) {
				// We need a minimum drag threshold to initiate a drag sequence (prevent click-triggering)
				if (Math.abs(diffX) > 10) {
					// Check if drag is primarily vertical. If so, let normal vertical scrolling happen.
					if (Math.abs(diffY) > Math.abs(diffX)) {
						isDragEligibleRef.current = false
						return
					}
					// Check horizontal swipe gesture threshold
					if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
						isDraggingRef.current = true
						setIsDragging(true)
					}
				}
			}

			if (isDraggingRef.current) {
				let offset = diffX
				const activeIdx = activeIndexRef.current
				const totalCount = articlesCountRef.current

				// Elastic boundary resistance when there is no prev/next article
				if (offset > 0 && activeIdx === 0) {
					offset = Math.pow(offset, 0.85) // apply rubberband compression
				} else if (offset < 0 && activeIdx === totalCount - 1) {
					offset = -Math.pow(-offset, 0.85)
				}

				dragOffsetRef.current = offset
				setDragOffset(offset)
			}
		}

		const handleEnd = () => {
			if (!isDragEligibleRef.current) return

			if (isDraggingRef.current) {
				const finalOffset = dragOffsetRef.current
				const activeIdx = activeIndexRef.current
				const totalCount = articlesCountRef.current
				const swipeThreshold = 80 // px threshold to trigger page transition

				if (finalOffset > swipeThreshold && activeIdx > 0) {
					handlePrevArticle()
				} else if (finalOffset < -swipeThreshold && activeIdx < totalCount - 1) {
					handleNextArticle()
				}
			}

			isDragEligibleRef.current = false
			isDraggingRef.current = false
			dragOffsetRef.current = 0
			setIsDragging(false)
			setDragOffset(0)
		}

		const handleMouseMove = (e: MouseEvent) => {
			handleMove(e.clientX, e.clientY)
		}

		const handleTouchMove = (e: TouchEvent) => {
			// Prevent native scroll/overscroll effects when actively swiping horizontally
			if (isDraggingRef.current) {
				if (e.cancelable) {
					e.preventDefault()
				}
			}
			const touch = e.touches[0]
			handleMove(touch.clientX, touch.clientY)
		}

		window.addEventListener("mousemove", handleMouseMove)
		window.addEventListener("mouseup", handleEnd)
		window.addEventListener("touchmove", handleTouchMove, { passive: false })
		window.addEventListener("touchend", handleEnd)

		return () => {
			window.removeEventListener("mousemove", handleMouseMove)
			window.removeEventListener("mouseup", handleEnd)
			window.removeEventListener("touchmove", handleTouchMove)
			window.removeEventListener("touchend", handleEnd)
		}
	}, [handlePrevArticle, handleNextArticle])

	// 2. Trackpad / Scroll Wheel Horizontal Swipe Gesture Support
	const rightColRef = useRef<HTMLDivElement | null>(null)
	const wheelAccumulatorRef = useRef(0)
	const isWheelLockedRef = useRef(false)
	const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		const rightCol = rightColRef.current
		if (!rightCol) return

		const handleWheelEvent = (e: WheelEvent) => {
			// Only horizontal wheel movements
			if (Math.abs(e.deltaX) < 4) return

			// Clear any existing reset timer
			if (wheelTimeoutRef.current) {
				clearTimeout(wheelTimeoutRef.current)
			}

			// Set a timer to unlock horizontal scrolling after user stops swiping for 350ms
			wheelTimeoutRef.current = setTimeout(() => {
				isWheelLockedRef.current = false
				wheelAccumulatorRef.current = 0
			}, 350)

			// If currently locked, ignore this event completely (prevents multiple switches during 1 swipe)
			if (isWheelLockedRef.current) {
				e.preventDefault()
				return
			}

			wheelAccumulatorRef.current += e.deltaX
			const wheelThreshold = 80 // accumulation threshold
			const activeIdx = activeIndexRef.current
			const totalCount = articlesCountRef.current

			if (wheelAccumulatorRef.current > wheelThreshold) {
				// Swipe Leftward -> Next Article
				if (activeIdx < totalCount - 1) {
					e.preventDefault()
					isWheelLockedRef.current = true // lock further swipes immediately!
					handleNextArticle()
					wheelAccumulatorRef.current = 0
				}
			} else if (wheelAccumulatorRef.current < -wheelThreshold) {
				// Swipe Rightward -> Prev Article
				if (activeIdx > 0) {
					e.preventDefault()
					isWheelLockedRef.current = true // lock further swipes immediately!
					handlePrevArticle()
					wheelAccumulatorRef.current = 0
				}
			}
		}

		// Attach manual non-passive listener to allow calling e.preventDefault()
		rightCol.addEventListener("wheel", handleWheelEvent, { passive: false })

		return () => {
			rightCol.removeEventListener("wheel", handleWheelEvent)
			if (wheelTimeoutRef.current) {
				clearTimeout(wheelTimeoutRef.current)
			}
		}
	}, [handleNextArticle, handlePrevArticle])

	// Keyboard arrow navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only navigate if not typing in inputs/textareas
			const activeTag = document.activeElement?.tagName.toLowerCase()
			if (activeTag === "input" || activeTag === "textarea") return

			if (e.key === "ArrowLeft") {
				handlePrevArticle()
			} else if (e.key === "ArrowRight") {
				handleNextArticle()
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [handlePrevArticle, handleNextArticle])

	const handleAiGenerate = useCallback(
		async (params: {
			direction?: string
			referenceFiles?: { content?: string }[]
			model?: string
			count: number
			generateWithDetails: boolean
			signal: AbortSignal
		}): Promise<boolean> => {
			if (!globalSettings.author || !globalSettings.brandPosition) return false

			const referenceText =
				params.referenceFiles
					?.map((f) => f.content)
					.filter(Boolean)
					.join("\n\n") || undefined

			if (params.generateWithDetails) {
				const topics = await generateTopicsWithDetails({
					global: globalSettings,
					count: params.count,
					direction: params.direction,
					referenceText,
					model: params.model,
					signal: params.signal,
				})

				if (topics.length > 0) {
					const newArticles: ArticleDetail[] = topics.map((topic) => ({
						title: topic.title,
						folderName: "",
						style: topic.style || "professional",
						visualPreset: topic.visualPreset || "none",
						outline: topic.outline ? parseOutlineFromText(topic.outline) : [],
						cardCount: topic.cardCount || 6,
						materials: [],
						notes: topic.description || "",
						platform: (topic.platform as SelfMediaPlatform) || "rednote",
					}))
					onChange([...articles, ...newArticles])
					setActiveIndex(articles.length) // focus on first newly generated topic
					setShowAiPanel(false)
					return true
				}
				return false
			} else {
				const topics = await generateTopics({
					global: globalSettings,
					count: params.count,
					direction: params.direction,
					referenceText,
					model: params.model,
					signal: params.signal,
				})

				if (topics.length > 0) {
					const newArticles = topics.map(createArticleFromTopic)
					onChange([...articles, ...newArticles])
					setActiveIndex(articles.length) // focus on first newly generated topic
					setShowAiPanel(false)
					return true
				}
				return false
			}
		},
		[globalSettings, articles, onChange],
	)

	// Custom inline styles for dragging the detail page dynamically
	const workspaceWrapperStyle = isDragging
		? {
				transform: `translateX(${dragOffset}px)`,
				opacity: Math.max(0.65, 1 - Math.abs(dragOffset) / 550),
				transition: "none",
				userSelect: "none" as const,
			}
		: {
				transform: "translateX(0px)",
				opacity: 1,
				transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease",
			}

	return (
		<div className="mx-auto max-w-5xl py-8 space-y-10">
			{/* High-end Page Header */}
			<div className="text-center max-w-xl mx-auto space-y-2">
				<span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-[11px] font-bold tracking-[0.25em] text-transparent uppercase">
					Creative Brainstorming
				</span>
				<h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
					{t("detail.selfMedia.initPanel.stepTopic.title", "选题与内容大纲规划")}
				</h2>
				<p className="mt-2 text-xs md:text-sm text-muted-foreground/80 leading-relaxed font-normal">
					{t(
						"detail.selfMedia.initPanel.stepTopic.subtitle",
						"由 AI 智能规划，或手动添加定制大纲工作流",
					)}
				</p>
			</div>

			{/* 1. TOP SECTION: Wide AI Topic Assistant */}
			<div className="space-y-4">
				{showAiPanel ? (
					<AiTopicAssistant
						disabled={!globalSettings.author || !globalSettings.brandPosition}
						onGenerate={handleAiGenerate}
						onClose={() => setShowAiPanel(false)}
					/>
				) : (
					<div className="group flex items-center justify-between rounded-2xl border border-primary/10 bg-gradient-to-r from-primary/[0.03] to-indigo-500/[0.005] px-6 py-4 transition-all duration-300 hover:border-primary/35 hover:bg-gradient-to-r hover:from-primary/[0.05] hover:to-indigo-500/[0.015] shadow-sm">
						<div className="flex items-center gap-3.5">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-indigo-500/5 text-primary border border-primary/15 shadow-sm">
								<Sparkles size={16} className="animate-pulse text-primary" />
							</div>
							<div className="text-left space-y-0.5">
								<h4 className="text-sm font-bold text-foreground flex items-center gap-2">
									<span>激发灵感已就绪</span>
									<span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
								</h4>
								<p className="text-xs text-muted-foreground/75">
									填写创作方向，让 AI 为您自动一键规划爆款大纲
								</p>
							</div>
						</div>
						<button
							type="button"
							className="rounded-full bg-gradient-to-r from-primary to-indigo-600 px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-95 transition-all cursor-pointer shadow-md shadow-primary/10 active:scale-[0.98]"
							onClick={() => setShowAiPanel(true)}
						>
							唤醒 AI 助手
						</button>
					</div>
				)}
			</div>

			{/* 2. BOTTOM SECTION: Elegant Left-Right split master-detail editor */}
			{articles.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-border/60 bg-muted/[0.02] text-center px-4 space-y-5">
					<div className="h-14 w-12 flex items-center justify-center rounded-full bg-background border border-border/40 text-muted-foreground/70 shadow-sm">
						<Inbox size={22} />
					</div>
					<div className="space-y-1.5">
						<h3 className="text-sm font-semibold text-foreground">暂无选题内容</h3>
						<p className="text-xs text-muted-foreground/70 max-w-xs leading-relaxed font-normal">
							推荐在上方使用 <strong className="text-black">【AI 选题助手】</strong>
							一键激发多维度的热点选题，或者点击下方一键手动创建。
						</p>
					</div>
					<button
						type="button"
						className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-indigo-600 px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/5 hover:bg-primary/95 transition-all cursor-pointer"
						onClick={handleAdd}
					>
						<Plus size={14} />
						<span>手动创建首个大纲</span>
					</button>
				</div>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-h-[550px]">
					{/* Left column (Master Index List) - col-span-4 */}
					<div
						className={cn(
							"lg:sticky lg:top-6 h-fit flex flex-col bg-muted/[0.03] border border-border/30 rounded-2xl transition-all duration-300",
							isLeftCollapsed
								? "lg:col-span-1 p-3 items-center space-y-3"
								: "lg:col-span-4 p-5 space-y-5",
						)}
					>
						{/* Collapsed: narrow strip with navigation dots */}
						{isLeftCollapsed && (
							<div className="flex flex-col items-center gap-3">
								<button
									type="button"
									title="展开选题看板"
									className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:border-primary/20 hover:text-primary transition-all cursor-pointer"
									onClick={() => setIsLeftCollapsed(false)}
								>
									<ChevronRight size={13} />
								</button>
								<div className="flex flex-col items-center gap-2 mt-1">
									{articles.map((article, idx) => (
										<button
											key={idx}
											type="button"
											title={article.title || `选题 ${idx + 1}`}
											onClick={() => {
												setSlideDirection(
													idx > safeActiveIndex ? "left" : "right",
												)
												setActiveIndex(idx)
											}}
											className={cn(
												"h-2 w-2 rounded-full transition-all duration-300 cursor-pointer",
												idx === safeActiveIndex
													? "bg-primary scale-125"
													: "bg-muted-foreground/30 hover:bg-muted-foreground/60",
											)}
										/>
									))}
								</div>
							</div>
						)}
						{/* Navigator Header */}
						<div
							className={cn(
								"flex items-center justify-between pb-3 border-b border-border/15",
								isLeftCollapsed && "hidden",
							)}
						>
							<span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
								<Layers size={13} className="text-primary/80" />
								<span>选题看板 ({articles.length})</span>
							</span>
							<div className="flex items-center gap-1.5">
								<button
									type="button"
									title="收起看板"
									className="flex h-6 w-6 items-center justify-center rounded-md border border-border/40 text-muted-foreground/60 hover:border-primary/20 hover:text-primary transition-all cursor-pointer"
									onClick={() => setIsLeftCollapsed(true)}
								>
									<ChevronLeft size={12} />
								</button>
								<button
									type="button"
									className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 hover:border-primary/30 transition-all cursor-pointer"
									onClick={handleAdd}
								>
									<Plus size={10} />
									<span>添加选题</span>
								</button>
							</div>
						</div>

						{/* Scrollable list of items */}
						<div
							className={cn(
								"flex-1 overflow-y-auto max-h-[calc(100vh-240px)] space-y-2.5 pr-1",
								isLeftCollapsed && "hidden",
							)}
						>
							{articles.map((item, idx) => {
								const isActive = idx === safeActiveIndex
								return (
									<div
										key={idx}
										className={cn(
											"group relative flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-300 cursor-pointer border",
											isActive
												? "border-primary/25 bg-gradient-to-r from-primary/[0.04] to-transparent shadow-md shadow-primary/[0.02] scale-[1.01]"
												: "border-transparent bg-background/40 hover:bg-background/80 hover:border-border/20",
										)}
										onClick={() => {
											setSlideDirection(
												idx > safeActiveIndex ? "left" : "right",
											)
											setActiveIndex(idx)
										}}
									>
										{/* Active left bar indicator */}
										{isActive && (
											<div className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-r bg-gradient-to-b from-primary to-indigo-500 animate-in fade-in duration-300" />
										)}

										{/* Content */}
										<div className="flex-1 min-w-0 flex items-center gap-3">
											<span
												className={cn(
													"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 shadow-sm",
													isActive
														? "bg-gradient-to-br from-primary to-indigo-500 text-primary-foreground shadow-primary/15"
														: "bg-muted text-muted-foreground/80",
												)}
											>
												{idx + 1}
											</span>
											<div className="min-w-0 flex-1">
												<p
													className={cn(
														"truncate text-sm transition-colors",
														isActive
															? "text-primary font-bold"
															: "text-foreground/85 font-semibold",
													)}
												>
													{item.title || "未命名选题"}
												</p>
												{item.folderName && (
													<p className="truncate text-xs text-muted-foreground/70 font-medium flex items-center gap-1 mt-1">
														<FileDown
															size={11}
															className="text-primary/60"
														/>
														<span>{item.folderName}</span>
													</p>
												)}
											</div>
										</div>

										{/* Hover trash button */}
										<button
											type="button"
											className="rounded-lg p-1.5 text-muted-foreground/35 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0 cursor-pointer"
											onClick={(e) => {
												e.stopPropagation()
												handleRemove(idx)
											}}
										>
											<Trash2 size={12} />
										</button>
									</div>
								)
							})}
						</div>
					</div>

					{/* Right column (Detail Workspace Editor) - col-span-8 */}
					<div
						ref={rightColRef}
						className={cn(
							"flex flex-col space-y-6 relative overflow-hidden select-text",
							isLeftCollapsed ? "lg:col-span-11" : "lg:col-span-8",
						)}
						onMouseDown={handleMouseDown}
						onTouchStart={handleTouchStart}
					>
						{/* Detail Workspace Header - Inline editable Title & Folder name */}
						<div className="flex items-center justify-between pb-4 border-b border-border/15 select-none gap-4">
							<div className="flex-1 min-w-0 flex items-center gap-3.5">
								{/* Article Index Badge */}
								<span className="flex h-7 px-2.5 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-indigo-500/10 text-xs font-bold text-primary border border-primary/15 shadow-inner">
									第 {safeActiveIndex + 1} / {articles.length} 篇
								</span>

								{/* Editable Title Input */}
								<div className="group relative flex-1 min-w-0">
									<input
										type="text"
										className="w-full rounded-lg border border-transparent bg-transparent hover:bg-muted/10 hover:border-border/30 focus:bg-background focus:border-primary/30 focus:ring-4 focus:ring-primary/[0.03] px-2.5 py-1 pr-7 text-base font-bold text-foreground placeholder:text-muted-foreground/30 outline-none transition-all duration-300"
										placeholder={t(
											"detail.selfMedia.initPanel.stepTopic.titlePlaceholder",
											"点击输入选题标题...",
										)}
										value={articles[safeActiveIndex]?.title || ""}
										onChange={(e) =>
											onArticleUpdate(safeActiveIndex, {
												...articles[safeActiveIndex],
												title: e.target.value,
											})
										}
									/>
									<InlineVoiceButton
										onResult={(text) =>
											onArticleUpdate(safeActiveIndex, {
												...articles[safeActiveIndex],
												title:
													(articles[safeActiveIndex]?.title || "") + text,
											})
										}
									/>
								</div>

								{/* Editable Folder Input */}
								<div className="w-44 shrink-0 relative group/folder">
									<Folder
										className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/45 group-hover/folder:text-primary transition-colors"
										size={12}
									/>
									<input
										type="text"
										className="w-full rounded-lg border border-transparent bg-transparent hover:bg-muted/10 hover:border-border/30 focus:bg-background focus:border-primary/30 focus:ring-4 focus:ring-primary/[0.03] pl-8 pr-7 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/30 outline-none transition-all duration-300 font-medium"
										placeholder={t(
											"detail.selfMedia.initPanel.stepTopic.folderPlaceholder",
											"归档目录",
										)}
										value={articles[safeActiveIndex]?.folderName || ""}
										onChange={(e) =>
											onArticleUpdate(safeActiveIndex, {
												...articles[safeActiveIndex],
												folderName: e.target.value,
											})
										}
									/>
									<InlineVoiceButton
										onResult={(text) =>
											onArticleUpdate(safeActiveIndex, {
												...articles[safeActiveIndex],
												folderName:
													(articles[safeActiveIndex]?.folderName || "") +
													text,
											})
										}
									/>
								</div>
							</div>

							{/* Previous / Next Slide buttons */}
							<TooltipProvider>
								<div className="flex items-center gap-1.5 shrink-0">
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300 outline-none",
													safeActiveIndex > 0
														? "border-border/80 text-muted-foreground hover:border-primary/20 hover:text-foreground cursor-pointer active:scale-[0.97]"
														: "cursor-not-allowed border-border/30 text-muted-foreground/30 opacity-40",
												)}
												onClick={handlePrevArticle}
												disabled={safeActiveIndex === 0}
											>
												<ChevronLeft size={14} />
											</button>
										</TooltipTrigger>
										<TooltipContent>
											<p className="text-xs font-normal">
												上一篇 (键盘 ⬅ 键 / 左右拖拽)
											</p>
										</TooltipContent>
									</Tooltip>

									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300 outline-none",
													safeActiveIndex < articles.length - 1
														? "border-border/80 text-muted-foreground hover:border-primary/20 hover:text-foreground cursor-pointer active:scale-[0.97]"
														: "cursor-not-allowed border-border/30 text-muted-foreground/30 opacity-40",
												)}
												onClick={handleNextArticle}
												disabled={safeActiveIndex === articles.length - 1}
											>
												<ChevronRight size={14} />
											</button>
										</TooltipTrigger>
										<TooltipContent>
											<p className="text-xs font-normal">
												下一篇 (键盘 ➡ 键 / 左右拖拽)
											</p>
										</TooltipContent>
									</Tooltip>
								</div>
							</TooltipProvider>
						</div>

						{/* Detail editor with sliding animation and drag position effect */}
						<div className="flex-1 w-full">
							<div
								key={safeActiveIndex}
								className={cn(
									"w-full",
									!isDragging &&
										(slideDirection === "left"
											? "animate-in fade-in slide-in-from-right-4 duration-300"
											: "animate-in fade-in slide-in-from-left-4 duration-300"),
								)}
								style={workspaceWrapperStyle}
							>
								<ArticleCard
									index={safeActiveIndex}
									article={articles[safeActiveIndex]}
									globalSettings={globalSettings}
									onUpdate={(updated) =>
										onArticleUpdate(safeActiveIndex, updated)
									}
									onRemove={() => handleRemove(safeActiveIndex)}
									onPersistDraft={onPersistDraft}
									fileStorageService={fileStorageService}
									hideHeader={true}
									alwaysExpanded={true}
								/>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
