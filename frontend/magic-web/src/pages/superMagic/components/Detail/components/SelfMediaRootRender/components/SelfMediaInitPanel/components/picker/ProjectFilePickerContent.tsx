import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, FileText, Loader2, Upload, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { setProjectFilePickerDragData } from "../../lib/projectFileDrag"

const VIRTUAL_LIST_THRESHOLD = 20
const FILE_ROW_HEIGHT = 28

interface ProjectFilePickerContentProps {
	files: Array<{
		file_id?: string
		file_name?: string
		display_filename?: string
		relative_file_path?: string | null
	}>
	loading: boolean
	searchQuery: string
	onSearchChange: (q: string) => void
	onSelect: (fileId: string, fileName: string, relativePath?: string) => void
	selectedPaths: Set<string>
	/** If provided, renders a "本地上传" button at the top */
	onLocalUpload?: () => void
	/** Override the local upload button label */
	localUploadLabel?: string
	/** Enable multi-select with confirm footer */
	multiSelect?: boolean
	pendingIds?: Set<string>
	onToggle?: (fileId: string, fileName: string, relativePath?: string) => void
	onConfirm?: () => void
	confirmLabel?: string
	pendingCount?: number
}

interface ProjectFileRowProps {
	fileId: string
	fileName: string
	filePath?: string
	isAlreadyAdded: boolean
	isPending: boolean
	loading: boolean
	multiSelect: boolean
	onSelect: (fileId: string, fileName: string, relativePath?: string) => void
	onToggle?: (fileId: string, fileName: string, relativePath?: string) => void
}

function ProjectFileRow({
	fileId,
	fileName,
	filePath,
	isAlreadyAdded,
	isPending,
	loading,
	multiSelect,
	onSelect,
	onToggle,
}: ProjectFileRowProps) {
	const canDrag = !isAlreadyAdded && !loading

	return (
		<button
			type="button"
			draggable={canDrag}
			className={cn(
				"flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/70",
				multiSelect && isPending && "bg-primary/10",
				isAlreadyAdded && "opacity-50",
				canDrag && "cursor-grab active:cursor-grabbing",
			)}
			onClick={() => {
				if (isAlreadyAdded) return
				if (multiSelect && onToggle) {
					onToggle(fileId, fileName, filePath)
					return
				}
				onSelect(fileId, fileName, filePath)
			}}
			onDragStart={(e) => {
				if (!canDrag) {
					e.preventDefault()
					return
				}
				e.stopPropagation()
				setProjectFilePickerDragData(e.dataTransfer, {
					fileId,
					fileName,
					filePath,
				})
			}}
			disabled={loading || isAlreadyAdded}
		>
			{multiSelect ? (
				<span
					className={cn(
						"flex size-3.5 shrink-0 items-center justify-center border",
						isPending
							? "border-primary bg-primary text-primary-foreground"
							: "border-border/70 bg-background",
					)}
				>
					{isPending ? <Check className="size-2.5" /> : null}
				</span>
			) : (
				<FileText className="size-3 shrink-0 text-muted-foreground/70" />
			)}
			<span className="flex-1 truncate text-foreground/90">{fileName}</span>
			{isAlreadyAdded ? (
				<span className="text-primary text-[10px] font-semibold">已选</span>
			) : null}
		</button>
	)
}

/**
 * Reusable project file picker content — search + file list used inside
 * DropdownMenuContent of both MaterialAttachmentList and ReferenceFilePicker.
 */
export default function ProjectFilePickerContent({
	files,
	loading,
	searchQuery,
	onSearchChange,
	onSelect,
	selectedPaths,
	onLocalUpload,
	localUploadLabel,
	multiSelect = false,
	pendingIds,
	onToggle,
	onConfirm,
	confirmLabel,
	pendingCount = 0,
}: ProjectFilePickerContentProps) {
	const listRef = useRef<HTMLDivElement>(null)
	const useVirtualList = files.length >= VIRTUAL_LIST_THRESHOLD

	const virtualizer = useVirtualizer({
		count: files.length,
		getScrollElement: () => listRef.current,
		estimateSize: () => FILE_ROW_HEIGHT,
		overscan: 8,
		enabled: useVirtualList,
	})

	const renderRow = (index: number) => {
		const f = files[index]
		const fileId = f.file_id!
		const fileName = f.display_filename || f.file_name || "未命名文件"
		const filePath = f.relative_file_path || undefined
		const isAlreadyAdded = selectedPaths.has(f.relative_file_path || "")
		const isPending = pendingIds?.has(fileId) ?? false

		return (
			<ProjectFileRow
				key={fileId}
				fileId={fileId}
				fileName={fileName}
				filePath={filePath}
				isAlreadyAdded={isAlreadyAdded}
				isPending={isPending}
				loading={loading}
				multiSelect={multiSelect}
				onSelect={onSelect}
				onToggle={onToggle}
			/>
		)
	}

	return (
		<>
			{/* Local upload action */}
			{onLocalUpload && (
				<div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2.5 py-2">
					<button
						type="button"
						className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
						onClick={onLocalUpload}
						disabled={loading}
					>
						<Upload className="size-3" />
						{localUploadLabel || "本地上传"}
					</button>
					<span className="text-[10px] text-muted-foreground/50">或粘贴 / 拖拽</span>
				</div>
			)}

			{/* Search */}
			<div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-2.5 py-1.5">
				<Search className="size-3 shrink-0 text-muted-foreground/60" />
				<input
					type="text"
					className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
					placeholder="搜索文件..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					onKeyDown={(e) => e.stopPropagation()}
					autoFocus
				/>
			</div>

			{/* File list — flex-1 + min-h-0 keeps footer visible inside max-h container */}
			<div ref={listRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1">
				{files.length === 0 ? (
					<p className="px-2 py-3 text-center text-[10px] text-muted-foreground/60">
						{searchQuery ? "没有匹配的文件" : "暂无项目文件"}
					</p>
				) : useVirtualList ? (
					<div
						className="relative w-full"
						style={{ height: `${virtualizer.getTotalSize()}px` }}
					>
						{virtualizer.getVirtualItems().map((virtualItem) => (
							<div
								key={virtualItem.key}
								data-index={virtualItem.index}
								className="absolute left-0 top-0 w-full"
								style={{ transform: `translateY(${virtualItem.start}px)` }}
							>
								{renderRow(virtualItem.index)}
							</div>
						))}
					</div>
				) : (
					files.map((_, index) => renderRow(index))
				)}
			</div>

			{multiSelect && onConfirm ? (
				<div className="flex shrink-0 flex-col gap-2 border-t border-border/50 px-2.5 py-2">
					<span className="text-[10px] leading-snug text-muted-foreground/70">
						{pendingCount > 0
							? `已选 ${pendingCount} 个`
							: "可多选确认，或拖拽到目标区域"}
					</span>
					<button
						type="button"
						className="w-full bg-primary px-2.5 py-1.5 text-[11px] font-black text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						onClick={onConfirm}
						disabled={loading || pendingCount === 0}
					>
						{confirmLabel || "确认添加"}
					</button>
				</div>
			) : null}

			{/* Loading indicator */}
			{loading && (
				<div className="flex shrink-0 items-center justify-center border-t border-border/50 py-2">
					<Loader2 className="size-3.5 animate-spin text-primary/60" />
				</div>
			)}
		</>
	)
}
