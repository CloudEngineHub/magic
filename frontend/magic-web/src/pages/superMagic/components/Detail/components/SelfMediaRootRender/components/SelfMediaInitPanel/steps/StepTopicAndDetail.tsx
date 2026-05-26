import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { ArticleDetail, SelfMediaInitGlobalSettings } from "../types"
import {
	generateTopics,
	generateTopicsWithDetails,
	parseOutlineFromText,
	reconcileCardCountWithOutline,
} from "../../../services/selfMediaAiGenerate"
import type { GeneratedTopic } from "../../../services/selfMediaAiGenerate"
import type { SelfMediaPlatform } from "../../../../../types"
import type { SelfMediaFileStorageService } from "../../../services/SelfMediaFileStorageService"
import {
	Plus,
	Layers,
	ChevronLeft,
	ChevronRight,
	Trash2,
	Inbox,
	FileDown,
	Folder,
	Check,
	X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipProvider,
} from "@/components/shadcn-ui/tooltip"
import AiTopicAssistant from "../components/ai/AiTopicAssistant"
import ArticleCard from "../components/article/ArticleCard"
import InlineVoiceButton from "../components/ui/InlineVoiceButton"
import PlatformBrandIcon from "../../PlatformBrandIcon"
import { SketchTitleIllustration } from "../components/ui/SketchTitleIllustration"

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
		notes: "",
		description: topic.description,
		platform: "rednote",
	}
}

export default function StepTopicAndDetail({
	articles,
	onChange,
	onArticleUpdate,
	globalSettings,
	onPersistDraft,
	fileStorageService,
}: StepTopicAndDetailProps) {
	const [activeIndex, setActiveIndex] = useState(0)
	const [slideDirection, setSlideDirection] = useState<"left" | "right">("left")
	const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null)
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
			setPendingRemoveIndex(null)
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

	const handleAiGenerate = useCallback(
		async (params: {
			direction?: string
			referenceFiles?: { content?: string }[]
			model?: string
			count: number
			generateWithDetails: boolean
			signal: AbortSignal
		}): Promise<boolean> => {
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
					const newArticles: ArticleDetail[] = topics.map((topic) => {
						const outline = topic.outline ? parseOutlineFromText(topic.outline) : []
						const platform = (topic.platform as SelfMediaPlatform) || "rednote"
						return {
							title: topic.title,
							folderName: "",
							style: topic.style || "professional",
							visualPreset: topic.visualPreset || "none",
							outline,
							cardCount: reconcileCardCountWithOutline(
								platform,
								topic.cardCount,
								outline,
								topic.outline,
							),
							materials: [],
							notes: "",
							description: topic.description || "",
							platform,
						}
					})
					onChange([...articles, ...newArticles])
					setActiveIndex(articles.length) // focus on first newly generated topic
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
					return true
				}
				return false
			}
		},
		[globalSettings, articles, onChange],
	)

	return (
		<div className="mx-auto max-w-5xl space-y-10 py-8">
			{/* Page header: text + illustration in a stable two-column grid */}
			<div className="border-b border-dashed border-zinc-950/10 px-1 pb-6">
				<div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_11rem] sm:gap-8 md:grid-cols-[minmax(0,1fr)_13rem]">
					<div className="space-y-2">
						<span className="inline-flex bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-950">
							Creative Brainstorming
						</span>
						<h2 className="text-2xl font-black tracking-tight text-foreground">
							{t("detail.selfMedia.initPanel.stepTopic.title", "选题与内容大纲规划")}
						</h2>
						<p className="max-w-lg text-xs font-medium leading-relaxed text-muted-foreground">
							{t(
								"detail.selfMedia.initPanel.stepTopic.subtitle",
								"由 AI 智能规划，或手动添加定制大纲工作流",
							)}
						</p>
					</div>
					<SketchTitleIllustration
						variant="topics"
						className="mx-auto h-[7.5rem] w-full max-w-[11rem] opacity-90 sm:mx-0 sm:h-[8.5rem] sm:max-w-none md:h-[9.5rem]"
						data-testid="self-media-step-topic-title-illustration"
					/>
				</div>
			</div>

			{/* 1. TOP SECTION: Wide AI Topic Assistant */}
			<div className="space-y-4">
				<AiTopicAssistant onGenerate={handleAiGenerate} />
			</div>

			{/* 2. BOTTOM SECTION: Elegant Left-Right split master-detail editor */}
			{articles.length === 0 ? (
				<div className="flex flex-col items-center justify-center space-y-5 border-y border-dashed border-zinc-950/15 bg-white px-4 py-24 text-center">
					<div className="flex h-14 w-12 items-center justify-center bg-primary/20 text-zinc-950">
						<Inbox size={22} />
					</div>
					<div className="space-y-1.5">
						<h3 className="text-sm font-bold text-zinc-950">暂无选题内容</h3>
						<p className="max-w-xs text-xs font-bold leading-relaxed text-muted-foreground">
							推荐在上方使用 <strong className="text-black">【AI 选题助手】</strong>
							一键激发多维度的热点选题，或者点击下方一键手动创建。
						</p>
					</div>
					<button
						type="button"
						className="flex cursor-pointer items-center gap-2 bg-zinc-950 px-5 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98]"
						onClick={handleAdd}
					>
						<Plus size={14} />
						<span>手动创建首个大纲</span>
					</button>
				</div>
			) : (
				<div className="grid min-h-[550px] grid-cols-1 items-start gap-8 lg:grid-cols-12">
					{/* Left column (Master Index List) - col-span-4 */}
					<div
						className={cn(
							"flex h-fit flex-col border-r border-zinc-950/10 bg-white transition-all duration-300 lg:sticky lg:top-6",
							isLeftCollapsed
								? "items-center space-y-3 p-3 pt-0 lg:col-span-1"
								: "space-y-5 p-5 pt-0 lg:col-span-4",
						)}
					>
						{/* Collapsed: narrow strip with navigation dots */}
						{isLeftCollapsed && (
							<div className="flex flex-col items-center gap-3">
								<button
									type="button"
									title="展开选题看板"
									className="flex h-7 w-7 cursor-pointer items-center justify-center bg-zinc-100 text-zinc-950 transition-all hover:bg-zinc-200"
									onClick={() => setIsLeftCollapsed(false)}
								>
									<ChevronRight size={13} />
								</button>
								<div className="mt-1 flex flex-col items-center gap-2">
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
												"h-2 w-2 cursor-pointer rounded-full transition-all duration-300",
												idx === safeActiveIndex
													? "scale-125 bg-zinc-950"
													: "bg-zinc-200 hover:bg-zinc-300",
											)}
										/>
									))}
								</div>
							</div>
						)}
						{/* Navigator Header */}
						<div
							className={cn(
								"flex items-center justify-between border-b border-zinc-950/10 pb-3",
								isLeftCollapsed && "hidden",
							)}
						>
							<span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-950">
								<Layers size={13} className="text-primary" />
								<span>选题看板 ({articles.length})</span>
							</span>
							<div className="flex items-center gap-1.5">
								<button
									type="button"
									title="收起看板"
									className="flex h-6 w-6 cursor-pointer items-center justify-center bg-zinc-100 text-zinc-950 transition-all hover:bg-zinc-200"
									onClick={() => setIsLeftCollapsed(true)}
								>
									<ChevronLeft size={12} />
								</button>
								<button
									type="button"
									className="flex h-6 cursor-pointer items-center gap-1 bg-zinc-950 px-3 text-[10px] font-bold text-white transition-all hover:bg-zinc-900 active:scale-[0.98]"
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
								"max-h-[calc(100vh-240px)] flex-1 space-y-2 overflow-y-auto pr-1",
								isLeftCollapsed && "hidden",
							)}
						>
							{articles.map((item, idx) => {
								const isActive = idx === safeActiveIndex
								return (
									<div
										key={idx}
										className={cn(
											"group relative cursor-pointer border-l-2 border-transparent px-4 py-3 pr-9 text-left transition-all duration-300",
											isActive
												? "border-zinc-950 bg-zinc-100"
												: "bg-zinc-50/50 hover:bg-zinc-100/40",
										)}
										onClick={() => {
											setPendingRemoveIndex(null)
											setSlideDirection(
												idx > safeActiveIndex ? "left" : "right",
											)
											setActiveIndex(idx)
										}}
									>
										<div className="flex items-start gap-2.5">
											<div className="flex shrink-0 items-center gap-1.5 pt-0.5">
												<span
													className={cn(
														"flex h-6 w-6 items-center justify-center text-xs font-black transition-all duration-300",
														isActive
															? "bg-zinc-950 text-white"
															: "bg-white text-zinc-500",
													)}
												>
													{idx + 1}
												</span>
												{item.platform ? (
													<PlatformBrandIcon
														platform={item.platform}
														className="size-3.5 shrink-0"
													/>
												) : null}
											</div>
											<div className="min-w-0 flex-1">
												<p
													className={cn(
														"break-words text-sm leading-snug transition-colors",
														isActive
															? "font-extrabold text-zinc-950"
															: "font-bold text-zinc-700 group-hover:text-zinc-950",
													)}
												>
													{item.title || "未命名选题"}
												</p>
												{item.folderName ? (
													<p className="mt-1.5 flex items-start gap-1 text-xs font-bold leading-snug text-zinc-500">
														<FileDown
															size={11}
															className="mt-0.5 shrink-0 text-primary"
														/>
														<span className="break-words">
															{item.folderName}
														</span>
													</p>
												) : null}
											</div>
										</div>

										{/* Hover remove with inline confirm */}
										{pendingRemoveIndex === idx ? (
											<div
												className="absolute right-2 top-2 flex items-center gap-1"
												onClick={(e) => e.stopPropagation()}
											>
												<button
													type="button"
													className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-black text-zinc-500 transition-all hover:bg-zinc-200/80 hover:text-zinc-950"
													onClick={() => setPendingRemoveIndex(null)}
												>
													<X size={10} />
													<span>
														{t(
															"detail.selfMedia.initPanel.stepTopic.removeCancel",
															"取消",
														)}
													</span>
												</button>
												<button
													type="button"
													className="flex items-center gap-0.5 bg-destructive px-2 py-1 text-[10px] font-black text-white transition-all hover:bg-destructive/90 active:scale-[0.98]"
													onClick={() => handleRemove(idx)}
												>
													<Check size={10} />
													<span>
														{t(
															"detail.selfMedia.initPanel.stepTopic.removeConfirm",
															"删除",
														)}
													</span>
												</button>
											</div>
										) : (
											<button
												type="button"
												className="absolute right-2 top-2 cursor-pointer p-1.5 text-muted-foreground/35 opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-destructive group-hover:opacity-100"
												onClick={(e) => {
													e.stopPropagation()
													setPendingRemoveIndex(idx)
												}}
											>
												<Trash2 size={12} />
											</button>
										)}
									</div>
								)
							})}
						</div>
					</div>

					{/* Right column (Detail Workspace Editor) - col-span-8 */}
					<div
						className={cn(
							"relative flex select-text flex-col space-y-6",
							isLeftCollapsed ? "lg:col-span-11" : "lg:col-span-8",
						)}
					>
						{/* Detail Workspace Header - Inline editable Title */}
						<div className="sticky top-0 z-20 flex shrink-0 select-none items-center justify-between gap-4 border-b border-border/15 bg-white pb-4 pt-4 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.08)]">
							<div className="flex min-w-0 flex-1 items-center gap-2.5">
								{/* Article Index Badge */}
								<span className="flex h-7 shrink-0 items-center justify-center bg-primary/20 px-2.5 text-xs font-black text-zinc-950">
									第 {safeActiveIndex + 1} / {articles.length} 篇
								</span>

								{/* Editable Title Input */}
								<div className="group relative min-w-0 flex-1">
									<input
										type="text"
										className="w-full border-0 border-b border-transparent bg-white px-2.5 py-1 pr-7 text-base font-bold text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground/30 hover:bg-muted/10 focus:border-zinc-950 focus:bg-primary/[0.03]"
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
										value={articles[safeActiveIndex]?.title || ""}
										onResult={(text) =>
											onArticleUpdate(safeActiveIndex, {
												...articles[safeActiveIndex],
												title: text,
											})
										}
									/>
								</div>
							</div>

							{/* Previous / Next Slide buttons */}
							<TooltipProvider>
								<div className="flex shrink-0 items-center gap-1.5">
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"flex h-8 w-8 items-center justify-center bg-zinc-100 outline-none transition-all duration-300",
													safeActiveIndex > 0
														? "cursor-pointer text-muted-foreground hover:bg-zinc-200 hover:text-foreground active:scale-[0.97]"
														: "cursor-not-allowed text-muted-foreground/30 opacity-40",
												)}
												onClick={handlePrevArticle}
												disabled={safeActiveIndex === 0}
											>
												<ChevronLeft size={14} />
											</button>
										</TooltipTrigger>
										<TooltipContent>
											<p className="text-xs font-normal">上一篇</p>
										</TooltipContent>
									</Tooltip>

									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"flex h-8 w-8 items-center justify-center bg-zinc-100 outline-none transition-all duration-300",
													safeActiveIndex < articles.length - 1
														? "cursor-pointer text-muted-foreground hover:bg-zinc-200 hover:text-foreground active:scale-[0.97]"
														: "cursor-not-allowed text-muted-foreground/30 opacity-40",
												)}
												onClick={handleNextArticle}
												disabled={safeActiveIndex === articles.length - 1}
											>
												<ChevronRight size={14} />
											</button>
										</TooltipTrigger>
										<TooltipContent>
											<p className="text-xs font-normal">下一篇</p>
										</TooltipContent>
									</Tooltip>
								</div>
							</TooltipProvider>
						</div>

						{/* Detail editor with sliding animation */}
						<div className="w-full flex-1 overflow-hidden">
							<div
								key={safeActiveIndex}
								className={cn(
									"w-full",
									slideDirection === "left"
										? "duration-300 animate-in fade-in slide-in-from-right-4"
										: "duration-300 animate-in fade-in slide-in-from-left-4",
								)}
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
