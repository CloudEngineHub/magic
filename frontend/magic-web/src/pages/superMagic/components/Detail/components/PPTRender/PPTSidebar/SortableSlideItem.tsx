import { useState, useMemo, useEffect } from "react"
import {
	Image,
	Loader2,
	ArrowUp,
	ArrowDown,
	Trash2,
	Pencil,
	Sparkles,
	MessageSquarePlus,
	MessageSquare,
	FileSearch,
	RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubTrigger,
	ContextMenuSubContent,
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
import type { SortableSlideItemProps } from "./types"
import { useAIEdit } from "../hooks/useAIEdit"
import { observer } from "mobx-react-lite"
import SmartTooltip from "@/components/other/SmartTooltip"
import { useScreenshotRetry } from "./hooks/useScreenshotRetry"
import { handlePPTSlideDragStart } from "../../../../MessageEditor/utils/drag"
import { resolvePptScaleContentDimensions } from "../../../contents/HTML/utils/slide-dimensions"

function SortableSlideItem({
	item,
	isActive,
	onClick,
	screenshot,
	totalSlides,
	onInsertAbove,
	onInsertBelow,
	onDelete,
	onRename,
	onAddToCurrentChat,
	onAddToNewChat,
	onLocateFile,
	onRefresh,
	onRegenerateScreenshot,
	mainFileId,
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

	// Build current file info for this slide (each slide is an HTML file)
	const currentFile = useMemo(() => {
		if (!mainFileId || !item.path) return undefined

		// Extract file name from path (e.g., "slides/page1.html" -> "page1.html")
		const fileName = item.path.split("/").pop() || item.path
		// Get file extension (should be "html")
		const fileExtension = fileName.split(".").pop() || "html"

		return {
			file_id: mainFileId, // Use main file ID as parent
			file_name: fileName,
			relative_file_path: slideFullRelativePath || item.path,
			file_extension: fileExtension,
		}
	}, [mainFileId, item.path, slideFullRelativePath])

	// Use AI edit hook
	const { aiEditItems } = useAIEdit({ currentFile })

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
			data-slide-id={item.id}
			data-slide-index={item.index}
			className={cn(
				"group relative rounded transition-[background-color,box-shadow]",
				isMobile
					? // Mobile: vertical layout with thumbnail first, no drag cursor
						"flex h-full w-[140px] shrink-0 cursor-pointer !flex-col gap-1.5"
					: // Desktop: vertical layout with thumbnail first, drag cursor
						"flex cursor-grab flex-col active:cursor-grabbing",
				className,
			)}
			onClick={onClick}
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
					<ContextMenuSeparator />
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
					{/* AI Edit submenu */}
					{currentFile && aiEditItems.length > 0 && (
						<>
							<ContextMenuSub>
								<ContextMenuSubTrigger>
									<Sparkles className="mr-4 size-4" />
									{t("fileViewer.aiEdit")}
								</ContextMenuSubTrigger>
								<ContextMenuSubContent className="w-56">
									{aiEditItems.map((aiItem) => (
										<ContextMenuItem
											key={aiItem.key}
											onClick={(e) => {
												e.stopPropagation()
												aiItem.onClick()
											}}
										>
											<span className="mr-2">{aiItem.icon}</span>
											<div className="flex flex-col">
												<span className="text-sm font-medium">
													{aiItem.label}
												</span>
												<span className="text-xs text-muted-foreground">
													{aiItem.description}
												</span>
											</div>
										</ContextMenuItem>
									))}
								</ContextMenuSubContent>
							</ContextMenuSub>
							<ContextMenuSeparator />
						</>
					)}
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
						{t("fileViewer.deleteSlide")}
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
