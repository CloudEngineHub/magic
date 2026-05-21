import { Search, FileText, Loader2, Upload } from "lucide-react"

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
}: ProjectFilePickerContentProps) {
	return (
		<>
			{/* Local upload action */}
			{onLocalUpload && (
				<div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-2">
					<button
						type="button"
						className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
						onClick={onLocalUpload}
						disabled={loading}
					>
						<Upload className="size-3" />
						{localUploadLabel || "本地上传"}
					</button>
					<span className="text-[10px] text-muted-foreground/50">或粘贴</span>
				</div>
			)}

			{/* Search */}
			<div className="flex items-center gap-2 border-b border-border/50 px-2.5 py-1.5">
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

			{/* File list */}
			<div className="flex-1 overflow-y-auto p-1">
				{files.map((f) => (
					<button
						key={f.file_id}
						type="button"
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/70"
						onClick={() =>
							onSelect(
								f.file_id!,
								f.display_filename || f.file_name || "未命名文件",
								f.relative_file_path || undefined,
							)
						}
						disabled={loading}
					>
						<FileText className="size-3 shrink-0 text-muted-foreground/70" />
						<span className="flex-1 truncate text-foreground/90">
							{f.display_filename || f.file_name}
						</span>
						{selectedPaths.has(f.relative_file_path || "") && (
							<span className="text-primary text-[10px] font-semibold">已选</span>
						)}
					</button>
				))}
				{files.length === 0 && (
					<p className="px-2 py-3 text-center text-[10px] text-muted-foreground/60">
						{searchQuery ? "没有匹配的文件" : "暂无项目文件"}
					</p>
				)}
			</div>

			{/* Loading indicator */}
			{loading && (
				<div className="flex items-center justify-center border-t border-border/50 py-2">
					<Loader2 className="size-3.5 animate-spin text-primary/60" />
				</div>
			)}
		</>
	)
}
