import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Clipboard, ImageDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Label } from "@/components/shadcn-ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/shadcn-ui/radio-group"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { cn } from "@/lib/utils"
import type { ImageProcessOptions } from "@/utils/image-processing"
import CardFrame from "./CardFrame"
import type { CardFrameRef } from "./CardFrame"
import { selfMediaOverlayStyles } from "./selfMediaOverlayStyles"
import type { SelfMediaAttachmentNode, SelfMediaPost } from "../types"
import { useCoverImageUrl } from "../platforms/wechat-official-accounts/useCoverImageUrl"

export type SelfMediaExportType = "cardsZip" | "longImage" | "wechatCoverImage"
export type SelfMediaExportMode = "cards" | "wechatOfficial"

export interface ExportPreviewConfirmArgs {
	postIndex: number
	cardIndexes: number[]
	pixelRatio: number
	exportType: SelfMediaExportType
	getCardRef: (cardIndex: number) => CardFrameRef | null
}

interface ExportPreviewDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	posts: SelfMediaPost[]
	initialPostIndex: number
	attachmentList?: SelfMediaAttachmentNode[]
	/** Notify the shell so the target post's cards can mount (for refs). */
	onSyncActivePost?: (postIndex: number) => void
	onConfirm: (args: ExportPreviewConfirmArgs) => Promise<void> | void
	isExporting?: boolean
	/**
	 * CSS pixel size for labels (W×H×ratio). Defaults to 1080×1440 card canvas;
	 * override when iframe body size differs.
	 */
	exportSizeHintCss?: { width: number; height: number }
	/** Platform-specific export surface. WeChat has cover image + HTML copy outputs. */
	exportMode?: SelfMediaExportMode
	onCopyWechatHtml?: () => Promise<void> | void
	isCopyingWechatHtml?: boolean
}

const PIXEL_RATIO_OPTIONS = [1, 2, 4] as const
const EXPORT_TYPE_OPTIONS: SelfMediaExportType[] = ["cardsZip", "longImage"]
const PREVIEW_INITIAL_BATCH = 8
const PREVIEW_BATCH_SIZE = 8
/** localStorage key for last chosen export scale (1/2/4). */
const EXPORT_PIXEL_RATIO_STORAGE_KEY = "dtyq:self-media:export-pixel-ratio"
/**
 * Self-media card canvas (3:4). Capture size = this × pixelRatio
 * (e.g. 2x → 2160×2880). Varies if card HTML has different body size.
 */
const EXPORT_SIZE_HINT_CSS = { width: 1080, height: 1440 } as const
const WECHAT_COVER_SQUARE_PREVIEW_PROCESS: ImageProcessOptions = {
	resize: { w: 240, h: 240, m: "fill" },
	quality: 82,
	format: "webp",
}
const WECHAT_COVER_HORIZONTAL_PREVIEW_PROCESS: ImageProcessOptions = {
	resize: { w: 640, m: "lfit" },
	quality: 82,
	format: "webp",
}

function isPixelRatioOption(value: number): value is (typeof PIXEL_RATIO_OPTIONS)[number] {
	return (PIXEL_RATIO_OPTIONS as readonly number[]).includes(value)
}

function readStoredPixelRatio(): number {
	if (typeof window === "undefined") return 2
	try {
		const raw = window.localStorage.getItem(EXPORT_PIXEL_RATIO_STORAGE_KEY)
		const parsed = raw === null || raw === "" ? NaN : Number(raw)
		if (isPixelRatioOption(parsed)) return parsed
	} catch {
		// ignore quota / private mode
	}
	return 2
}

function persistPixelRatio(ratio: number): void {
	if (typeof window === "undefined") return
	if (!isPixelRatioOption(ratio)) return
	try {
		window.localStorage.setItem(EXPORT_PIXEL_RATIO_STORAGE_KEY, String(ratio))
	} catch {
		// ignore
	}
}

function isExportTypeOption(value: string): value is SelfMediaExportType {
	return (EXPORT_TYPE_OPTIONS as readonly string[]).includes(value)
}

function buildAllCardIndexes(post: SelfMediaPost | undefined): Set<number> {
	if (!post) return new Set()
	return new Set(post.cards.map((_, idx) => idx))
}

function WechatCoverPreviewImage({
	url,
	loading,
	alt,
	className,
	testId,
}: {
	url: string | null
	loading: boolean
	alt: string
	className?: string
	testId?: string
}) {
	return (
		<div className={cn("overflow-hidden bg-white", className)} data-testid={testId}>
			{url ? (
				<img src={url} alt={alt} className="h-full w-full object-cover" draggable={false}  data-testid="export-preview-dialog-image"/>
			) : (
				<div
					className={cn(
						"h-full w-full bg-gradient-to-b from-[#fafafa] to-[#e4e4e7]",
						loading && "animate-pulse",
					)}
					aria-label={alt}
				/>
			)}
		</div>
	)
}

function WechatCoverExportPreview({ post }: { post?: SelfMediaPost }) {
	const { t } = useTranslation("super")
	const squareFileId = post?.thumbnailCover?.fileId || post?.heroCover?.fileId
	const horizontalFileId = post?.heroCover?.fileId || post?.thumbnailCover?.fileId
	const { url: squareUrl, loading: squareLoading } = useCoverImageUrl(
		squareFileId,
		Boolean(squareFileId),
		WECHAT_COVER_SQUARE_PREVIEW_PROCESS,
	)
	const { url: horizontalUrl, loading: horizontalLoading } = useCoverImageUrl(
		horizontalFileId,
		Boolean(horizontalFileId),
		WECHAT_COVER_HORIZONTAL_PREVIEW_PROCESS,
	)

	return (
		<div
			className="mt-4 grid aspect-[335/100] w-full grid-cols-[100fr_235fr] overflow-hidden rounded-[14px] bg-[#f4f4f5]"
			data-testid="self-media-export-wechat-cover-preview"
		>
			<WechatCoverPreviewImage
				url={squareUrl}
				loading={squareLoading}
				alt={t("detail.selfMedia.export.wechat.squareCover")}
				className="aspect-square h-full min-w-0"
			/>
			<WechatCoverPreviewImage
				url={horizontalUrl}
				loading={horizontalLoading}
				alt={t("detail.selfMedia.export.wechat.horizontalCover")}
				className="aspect-[235/100] h-full min-w-0"
				testId="self-media-export-wechat-horizontal-preview"
			/>
		</div>
	)
}

function ExportPreviewDialog({
	open,
	onOpenChange,
	posts,
	initialPostIndex,
	attachmentList,
	onSyncActivePost,
	onConfirm,
	isExporting = false,
	exportSizeHintCss = EXPORT_SIZE_HINT_CSS,
	exportMode = "cards",
	onCopyWechatHtml,
	isCopyingWechatHtml = false,
}: ExportPreviewDialogProps) {
	const { t } = useTranslation("super")

	const [selectedPostIndex, setSelectedPostIndex] = useState(initialPostIndex)
	const [selectedCards, setSelectedCards] = useState<Set<number>>(() =>
		buildAllCardIndexes(posts[initialPostIndex]),
	)
	const [pixelRatio, setPixelRatio] = useState<number>(() => readStoredPixelRatio())
	const [exportType, setExportType] = useState<SelfMediaExportType>("cardsZip")
	const [wechatHtmlCopied, setWechatHtmlCopied] = useState(false)
	const [previewVersion, setPreviewVersion] = useState(0)
	const [loadedPreviewCards, setLoadedPreviewCards] = useState<Set<number>>(() => new Set())
	const previewCardRefs = useRef<Record<number, CardFrameRef | null>>({})

	// Reset state each time the dialog opens; seed with current active post.
	useEffect(() => {
		if (!open) return
		const safeIndex = Math.min(Math.max(initialPostIndex, 0), Math.max(posts.length - 1, 0))
		setSelectedPostIndex(safeIndex)
		setSelectedCards(buildAllCardIndexes(posts[safeIndex]))
		setPixelRatio(readStoredPixelRatio())
		setExportType(exportMode === "wechatOfficial" ? "wechatCoverImage" : "cardsZip")
		setWechatHtmlCopied(false)
		setPreviewVersion((prev) => prev + 1)
		setLoadedPreviewCards(new Set())
		previewCardRefs.current = {}
	}, [open, initialPostIndex, posts, exportMode])

	const selectedPost = posts[selectedPostIndex]
	const totalCards = selectedPost?.cards.length ?? 0
	const selectedCount = selectedCards.size
	const isAllSelected = totalCards > 0 && selectedCount === totalCards
	const [visiblePreviewCount, setVisiblePreviewCount] = useState(PREVIEW_INITIAL_BATCH)

	const handleChangePost = useCallback(
		(value: string) => {
			const nextIndex = Number(value)
			if (Number.isNaN(nextIndex)) return
			setSelectedPostIndex(nextIndex)
			setSelectedCards(buildAllCardIndexes(posts[nextIndex]))
			setLoadedPreviewCards(new Set())
			previewCardRefs.current = {}
			onSyncActivePost?.(nextIndex)
		},
		[onSyncActivePost, posts],
	)

	const handlePreviewCardLoaded = useCallback((cardIndex: number) => {
		setLoadedPreviewCards((prev) => {
			if (prev.has(cardIndex)) return prev
			const next = new Set(prev)
			next.add(cardIndex)
			return next
		})
	}, [])

	const toggleCard = useCallback((cardIndex: number) => {
		setSelectedCards((prev) => {
			const next = new Set(prev)
			if (next.has(cardIndex)) next.delete(cardIndex)
			else next.add(cardIndex)
			return next
		})
	}, [])

	const handleToggleAll = useCallback(() => {
		setSelectedCards((prev) => {
			if (prev.size === totalCards) return new Set()
			return buildAllCardIndexes(selectedPost)
		})
	}, [selectedPost, totalCards])

	useEffect(() => {
		if (!open) return
		setVisiblePreviewCount(PREVIEW_INITIAL_BATCH)
	}, [open, selectedPostIndex])

	useEffect(() => {
		if (!open) return
		if (totalCards <= PREVIEW_INITIAL_BATCH) return

		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null

		const loadNextBatch = () => {
			if (cancelled) return
			setVisiblePreviewCount((prev) => {
				const next = Math.min(prev + PREVIEW_BATCH_SIZE, totalCards)
				if (next < totalCards) {
					timer = setTimeout(loadNextBatch, 16)
				}
				return next
			})
		}

		timer = setTimeout(loadNextBatch, 16)

		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [open, selectedPostIndex, totalCards])

	const orderedCardIndexes = useMemo(
		() => Array.from(selectedCards).sort((a, b) => a - b),
		[selectedCards],
	)
	const visibleCards = useMemo(
		() => selectedPost?.cards.slice(0, visiblePreviewCount) || [],
		[selectedPost?.cards, visiblePreviewCount],
	)
	const isPreviewLoading = open && totalCards > visibleCards.length

	const hintW = Math.max(0, Math.floor(exportSizeHintCss.width))
	const hintH = Math.max(0, Math.floor(exportSizeHintCss.height))

	const isWechatOfficialMode = exportMode === "wechatOfficial"
	const isLongImageReady =
		isWechatOfficialMode ||
		exportType !== "longImage" ||
		orderedCardIndexes.every(
			(cardIndex) =>
				Boolean(selectedPost?.cards[cardIndex]?.fileId) &&
				cardIndex < visiblePreviewCount &&
				loadedPreviewCards.has(cardIndex),
		)
	const hasWechatCoverAsset = Boolean(
		selectedPost?.thumbnailCover?.fileId || selectedPost?.heroCover?.fileId,
	)
	const dialogSizeClass = isWechatOfficialMode
		? "max-h-[720px] !max-w-5xl"
		: "h-[85vh] max-h-[900px] !max-w-6xl"
	const disableConfirm =
		isExporting ||
		(isWechatOfficialMode ? !hasWechatCoverAsset : orderedCardIndexes.length === 0) ||
		!isLongImageReady

	const handleConfirm = useCallback(async () => {
		if (disableConfirm) return
		const previewCardRefsSnapshot = { ...previewCardRefs.current }
		await onConfirm({
			postIndex: selectedPostIndex,
			cardIndexes: isWechatOfficialMode ? [] : orderedCardIndexes,
			pixelRatio,
			exportType: isWechatOfficialMode ? "wechatCoverImage" : exportType,
			getCardRef: (cardIndex) => previewCardRefsSnapshot[cardIndex] || null,
		})
	}, [
		disableConfirm,
		exportType,
		isWechatOfficialMode,
		onConfirm,
		orderedCardIndexes,
		pixelRatio,
		selectedPostIndex,
	])

	const handleCopyWechatHtml = useCallback(async () => {
		if (!onCopyWechatHtml || isCopyingWechatHtml) return
		setWechatHtmlCopied(false)
		try {
			await onCopyWechatHtml()
			setWechatHtmlCopied(true)
		} catch {
			setWechatHtmlCopied(false)
		}
	}, [isCopyingWechatHtml, onCopyWechatHtml])

	const handleCancel = useCallback(() => {
		if (isExporting) return
		onOpenChange(false)
	}, [isExporting, onOpenChange])

	return (
		<Dialog open={open} onOpenChange={(next) => !isExporting && onOpenChange(next)}>
			<DialogContent
				className={cn(
					"flex w-full flex-col gap-0",
					dialogSizeClass,
					selfMediaOverlayStyles.dialogSurface,
				)}
				data-testid="self-media-export-dialog"
			>
				<DialogHeader className={selfMediaOverlayStyles.dialogHeader}>
					<DialogTitle
						className={selfMediaOverlayStyles.dialogTitle}
						data-testid="self-media-export-dialog-title"
					>
						{t("detail.selfMedia.export.dialogTitle")}
					</DialogTitle>
					<DialogDescription className={selfMediaOverlayStyles.dialogDescription}>
						{t("detail.selfMedia.export.dialogDescription")}
					</DialogDescription>
				</DialogHeader>

				<div className="flex shrink-0 flex-col gap-2 px-4 pt-4 sm:px-6">
					<Label className="text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.export.postSelectorLabel")}
					</Label>
					<Select
						value={String(selectedPostIndex)}
						onValueChange={handleChangePost}
						disabled={isExporting || posts.length === 0}
					>
						<SelectTrigger
							className="h-9"
							data-testid="self-media-export-post-selector"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{posts.map((post, idx) => {
								const label =
									post.meta.title ||
									post.meta.feedTitle ||
									t("detail.selfMedia.common.postFallbackTitle", {
										index: idx + 1,
									})
								return (
									<SelectItem
										key={post.meta.id || idx}
										value={String(idx)}
										data-testid={`self-media-export-post-option-${idx}`}
									>
										{label}
									</SelectItem>
								)
							})}
						</SelectContent>
					</Select>
				</div>

				{!isWechatOfficialMode ? (
					<div className="flex shrink-0 items-center justify-between px-4 pt-4 sm:px-6">
						<div className="flex items-center gap-2">
							<Label className="text-xs font-medium text-muted-foreground">
								{t("detail.selfMedia.export.selectCards")}
							</Label>
							<span
								className="text-xs text-muted-foreground"
								data-testid="self-media-export-selected-summary"
							>
								{t("detail.selfMedia.export.selectedSummary", {
									count: selectedCount,
									total: totalCards,
								})}
							</span>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className={selfMediaOverlayStyles.secondaryButton}
							onClick={handleToggleAll}
							disabled={isExporting || totalCards === 0}
							data-testid="self-media-export-toggle-all"
						>
							{isAllSelected
								? t("detail.selfMedia.export.selectNone")
								: t("detail.selfMedia.export.selectAll")}
						</Button>
					</div>
				) : null}

				{!isWechatOfficialMode ? (
					<div
						className="mx-4 mt-4 min-h-0 flex-1 overflow-y-auto rounded-[24px] bg-white/90 p-3 shadow-[inset_0_1px_rgba(255,255,255,0.82)] sm:mx-6"
						data-testid="self-media-export-card-grid"
					>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{visibleCards.map((card, cardIdx) => {
								const checked = selectedCards.has(cardIdx)
								const cardKey = card.fileId || card.path || String(cardIdx)
								const cardLabel = t("detail.selfMedia.export.cardFallbackTitle", {
									index: cardIdx + 1,
								})
								return (
									<div
										key={cardKey}
										role="button"
										tabIndex={isExporting ? -1 : 0}
										aria-pressed={checked}
										aria-disabled={isExporting || undefined}
										onClick={() => !isExporting && toggleCard(cardIdx)}
										onKeyDown={(event) => {
											if (isExporting) return
											if (event.key === " " || event.key === "Enter") {
												event.preventDefault()
												toggleCard(cardIdx)
											}
										}}
										data-testid={`self-media-export-card-item-${cardIdx}`}
										className={cn(
											"group relative flex flex-col overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											checked
												? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/50"
												: "border-border bg-background hover:border-primary/40",
											isExporting
												? "cursor-not-allowed opacity-60"
												: "cursor-pointer",
										)}
									>
										<span className="absolute left-2 top-2 z-10">
											<Checkbox
												checked={checked}
												onCheckedChange={() => toggleCard(cardIdx)}
												onClick={(event) => event.stopPropagation()}
												aria-label={cardLabel}
												className="shadow-sm data-[state=unchecked]:bg-background"
												data-testid={`self-media-export-card-checkbox-${cardIdx}`}
											/>
										</span>
										<div className="aspect-[3/4] w-full overflow-hidden bg-muted">
											{card.fileId ? (
												<CardFrame
													cardId={`export-preview-${selectedPost.meta.id}-${cardIdx}`}
													fileId={card.fileId}
													version={`${card.version ?? ""}:export:${previewVersion}`}
													attachmentList={attachmentList}
													className="pointer-events-none h-full w-full"
													onLoaded={() =>
														handlePreviewCardLoaded(cardIdx)
													}
													ref={(node) => {
														previewCardRefs.current[cardIdx] = node
													}}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
													{cardLabel}
												</div>
											)}
										</div>
										<div
											className={cn(
												"truncate px-2 py-1.5 text-xs",
												checked && "font-medium text-primary",
											)}
										>
											{cardLabel}
										</div>
									</div>
								)
							})}
						</div>
						{isPreviewLoading ? (
							<div
								className="mt-3 text-center text-xs text-muted-foreground"
								data-testid="self-media-export-preview-loading"
							>
								{t("detail.selfMedia.common.loading")}
							</div>
						) : null}
					</div>
				) : (
					<div
						className="mx-4 mt-4 grid shrink-0 grid-cols-1 gap-3 rounded-[24px] bg-white/90 p-3 shadow-[inset_0_1px_rgba(255,255,255,0.82)] sm:mx-6 md:grid-cols-2"
						data-testid="self-media-export-wechat-products"
					>
						<section
							className="flex min-h-[160px] flex-col justify-between rounded-[18px] border border-[#e4e4e7] bg-white p-4"
							data-testid="self-media-export-wechat-cover-product"
						>
							<div className="flex items-start gap-3">
								<span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#07c160]/10 text-[#07c160]">
									<ImageDown className="h-5 w-5" aria-hidden />
								</span>
								<div className="min-w-0">
									<h3 className="text-sm font-[800] text-[#18181b]">
										{t("detail.selfMedia.export.wechat.coverTitle")}
									</h3>
									<p className="mt-1 text-xs leading-5 text-muted-foreground">
										{t("detail.selfMedia.export.wechat.coverDescription")}
									</p>
								</div>
							</div>
							<WechatCoverExportPreview post={selectedPost} />
						</section>

						<section
							className="flex min-h-[160px] flex-col justify-between rounded-[18px] border border-[#e4e4e7] bg-white p-4"
							data-testid="self-media-export-wechat-html-product"
						>
							<div className="flex items-start gap-3">
								<span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#18181b]/10 text-[#18181b]">
									<Clipboard className="h-5 w-5" aria-hidden />
								</span>
								<div className="min-w-0">
									<h3 className="text-sm font-[800] text-[#18181b]">
										{t("detail.selfMedia.export.wechat.htmlTitle")}
									</h3>
									<p className="mt-1 text-xs leading-5 text-muted-foreground">
										{t("detail.selfMedia.export.wechat.htmlDescription")}
									</p>
								</div>
							</div>
							<Button
								type="button"
								variant="outline"
								className={cn(
									"mt-4 h-10 rounded-[14px]",
									selfMediaOverlayStyles.secondaryButton,
								)}
								onClick={handleCopyWechatHtml}
								disabled={!onCopyWechatHtml || isCopyingWechatHtml}
								data-testid="self-media-export-copy-html"
							>
								{wechatHtmlCopied ? (
									<Check className="h-4 w-4" />
								) : (
									<Clipboard className="h-4 w-4" />
								)}
								{wechatHtmlCopied
									? t("detail.selfMedia.export.wechat.htmlCopied")
									: t("detail.selfMedia.export.wechat.copyHtml")}
							</Button>
						</section>
					</div>
				)}

				{!isWechatOfficialMode ? (
					<div
						className="flex shrink-0 flex-col gap-2 px-4 pt-4 sm:px-6"
						data-testid="self-media-export-type-section"
					>
						<Label className="text-xs font-medium text-muted-foreground">
							{t("detail.selfMedia.export.typeLabel")}
						</Label>
						<RadioGroup
							value={exportType}
							onValueChange={(value) => {
								if (isExportTypeOption(value)) setExportType(value)
							}}
							className="grid grid-cols-1 gap-2 sm:grid-cols-2"
							data-testid="self-media-export-type-group"
						>
							{EXPORT_TYPE_OPTIONS.map((type) => {
								const id = `self-media-export-type-${type}`
								const checked = exportType === type
								return (
									<Label
										key={type}
										htmlFor={id}
										data-testid={
											type === "longImage"
												? "self-media-export-type-long-image"
												: "self-media-export-type-cards-zip"
										}
										className={cn(
											"flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 text-sm transition-colors",
											checked &&
												"border-primary bg-primary/5 ring-1 ring-primary/40",
											isExporting && "cursor-not-allowed opacity-60",
										)}
									>
										<RadioGroupItem
											id={id}
											value={type}
											disabled={isExporting}
											className="mt-0.5"
										/>
										<span className="flex min-w-0 flex-col gap-1">
											<span className="font-medium text-foreground">
												{t(`detail.selfMedia.export.type.${type}.title`)}
											</span>
											<span className="text-xs leading-5 text-muted-foreground">
												{t(
													`detail.selfMedia.export.type.${type}.description`,
												)}
											</span>
										</span>
									</Label>
								)
							})}
						</RadioGroup>
					</div>
				) : null}

				<div
					className="flex w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 px-4 py-3 text-xs font-medium text-muted-foreground sm:px-6"
					data-testid="self-media-export-scale-section"
				>
					{t("detail.selfMedia.export.scaleLabel")}
					<RadioGroup
						value={String(pixelRatio)}
						onValueChange={(value) => {
							const next = Number(value)
							setPixelRatio(next)
							persistPixelRatio(next)
						}}
						className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-2"
						data-testid="self-media-export-scale-group"
					>
						{PIXEL_RATIO_OPTIONS.map((ratio) => {
							const id = `self-media-export-scale-${ratio}x`
							const outW = hintW * ratio
							const outH = hintH * ratio
							return (
								<div key={ratio} className="flex items-center gap-2">
									<RadioGroupItem
										id={id}
										value={String(ratio)}
										disabled={isExporting}
										data-testid={`self-media-export-scale-option-${ratio}x`}
									/>
									<Label
										htmlFor={id}
										className="flex cursor-pointer items-center gap-2 text-sm"
									>
										<span>
											{t("detail.selfMedia.export.scaleOption", { ratio })}
										</span>
										<span
											className="text-xs font-normal tabular-nums text-muted-foreground"
											data-testid={`self-media-export-scale-size-${ratio}x`}
										>
											{t("detail.selfMedia.export.scaleOutputSize", {
												width: outW,
												height: outH,
											})}
										</span>
									</Label>
								</div>
							)
						})}
					</RadioGroup>
				</div>

				<DialogFooter
					className={cn("shrink-0", selfMediaOverlayStyles.dialogFooter)}
					data-testid="self-media-export-footer"
				>
					<Button
						type="button"
						variant="outline"
						className={selfMediaOverlayStyles.secondaryButton}
						onClick={handleCancel}
						disabled={isExporting}
						data-testid="self-media-export-cancel"
					>
						{t("detail.selfMedia.export.cancel")}
					</Button>
					<Button
						type="button"
						className={selfMediaOverlayStyles.primaryButton}
						onClick={handleConfirm}
						disabled={disableConfirm}
						data-testid="self-media-export-confirm"
					>
						{isExporting
							? t("detail.selfMedia.export.exporting")
							: isWechatOfficialMode
								? t("detail.selfMedia.export.wechat.exportCover")
								: t("detail.selfMedia.export.confirmWithCount", {
										count: orderedCardIndexes.length,
									})}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default memo(ExportPreviewDialog)
