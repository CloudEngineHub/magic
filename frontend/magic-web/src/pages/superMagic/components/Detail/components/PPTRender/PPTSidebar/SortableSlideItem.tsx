import { useState, useMemo, useEffect } from "react"
import {
	Image,
	Loader2,
	ArrowUp,
	ArrowDown,
	Trash2,
	Pencil,
	MessageSquarePlus,
	MessageSquare,
	FileSearch,
	FileSymlink,
	RefreshCw,
	Copy,
	LayoutTemplate,
	EyeOff,
	Eye,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/shadcn-ui/context-menu"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import type { SortableSlideItemProps } from "./types"
import { observer } from "mobx-react-lite"
import SmartTooltip from "@/components/other/SmartTooltip"
import MagicTooltip from "@/components/base/MagicTooltip"
import { useScreenshotRetry } from "./hooks/useScreenshotRetry"
import { handlePPTSlideDragStart } from "../../../../MessageEditor/utils/drag"
import { resolvePptScaleContentDimensions } from "../../../contents/HTML/utils/slide-dimensions"

function SortableSlideItem({
	item,
	isActive,
	onClick,
	isSelected = false,
	selectionMode = false,
	onSelect,
	isHidden = false,
	onToggleHidden,
	removeOnly = false,
	screenshot,
	totalSlides,
	onInsertAbove,
	onInsertBelow,
	onDuplicate,
	onDelete,
	onRename,
	onAddToCurrentChat,
	onAddToNewChat,
	onReplaceTemplate,
	onLocateFile,
	onOpenFile,
	onRefresh,
	onRegenerateScreenshot,
	className,
	isMobile = false,
	allowEdit = false,
	slideFileId,
	slideFullRelativePath,
	slideDimensions: providedSlideDimensions,
	...props
}: SortableSlideItemProps) {
	const { t } = useTranslation("super")
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
	const [renameValue, setRenameValue] = useState("")
	const [imageLoadError, setImageLoadError] = useState(false)
	const addToCurrentChatShortcut = useMemo(() => {
		const isMac =
			typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC")

		return {
			modifiers: [isMac ? "⌘" : "Ctrl"],
			key: "L",
		}
	}, [])
	const resolvedScreenshot = useMemo(
		() =>
			screenshot ?? {
				index: item.index,
				thumbnailUrl: item.thumbnailUrl || "",
				isLoading: item.thumbnailLoading || false,
				error: item.thumbnailError,
			},
		[item.index, item.thumbnailError, item.thumbnailLoading, item.thumbnailUrl, screenshot],
	)
	const slideDimensions = useMemo(
		() =>
			providedSlideDimensions ??
			resolvePptScaleContentDimensions(item.content, item.rawContent),
		[item.content, item.rawContent, providedSlideDimensions],
	)

	// Reset image load error when thumbnail URL changes
	useEffect(() => {
		setImageLoadError(false)
	}, [resolvedScreenshot.thumbnailUrl])

	// Auto-retry mechanism for image loading failure
	const imageLoadRetry = useScreenshotRetry({
		hasError: imageLoadError,
		isLoading: resolvedScreenshot.isLoading,
		hasThumbnail: !!resolvedScreenshot.thumbnailUrl && !imageLoadError,
		onRetry: () => {
			// For image load error, need to clear cache and regenerate with new URL
			setImageLoadError(false)
			onRegenerateScreenshot?.()
		},
		maxRetries: 3,
		baseRetryDelay: 2000,
	})

	// Combine retry states
	const canRetry = imageLoadRetry.canRetry
	const manualRetry = () => {
		imageLoadRetry.manualRetry()
	}

	const { onSlideDragStart } = props

	// Render thumbnail based on screenshot state
	const renderThumbnail = () => {
		const hasError = resolvedScreenshot.error || imageLoadError

		// Show loading state when: 1) actively loading, or 2) has error but still retrying
		if (resolvedScreenshot.isLoading || (hasError && canRetry)) {
			return (
				<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
				</div>
			)
		}

		// Show error state only when retry attempts exhausted
		if (hasError && !canRetry) {
			return (
				<div
					className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-xs"
					onClick={(e) => {
						e.stopPropagation()
						manualRetry()
					}}
					data-testid="manual-retry"
				>
					<Image className="size-4" />
				</div>
			)
		}

		if (resolvedScreenshot.thumbnailUrl) {
			return (
				<div className="h-full w-full rounded-sm border-[1px] border-border">
					<img
						src={resolvedScreenshot.thumbnailUrl}
						alt={`Slide ${item.index + 1}`}
						className="h-full w-full rounded-sm object-contain"
						draggable={false}
						onError={() => {
							// Image load failed, trigger retry
							setImageLoadError(true)
						}}
						onLoad={() => {
							// Image loaded successfully, clear any error state
							setImageLoadError(false)
						}}
						data-testid="set-image-load-error"
					/>
				</div>
			)
		}

		// Fallback for no screenshot
		return (
			<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
				<Image className="size-4" />
			</div>
		)
	}

	// Get display title for tooltip
	const getDisplayTitle = () => {
		return item.title || item.path.split("/").pop() || "Untitled"
	}

	const isLastSlide = totalSlides === 1
	const quickActions = [
		{
			label: t("fileViewer.addToCurrentChat"),
			icon: MessageSquare,
			onClick: onAddToCurrentChat,
		},
		{
			label: t("fileViewer.insertBelow"),
			icon: ArrowDown,
			onClick: onInsertBelow,
		},
		{
			label: t("fileViewer.duplicateSlide"),
			icon: Copy,
			onClick: onDuplicate,
		},
	].filter((action) => action.onClick)

	// Extract current file name from path (without extension)
	const getCurrentFileName = () => {
		const fileName = item.path.split("/").pop() || ""
		return fileName.replace(/\.html$/, "")
	}

	// Handle rename dialog open
	const handleOpenRenameDialog = () => {
		setRenameValue(getCurrentFileName())
		setIsRenameDialogOpen(true)
	}

	// Handle rename confirm
	const handleRenameConfirm = () => {
		if (renameValue.trim() && onRename) {
			onRename(renameValue.trim())
		}
		setIsRenameDialogOpen(false)
		setRenameValue("")
	}

	// Handle rename cancel
	const handleRenameCancel = () => {
		setIsRenameDialogOpen(false)
		setRenameValue("")
	}

	const main = (
		<div
			data-testid={`ppt-sidebar-slide-item-${item.id}`}
			data-selected={isSelected}
			role="group"
			tabIndex={0}
			aria-label={t("ppt.batch.page", { page: item.index + 1 })}
			data-slide-id={item.id}
			data-slide-index={item.index}
			className={cn(
				"group/slide group relative rounded transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isSelected && "bg-accent ring-1 ring-primary/40",
				isMobile
					? // Mobile: vertical layout with thumbnail first, no drag cursor
						"flex h-full w-[140px] shrink-0 cursor-pointer !flex-col gap-1.5"
					: // Desktop: vertical layout with thumbnail first, drag cursor
						"flex cursor-grab flex-col active:cursor-grabbing",
				className,
			)}
			onClick={onClick}
			onKeyDown={(event) => {
				if (
					event.target !== event.currentTarget ||
					(event.key !== "Enter" && event.key !== " ")
				)
					return
				event.preventDefault()
				onClick(event)
			}}
			draggable={allowEdit && !isMobile}
			onDragStart={(e) => {
				// 1. Set data for MessageEditor drag-to-insert
				if (slideFileId) {
					const fileName = item.path.split("/").pop() || item.path
					handlePPTSlideDragStart(e, {
						file_id: slideFileId,
						file_name: fileName,
						relative_file_path: slideFullRelativePath || item.path,
						file_extension: "html",
						slide_index: item.index,
						slide_title: item.title,
					})
				}
				// 2. Trigger internal sort start without replacing the native DataTransfer flow.
				onSlideDragStart?.(e, item.id)
			}}
		>
			{/* Slide info: number and title below thumbnail */}
			<div
				className={cn(
					"flex w-full items-center gap-1 px-1",
					isMobile ? "justify-center" : "justify-start",
				)}
			>
				{selectionMode ? (
					<Checkbox
						checked={isSelected}
						disabled={!slideFileId || !onSelect}
						aria-label={t("ppt.batch.selectPage", { page: item.index + 1 })}
						onClick={(event) => {
							event.stopPropagation()
							onSelect?.(event.shiftKey)
						}}
						onDragStart={(event) => {
							event.preventDefault()
							event.stopPropagation()
						}}
					/>
				) : null}
				<span className="shrink-0 text-sm font-medium">{item.index + 1}</span>
				<div className="min-w-0 flex-1">
					<SmartTooltip
						className="w-full text-xs text-muted-foreground"
						content={getDisplayTitle()}
					>
						{getDisplayTitle()}
					</SmartTooltip>
				</div>
			</div>
			{/* Slide thumbnail with image preview */}
			<div
				data-testid={`ppt-sidebar-slide-thumbnail-${item.id}`}
				className={cn(
					"relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-muted p-0.5 shadow-sm transition-shadow group-hover:shadow",
					"min-h-[90px] w-full",
					isActive
						? "border-primary"
						: "border-transparent bg-background hover:border-accent",
				)}
				style={{ aspectRatio: `${slideDimensions.width} / ${slideDimensions.height}` }}
			>
				{renderThumbnail()}
				{isHidden ? (
					<span className="absolute right-1 top-1 flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground">
						<EyeOff className="size-4" />
						{t("ppt.batch.hidden")}
					</span>
				) : null}
				{allowEdit && !isMobile && quickActions.length > 0 && (
					// Overlay the preview without changing its size; keep actions reachable by keyboard.
					<div
						className="pointer-events-none absolute bottom-1.5 right-1.5 flex gap-0.5 rounded-md border border-white/30 bg-background/70 p-0.5 opacity-0 shadow-sm backdrop-blur-md transition-opacity group-focus-within/slide:pointer-events-auto group-focus-within/slide:opacity-100 group-hover/slide:pointer-events-auto group-hover/slide:opacity-100 dark:border-white/10"
						onClick={(event) => event.stopPropagation()}
						// Own and cancel native drag starts so buttons cannot drag the slide.
						draggable
						onDragStart={(event) => {
							event.preventDefault()
							event.stopPropagation()
						}}
					>
						{quickActions.map(({ label, icon: Icon, onClick: onActionClick }) => (
							<MagicTooltip key={label} title={label}>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="size-6 rounded-sm text-foreground/80 hover:bg-background/60 hover:text-foreground"
									aria-label={label}
									onClick={onActionClick}
								>
									<Icon className="size-3.5" />
								</Button>
							</MagicTooltip>
						))}
					</div>
				)}
			</div>
		</div>
	)

	if (!allowEdit) {
		return main
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<span>{main}</span>
				</ContextMenuTrigger>

				{/* Context menu */}
				<ContextMenuContent className="w-56">
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onAddToCurrentChat?.()
						}}
					>
						<MessageSquare className="mr-2 size-4" />
						<span>{t("fileViewer.addToCurrentChat")}</span>
						{!isMobile && (
							<span className="ml-auto inline-flex items-center gap-1 pl-2">
								{addToCurrentChatShortcut.modifiers.map((modifier) => (
									<span
										key={modifier}
										className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-[#f5f5f5] px-1 text-xs text-[#6b7280]"
									>
										{modifier}
									</span>
								))}
								<span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-[#f5f5f5] px-1 text-xs text-[#6b7280]">
									{addToCurrentChatShortcut.key}
								</span>
							</span>
						)}
					</ContextMenuItem>
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onAddToNewChat?.()
						}}
					>
						<MessageSquarePlus className="mr-2 size-4" />
						{t("fileViewer.addToNewChat")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onLocateFile?.()
						}}
					>
						<FileSearch className="mr-2 size-4" />
						{t("fileViewer.locateFile")}
					</ContextMenuItem>
					{onOpenFile && (
						<ContextMenuItem
							disabled={!slideFileId || !slideFullRelativePath}
							onClick={(event) => {
								event.stopPropagation()
								if (slideFileId && slideFullRelativePath) {
									// Open the source file instead of navigating within the deck.
									onOpenFile(slideFileId, slideFullRelativePath)
								}
							}}
						>
							<FileSymlink className="mr-2 size-4" />
							{t("fileViewer.openCorrespondingFile")}
						</ContextMenuItem>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onRefresh?.()
						}}
					>
						<RefreshCw className="mr-2 size-4" />
						{t("fileViewer.refreshSlide")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onInsertAbove?.()
						}}
					>
						<ArrowUp className="mr-2 size-4" />
						{t("fileViewer.insertAbove")}
					</ContextMenuItem>
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onInsertBelow?.()
						}}
					>
						<ArrowDown className="mr-2 size-4" />
						{t("fileViewer.insertBelow")}
					</ContextMenuItem>
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							onDuplicate?.()
						}}
					>
						<Copy className="mr-2 size-4" />
						{t("fileViewer.duplicateSlide")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					{onToggleHidden && (
						<ContextMenuItem onSelect={onToggleHidden}>
							{isHidden ? (
								<Eye className="mr-2 size-4" />
							) : (
								<EyeOff className="mr-2 size-4" />
							)}
							{isHidden ? t("ppt.batch.show") : t("ppt.batch.hide")}
						</ContextMenuItem>
					)}
					{onReplaceTemplate && (
						<>
							<ContextMenuItem
								data-testid="ppt-template-replacement-slide-menu-item"
								onClick={(e) => {
									e.stopPropagation()
									onReplaceTemplate()
								}}
							>
								<LayoutTemplate className="mr-2 size-4" />
								{t("ppt.templateReplacement.replaceSlide")}
							</ContextMenuItem>
							<ContextMenuSeparator />
						</>
					)}
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation()
							handleOpenRenameDialog()
						}}
					>
						<Pencil className="mr-2 size-4" />
						{t("fileViewer.renameSlide")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						variant="destructive"
						disabled={isLastSlide}
						onClick={(e) => {
							e.stopPropagation()
							if (!isLastSlide) {
								onDelete?.()
							}
						}}
					>
						<Trash2 className="mr-2 size-4 text-destructive" />
						{removeOnly ? t("ppt.batch.remove") : t("fileViewer.deleteSlide")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			{/* Rename Dialog */}
			<Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
				<DialogContent className="sm:max-w-[425px]" data-testid="ppt-sidebar-rename-dialog">
					<DialogHeader>
						<DialogTitle>{t("fileViewer.renameSlideDialogTitle")}</DialogTitle>
						<DialogDescription>
							{t("fileViewer.renameSlideDialogPlaceholder")}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<Input
							data-testid="ppt-sidebar-rename-dialog-input"
							value={renameValue}
							onChange={(e) => setRenameValue(e.target.value)}
							placeholder={t("fileViewer.renameSlideDialogPlaceholder")}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleRenameConfirm()
								} else if (e.key === "Escape") {
									handleRenameCancel()
								}
							}}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							data-testid="ppt-sidebar-rename-dialog-cancel"
							onClick={handleRenameCancel}
						>
							{t("fileViewer.renameSlideDialogCancel")}
						</Button>
						<Button
							data-testid="ppt-sidebar-rename-dialog-confirm"
							onClick={handleRenameConfirm}
							disabled={!renameValue.trim()}
						>
							{t("fileViewer.renameSlideDialogConfirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

export default observer(SortableSlideItem)
