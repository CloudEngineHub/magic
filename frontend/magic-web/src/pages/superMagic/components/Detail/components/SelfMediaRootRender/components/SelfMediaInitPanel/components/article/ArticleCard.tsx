import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { JSONContent } from "@tiptap/react"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
	OutlineNode,
	ReferenceFileValue,
	MaterialItem,
} from "../../types"
import { STYLE_PRESETS, ALL_PLATFORMS, getVisualPresetsForPlatform } from "../../types"
import type { SelfMediaPlatform } from "../../../../../../types"
import type { SelfMediaFileStorageService } from "../../../../services/SelfMediaFileStorageService"
import ArticleOutlineEditor from "./ArticleOutlineEditor"
import CardContentEditor from "./CardContentEditor"
import AiInputBox from "../ai/AiInputBox"
import AiActionButton from "../ai/AiActionButton"
import VisualPresetPicker from "../picker/VisualPresetPicker"
import ModelSelector from "../picker/ModelSelector"
import ReferenceFilePicker from "../picker/ReferenceFilePicker"
import { MagicPromptEditor } from "@/components/base/MagicPromptEditor"
import {
	generateOutline,
	generateCardContent,
	optimizeOutline,
	optimizeCardContent,
	polishText,
} from "../../../../services/selfMediaAiGenerate"
import { Trash2, ChevronDown, Folder } from "lucide-react"
import PlatformBrandIcon from "../../../PlatformBrandIcon"

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
		<K extends keyof ArticleDetail>(field: K, value: ArticleDetail[K]) => {
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
			if (isCardPlatform) {
				const { outline, cardCount } = await generateCardContent({
					global: globalSettings,
					article,
					model: outlineModel || undefined,
					signal: controller.signal,
				})
				if (outline.length > 0) {
					onUpdate({ ...article, outline, cardCount })
				}
			} else {
				const outline = await generateOutline({
					global: globalSettings,
					article,
					model: outlineModel || undefined,
					signal: controller.signal,
				})
				if (outline.length > 0) {
					onUpdate({ ...article, outline })
				}
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
				if (isCardPlatform) {
					const { outline, cardCount } = await optimizeCardContent({
						global: globalSettings,
						article,
						instruction,
						model: outlineModel || undefined,
						signal: controller.signal,
					})
					if (outline.length > 0) {
						onUpdate({ ...article, outline, cardCount })
					}
				} else {
					const outline = await optimizeOutline({
						global: globalSettings,
						article,
						instruction,
						model: outlineModel || undefined,
						signal: controller.signal,
					})
					if (outline.length > 0) {
						onUpdate({ ...article, outline })
					}
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
					: "group border-l-2 border-primary/60 bg-white p-5 transition-all duration-300 hover:bg-zinc-50/40",
			)}
		>
			{/* Accordion header row - visible only when not hideHeader */}
			{!hideHeader && (
				<div className="flex items-start gap-4">
					{/* Step badge */}
					<div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center bg-primary text-xs font-black text-zinc-950">
						{index + 1}
					</div>

					{/* Inputs section */}
					<div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-12">
						<div className="space-y-1 md:col-span-8">
							<input
								type="text"
								className="w-full border-0 border-b border-transparent px-2 py-1 text-sm font-extrabold text-zinc-950 outline-none transition-all placeholder:text-muted-foreground/30 focus:border-zinc-950 focus:bg-primary/[0.03]"
								placeholder={t(
									"detail.selfMedia.initPanel.stepTopic.titlePlaceholder",
								)}
								value={article.title}
								onChange={(e) => handleFieldChange("title", e.target.value)}
							/>
							{!isExpanded && (article.description || article.notes) && (
								<p className="line-clamp-1 px-2 text-xs text-muted-foreground/80">
									{article.description || article.notes}
								</p>
							)}
						</div>

						<div className="flex items-center md:col-span-4">
							<div className="relative w-full">
								<Folder
									className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/45"
									size={12}
								/>
								<input
									type="text"
									className="w-full border-0 border-b border-transparent py-1 pl-7 pr-2 text-xs font-bold text-zinc-950/70 outline-none transition-all placeholder:text-muted-foreground/30 focus:border-zinc-950 focus:bg-primary/[0.03]"
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
					<div className="flex shrink-0 items-center gap-1.5 pt-0.5">
						<button
							type="button"
							className={cn(
								"cursor-pointer p-1.5 outline-none transition-all duration-300",
								expanded
									? "bg-primary/10 text-primary"
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
							className="cursor-pointer p-1.5 text-muted-foreground/35 transition-all duration-300 hover:bg-destructive/15 hover:text-destructive"
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
							? "space-y-6 duration-200 animate-in fade-in"
							: "mt-4 space-y-5 border-t border-border/10 pt-5 duration-200 animate-in fade-in slide-in-from-top-3",
					)}
				>
					{/* 1. Platform selection + Card count */}
					<div className="grid grid-cols-1 gap-5 md:grid-cols-12">
						<div className="space-y-2 md:col-span-8">
							<label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
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
											"flex cursor-pointer items-center gap-1.5 px-3.5 py-1 text-xs font-bold transition-all duration-300",
											article.platform === p.value
												? "bg-primary/30 text-zinc-950"
												: "bg-zinc-100 text-muted-foreground hover:bg-primary/20 hover:text-zinc-950",
										)}
										onClick={() =>
											handleFieldChange(
												"platform",
												p.value as SelfMediaPlatform,
											)
										}
									>
										<PlatformBrandIcon
											platform={p.value}
											className="size-3.5"
										/>
										{t(p.labelKey)}
									</button>
								))}
							</div>
						</div>

						{article.platform !== "wechat-official-accounts" && (
							<div className="space-y-2 md:col-span-4">
								<label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
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
										className="w-16 border-0 border-b border-zinc-200 bg-zinc-50/40 px-3 py-2 text-center text-xs font-black outline-none transition-all duration-300 focus:border-zinc-950 focus:bg-primary/[0.03]"
										value={article.cardCount}
										onChange={(e) =>
											handleCardCountChange(parseInt(e.target.value) || 1)
										}
									/>
									<span className="text-[10px] font-bold text-muted-foreground">
										张卡片
									</span>
								</div>
							</div>
						)}
					</div>

					{/* 2. Content style */}
					<div className="space-y-2">
						<label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
							{t("detail.selfMedia.initPanel.stepDetail.styleLabel", "文案口吻预设")}
						</label>
						<div className="flex flex-wrap gap-1.5">
							{STYLE_PRESETS.map((preset) => (
								<button
									key={preset.value}
									type="button"
									className={cn(
										"cursor-pointer px-3.5 py-1.5 text-xs font-bold transition-all duration-300",
										article.style === preset.value
											? "bg-primary/30 text-zinc-950"
											: "bg-zinc-100 text-muted-foreground hover:bg-primary/20 hover:text-zinc-950",
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
						<label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
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
							customDescriptionJson={article.visualDescriptionJson}
							onCustomDescriptionJsonChange={(json) =>
								handleFieldChange("visualDescriptionJson", json)
							}
							visualReferenceFiles={article.visualReferenceFiles || []}
							onVisualReferenceFilesChange={(files) =>
								handleFieldChange("visualReferenceFiles", files)
							}
							onBlur={onPersistDraft}
						/>
					</div>

					{/* 4. Content description (with attachments) */}
					<div className="space-y-1.5">
						<label className="mb-1 block text-xs font-semibold">
							{t(
								"detail.selfMedia.initPanel.stepDetail.descriptionLabel",
								"内容描述与核心观点",
							)}
						</label>
						<MagicPromptEditor
							value={article.descriptionJson}
							textValue={article.description ?? ""}
							onChange={(json) => handleFieldChange("descriptionJson", json)}
							onTextChange={(text) => handleFieldChange("description", text)}
							onBlur={onPersistDraft}
							placeholder={t(
								"detail.selfMedia.initPanel.stepDetail.descriptionPlaceholder",
							)}
							enableAIPolish
							onAIPolish={async (text) => {
								const result = await polishText({
									text,
									context: `Article title: ${article.title}, Platform: ${article.platform || ""}`,
									model: sharedModel || undefined,
								})
								return result || text
							}}
							enableVoice
							enableMention
							rows={3}
							className="border-0 border-b border-zinc-200 bg-zinc-50/40 ring-0 ring-offset-0 focus-within:border-zinc-950 focus-within:bg-primary/[0.03] focus-within:ring-0 focus-within:ring-offset-0"
							bottomToolbar={
								<div className="flex items-center bg-white/70 px-3 py-1.5">
									<ReferenceFilePicker
										value={article.referenceFiles || []}
										onChange={handleReferenceFilesChange}
										compact
									/>
									<span className="flex-1" />
									<ModelSelector
										value={sharedModel}
										onChange={setSharedModel}
										mode="icon"
										className="flex h-6 items-center justify-center px-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
									/>
								</div>
							}
						/>
					</div>

					{/* 5. Outline / Card Content Workspace */}
					<div className="space-y-3">
						<div className="flex items-center justify-between border-b border-border/10 pb-2">
							<label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
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
													"inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]",
													!optimizeInstruction.trim() &&
														"cursor-not-allowed opacity-50",
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
