import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
	OutlineNode,
	MaterialItem,
	ReferenceFileValue,
} from "./types"
import { STYLE_PRESETS, ALL_PLATFORMS, getVisualPresetsForPlatform } from "./types"
import type { SelfMediaPlatform } from "../../../../types"
import type { SelfMediaFileStorageService } from "../../services/SelfMediaFileStorageService"
import ArticleOutlineEditor from "./ArticleOutlineEditor"
import CardContentEditor from "./CardContentEditor"
import AiInputBox from "./AiInputBox"
import AiActionButton from "./AiActionButton"
import VisualPresetPicker from "./VisualPresetPicker"
import {
	generateOutline,
	generateCardContent,
	optimizeOutline,
	optimizeCardContent,
} from "../../services/selfMediaAiGenerate"
import { Trash2, ChevronDown, Sparkles, Folder, HelpCircle } from "lucide-react"

interface ArticleCardProps {
	index: number
	article: ArticleDetail
	globalSettings: SelfMediaInitGlobalSettings
	onUpdate: (article: ArticleDetail) => void
	onRemove: () => void
	onPersistDraft?: () => void
	fileStorageService?: SelfMediaFileStorageService | null
	alwaysExpanded?: boolean
	hideHeader?: boolean
}

export default function ArticleCard({
	index,
	article,
	globalSettings,
	onUpdate,
	onRemove,
	onPersistDraft,
	fileStorageService,
	alwaysExpanded = false,
	hideHeader = false,
}: ArticleCardProps) {
	const { t } = useTranslation("super")
	const [expanded, setExpanded] = useState(false)
	const [generatingOutline, setGeneratingOutline] = useState(false)
	const [outlineModel, setOutlineModel] = useState("")
	const [sharedModel, setSharedModel] = useState("")
	const [optimizePopoverOpen, setOptimizePopoverOpen] = useState(false)
	const [optimizeInstruction, setOptimizeInstruction] = useState("")
	const abortRef = useRef<AbortController | null>(null)
	const outlineActionRef = useRef<HTMLDivElement>(null)
	const articleRef = useRef(article)
	articleRef.current = article

	const hasOutline = (article.outline.length ?? 0) > 0

	const hasConfig =
		article.style !== "professional" ||
		hasOutline ||
		(article.visualPreset && article.visualPreset !== "none")

	useEffect(() => {
		if (hasConfig && !expanded) setExpanded(true)
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!optimizePopoverOpen) return
		const handler = (e: MouseEvent) => {
			if (outlineActionRef.current && !outlineActionRef.current.contains(e.target as Node)) {
				setOptimizePopoverOpen(false)
			}
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [optimizePopoverOpen])

	const effectivePlatform = article.platform || "rednote"
	const isCardPlatform = effectivePlatform === "rednote" || effectivePlatform === "instagram"
	const availableVisualPresets = useMemo(
		() => getVisualPresetsForPlatform(effectivePlatform as SelfMediaPlatform),
		[effectivePlatform],
	)

	const handleFieldChange = useCallback(
		(field: keyof ArticleDetail, value: any) => {
			onUpdate({ ...article, [field]: value })
		},
		[article, onUpdate],
	)

	const handleOutlineChange = useCallback(
		(outline: OutlineNode[]) => {
			onUpdate({ ...article, outline })
		},
		[article, onUpdate],
	)

	const handleMaterialsChange = useCallback(
		(materials: MaterialItem[]) => {
			onUpdate({ ...article, materials })
		},
		[article, onUpdate],
	)

	const handleUploadToProject = useCallback(
		async (file: File, materialId: string) => {
			if (!fileStorageService) return
			try {
				const relativePath = await fileStorageService.uploadMaterialToDraft(index, file)
				if (!relativePath) return

				const currentArticle = articleRef.current

				const updateMaterialsWithPath = (materials?: MaterialItem[]) =>
					(materials || []).map((item) =>
						item.id === materialId ? { ...item, uploadedPath: relativePath } : item,
					)

				const newArticleMaterials = updateMaterialsWithPath(currentArticle.materials)

				const updateOutline = (nodes: OutlineNode[] = []): OutlineNode[] =>
					nodes.map((node) => ({
						...node,
						materials: updateMaterialsWithPath(node.materials),
						children: node.children ? updateOutline(node.children) : node.children,
					}))

				const newOutline = updateOutline(currentArticle.outline)

				onUpdate({ ...currentArticle, materials: newArticleMaterials, outline: newOutline })
			} catch (err) {
				console.error("Failed to upload material to project:", err)
			}
		},
		[fileStorageService, index, onUpdate],
	)

	const handleReferenceFilesChange = useCallback(
		(referenceFiles: ReferenceFileValue[]) => {
			onUpdate({ ...article, referenceFiles })
		},
		[article, onUpdate],
	)

	const handleRemoveCard = useCallback(
		(cardIndex: number) => {
			const newOutline = [...article.outline]
			newOutline.splice(cardIndex, 1)
			const newCardCount = Math.max(1, article.cardCount - 1)
			onUpdate({ ...article, outline: newOutline, cardCount: newCardCount })
		},
		[article, onUpdate],
	)

	const handleCardCountChange = useCallback(
		(newCount: number) => {
			const clamped = Math.max(1, Math.min(20, newCount))
			if (clamped >= article.cardCount) {
				onUpdate({ ...article, cardCount: clamped })
				return
			}
			// Check if any cards being removed have content
			const removedCards = article.outline.slice(clamped)
			const hasContent = removedCards.some(
				(card) => card.text.trim() || (card.materials && card.materials.length > 0),
			)
			if (hasContent) {
				const confirmed = window.confirm(
					t(
						"detail.selfMedia.initPanel.stepDetail.cardCountReduceConfirm",
						"减少卡片数量将移除末尾已有内容的卡片，是否确认？",
					),
				)
				if (!confirmed) return
			}
			const newOutline = article.outline.slice(0, clamped)
			onUpdate({ ...article, cardCount: clamped, outline: newOutline })
		},
		[article, onUpdate, t],
	)

	const handleAiOutline = useCallback(async () => {
		if (generatingOutline) return
		setGeneratingOutline(true)

		const controller = new AbortController()
		abortRef.current = controller

		try {
			const genFn = isCardPlatform ? generateCardContent : generateOutline
			const outline = await genFn({
				global: globalSettings,
				article,
				model: outlineModel || undefined,
				signal: controller.signal,
			})
			if (outline.length > 0) {
				onUpdate({ ...article, outline })
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				console.error("Failed to generate outline:", err)
			}
		} finally {
			setGeneratingOutline(false)
			abortRef.current = null
		}
	}, [generatingOutline, isCardPlatform, globalSettings, article, onUpdate, outlineModel])

	const handleAiOptimize = useCallback(
		async (instruction: string) => {
			if (generatingOutline) return
			setGeneratingOutline(true)
			setOptimizePopoverOpen(false)

			const controller = new AbortController()
			abortRef.current = controller

			try {
				const optFn = isCardPlatform ? optimizeCardContent : optimizeOutline
				const outline = await optFn({
					global: globalSettings,
					article,
					instruction,
					model: outlineModel || undefined,
					signal: controller.signal,
				})
				if (outline.length > 0) {
					onUpdate({ ...article, outline })
				}
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					console.error("Failed to optimize outline:", err)
				}
			} finally {
				setGeneratingOutline(false)
				abortRef.current = null
			}
		},
		[generatingOutline, isCardPlatform, globalSettings, article, onUpdate, outlineModel],
	)

	const handleOutlineButtonClick = useCallback(() => {
		if (generatingOutline) {
			abortRef.current?.abort()
			return
		}
		if (hasOutline) {
			setOptimizePopoverOpen((open) => !open)
			return
		}
		handleAiOutline()
	}, [generatingOutline, hasOutline, handleAiOutline])

	const isExpanded = alwaysExpanded || expanded

	return (
		<div
			className={cn(
				hideHeader
					? "w-full space-y-6"
					: "group rounded-2xl border border-border bg-background p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary/15",
			)}
		>
			{/* Accordion header row - visible only when not hideHeader */}
			{!hideHeader && (
				<div className="flex items-start gap-4">
					{/* Step badge */}
					<div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shadow-inner">
						{index + 1}
					</div>

					{/* Inputs section */}
					<div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-3">
						<div className="md:col-span-8 space-y-1">
							<input
								type="text"
								className="w-full rounded-lg border-0 bg-transparent px-2 py-1 text-sm font-bold text-foreground placeholder:text-muted-foreground/30 focus:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
								placeholder={t(
									"detail.selfMedia.initPanel.stepTopic.titlePlaceholder",
								)}
								value={article.title}
								onChange={(e) => handleFieldChange("title", e.target.value)}
							/>
							{!isExpanded && article.notes && (
								<p className="px-2 text-xs text-muted-foreground/80 line-clamp-1">
									{article.notes}
								</p>
							)}
						</div>

						<div className="md:col-span-4 flex items-center">
							<div className="relative w-full">
								<Folder
									className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40"
									size={12}
								/>
								<input
									type="text"
									className="w-full rounded-lg border-0 bg-transparent pl-7 pr-2 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/30 focus:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
									placeholder={t(
										"detail.selfMedia.initPanel.stepTopic.folderPlaceholder",
										"归档目录",
									)}
									value={article.folderName}
									onChange={(e) =>
										handleFieldChange("folderName", e.target.value)
									}
								/>
							</div>
						</div>
					</div>

					{/* Row control actions */}
					<div className="flex items-center gap-1.5 shrink-0 pt-0.5">
						<button
							type="button"
							className={cn(
								"rounded-lg p-1.5 transition-all duration-300 outline-none cursor-pointer",
								expanded
									? "text-primary bg-primary/10"
									: "text-muted-foreground/40 hover:bg-muted hover:text-foreground",
							)}
							onClick={() => setExpanded(!expanded)}
							title={t(
								expanded
									? "detail.selfMedia.initPanel.stepTopic.collapseDetail"
									: "detail.selfMedia.initPanel.stepTopic.expandDetail",
							)}
						>
							<ChevronDown
								size={14}
								className={cn(
									"transition-transform duration-300",
									expanded && "rotate-180",
								)}
							/>
						</button>
						<button
							type="button"
							className="rounded-lg p-1.5 text-muted-foreground/35 transition-all duration-300 hover:bg-destructive/15 hover:text-destructive cursor-pointer"
							onClick={onRemove}
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>
			)}

			{/* Collapsible/Always open workspace section */}
			{isExpanded && (
				<div
					className={cn(
						hideHeader
							? "space-y-6 animate-in fade-in duration-200"
							: "border-t border-border/10 mt-4 pt-5 space-y-5 animate-in fade-in slide-in-from-top-3 duration-200",
					)}
				>
					{/* 1. Platform selection + Card count */}
					<div className="grid grid-cols-1 md:grid-cols-12 gap-5">
						<div className="md:col-span-8 space-y-2">
							<label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider block">
								{t(
									"detail.selfMedia.initPanel.stepDetail.platformLabel",
									"目标自媒体平台",
								)}
							</label>
							<div className="flex flex-wrap gap-1.5">
								{ALL_PLATFORMS.filter((p) => !p.disabled).map((p) => (
									<button
										key={p.value}
										type="button"
										className={cn(
											"rounded-full border px-3 py-1 text-xs font-medium transition-all duration-300 cursor-pointer",
											article.platform === p.value
												? "border-primary bg-primary/10 text-primary shadow-sm shadow-primary/5"
												: "border-border/60 text-muted-foreground hover:border-primary/20",
										)}
										onClick={() =>
											handleFieldChange(
												"platform",
												p.value as SelfMediaPlatform,
											)
										}
									>
										{t(p.labelKey)}
									</button>
								))}
							</div>
						</div>

						{article.platform !== "wechat-official-accounts" && (
							<div className="md:col-span-4 space-y-2">
								<label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider block">
									{t(
										"detail.selfMedia.initPanel.stepDetail.cardCountLabel",
										"生成卡片数量",
									)}
								</label>
								<div className="flex items-center gap-2">
									<input
										type="number"
										min={1}
										max={20}
										className="w-16 rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-center text-xs font-semibold focus:border-primary/45 focus:bg-background focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300"
										value={article.cardCount}
										onChange={(e) =>
											handleCardCountChange(parseInt(e.target.value) || 1)
										}
									/>
									<span className="text-[10px] text-muted-foreground">
										张卡片
									</span>
								</div>
							</div>
						)}
					</div>

					{/* 2. Content style */}
					<div className="space-y-2">
						<label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider block">
							{t("detail.selfMedia.initPanel.stepDetail.styleLabel", "文案口吻预设")}
						</label>
						<div className="flex flex-wrap gap-1.5">
							{STYLE_PRESETS.map((preset) => (
								<button
									key={preset.value}
									type="button"
									className={cn(
										"rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-300 cursor-pointer",
										article.style === preset.value
											? "border-primary bg-primary/10 text-primary"
											: "border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground",
									)}
									onClick={() => handleFieldChange("style", preset.value)}
								>
									{t(preset.labelKey)}
								</button>
							))}
						</div>
					</div>

					{/* 3. Visual preset */}
					<div className="space-y-2">
						<label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider block">
							{t("detail.selfMedia.initPanel.stepDetail.visualLabel", "配图视觉基调")}
						</label>
						<VisualPresetPicker
							presets={availableVisualPresets}
							value={article.visualPreset || "none"}
							onChange={(v) => handleFieldChange("visualPreset", v)}
							customDescription={
								article.notes.includes("[视觉描述]")
									? article.notes
											.split("[视觉描述]")[1]
											?.split("[/视觉描述]")[0] || ""
									: ""
							}
							onCustomDescriptionChange={(desc) => {
								const base = article.notes
									.replace(/\[视觉描述\].*?\[\/视觉描述\]/g, "")
									.trim()
								const newNotes = desc
									? `${base}\n[视觉描述]${desc}[/视觉描述]`.trim()
									: base
								handleFieldChange("notes", newNotes)
							}}
							visualReferenceFiles={article.visualReferenceFiles || []}
							onVisualReferenceFilesChange={(files) =>
								handleFieldChange("visualReferenceFiles", files)
							}
						/>
					</div>

					{/* 4. Content description (with attachments) */}
					<AiInputBox
						label={t(
							"detail.selfMedia.initPanel.stepDetail.descriptionLabel",
							"内容描述与核心观点",
						)}
						value={article.description ?? ""}
						onChange={(v) => handleFieldChange("description", v)}
						onBlur={onPersistDraft}
						polishContext={`Article title: ${article.title}, Platform: ${article.platform || ""}`}
						placeholder={t(
							"detail.selfMedia.initPanel.stepDetail.descriptionPlaceholder",
						)}
						model={sharedModel}
						onModelChange={setSharedModel}
						referenceFiles={article.referenceFiles || []}
						onReferenceFilesChange={handleReferenceFilesChange}
					/>

					{/* 5. Outline / Card Content Workspace */}
					<div className="space-y-3">
						<div className="flex items-center justify-between border-b border-border/10 pb-2">
							<label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
								{t(
									isCardPlatform
										? "detail.selfMedia.initPanel.stepDetail.cardContentLabel"
										: "detail.selfMedia.initPanel.stepDetail.outlineLabel",
									"文章大纲规划",
								)}
							</label>
							<div ref={outlineActionRef} className="relative">
								<AiActionButton
									modelValue={outlineModel}
									onModelChange={setOutlineModel}
									loading={generatingOutline}
									disabled={!article.title.trim()}
									onClick={handleOutlineButtonClick}
									variant="primary"
									size="sm"
									label={t(
										hasOutline
											? isCardPlatform
												? "detail.selfMedia.initPanel.stepDetail.cardContentOptimizeBtn"
												: "detail.selfMedia.initPanel.stepDetail.outlineOptimizeBtn"
											: isCardPlatform
												? "detail.selfMedia.initPanel.stepDetail.cardContentGenerateBtn"
												: "detail.selfMedia.initPanel.stepDetail.outlineGenerateBtn",
									)}
									loadingLabel={
										<div className="flex items-center gap-1.5">
											<svg
												className="animate-spin"
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2.5"
											>
												<path d="M21 12a9 9 0 1 1-6.219-8.56" />
											</svg>
											<span>
												{t(
													hasOutline
														? "detail.selfMedia.initPanel.stepDetail.outlineOptimizing"
														: "detail.selfMedia.initPanel.stepDetail.outlineGenerating",
												)}
											</span>
										</div>
									}
								/>

								{optimizePopoverOpen && hasOutline && !generatingOutline && (
									<div className="absolute right-0 top-full z-[1000] mt-1.5 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg animate-in fade-in-0 zoom-in-95">
										<textarea
											className="min-h-[80px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
											placeholder={t(
												isCardPlatform
													? "detail.selfMedia.initPanel.stepDetail.cardContentOptimizePlaceholder"
													: "detail.selfMedia.initPanel.stepDetail.outlineOptimizePlaceholder",
											)}
											rows={3}
											value={optimizeInstruction}
											onChange={(e) => setOptimizeInstruction(e.target.value)}
											autoFocus
										/>
										<div className="mt-2 flex justify-end">
											<button
												type="button"
												className={cn(
													"inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97] cursor-pointer",
													!optimizeInstruction.trim() &&
														"opacity-50 cursor-not-allowed",
												)}
												disabled={!optimizeInstruction.trim()}
												onClick={() =>
													handleAiOptimize(optimizeInstruction)
												}
											>
												{t(
													"detail.selfMedia.initPanel.stepDetail.outlineOptimizeSubmit",
												)}
											</button>
										</div>
									</div>
								)}
							</div>
						</div>

						{isCardPlatform ? (
							<CardContentEditor
								outline={article.outline}
								cardCount={article.cardCount}
								onChange={handleOutlineChange}
								onRemoveCard={handleRemoveCard}
								onBlur={onPersistDraft}
								uploadToProject={
									fileStorageService ? handleUploadToProject : undefined
								}
							/>
						) : (
							<ArticleOutlineEditor
								outline={article.outline}
								onChange={handleOutlineChange}
								onBlur={onPersistDraft}
								uploadToProject={
									fileStorageService ? handleUploadToProject : undefined
								}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
