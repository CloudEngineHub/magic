import { useCallback, useRef, useState, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import projectFilesStore from "@/stores/projectFiles"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
} from "@/components/shadcn-ui/dropdown-menu"
import ProjectFilePickerContent from "../picker/ProjectFilePickerContent"
import InlineVoiceButton from "../ui/InlineVoiceButton"
import { useDropZone } from "../../lib/useDropZone"
import type { DropPayload } from "../../lib/projectFileDrag"
import type { SelfMediaProjectFileRef } from "../../lib/projectFileDrag"
import type { MaterialItem } from "../../types"

const ACCEPT_TYPES = "image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
const MATERIAL_VIRTUAL_THRESHOLD = 8
const COMPACT_ROW_HEIGHT = 72
const FULL_ROW_HEIGHT = 96

function generateId(): string {
	return `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface MaterialAttachmentListProps {
	materials: MaterialItem[]
	onChange: (materials: MaterialItem[]) => void
	compact?: boolean
	className?: string
	addLabel?: string
	descriptionPlaceholder?: string
	emptyHint?: string
	/** Enable picking files from the project workspace alongside local upload */
	enableProjectPicker?: boolean
	/** When provided, local files are uploaded to the project immediately after being added. Receives (file, materialId). */
	uploadToProject?: (file: File, materialId: string) => void
}

export default function MaterialAttachmentList({
	materials,
	onChange,
	compact = false,
	className,
	addLabel,
	descriptionPlaceholder,
	emptyHint,
	enableProjectPicker = false,
	uploadToProject,
}: MaterialAttachmentListProps) {
	const { t } = useTranslation("super")
	const inputRef = useRef<HTMLInputElement>(null)
	const [showProjectPicker, setShowProjectPicker] = useState(false)
	const [loadingProjectFile, setLoadingProjectFile] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [pendingProjectFiles, setPendingProjectFiles] = useState<
		Map<string, { fileId: string; fileName: string; filePath?: string }>
	>(() => new Map())

	const handleFiles = useCallback(
		(fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return

			const newItems: MaterialItem[] = Array.from(fileList).map((file) => {
				// Add timestamp to filename to avoid overwriting when pasting multiple times
				const dotIndex = file.name.lastIndexOf(".")
				const uniqueName =
					dotIndex > 0
						? `${file.name.slice(0, dotIndex)}_${Date.now()}${file.name.slice(dotIndex)}`
						: `${file.name}_${Date.now()}`
				const renamedFile = new File([file], uniqueName, {
					type: file.type,
					lastModified: file.lastModified,
				})
				return {
					id: generateId(),
					file: renamedFile,
					previewUrl: renamedFile.type.startsWith("image/")
						? URL.createObjectURL(renamedFile)
						: "",
					description: "",
				}
			})

			onChange([...materials, ...newItems])

			// Upload to project in background if callback is provided
			if (uploadToProject) {
				for (const item of newItems) {
					uploadToProject(item.file, item.id)
				}
			}
		},
		[materials, onChange, uploadToProject],
	)

	const handleRemove = useCallback(
		(id: string) => {
			const item = materials.find((m) => m.id === id)
			if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
			onChange(materials.filter((m) => m.id !== id))
		},
		[materials, onChange],
	)

	const handleDescriptionChange = useCallback(
		(id: string, description: string) => {
			onChange(materials.map((m) => (m.id === id ? { ...m, description } : m)))
		},
		[materials, onChange],
	)

	const selectedPaths = useMemo(
		() => new Set(materials.map((item) => item.uploadedPath).filter((p): p is string => !!p)),
		[materials],
	)

	const addProjectFileRefs = useCallback(
		async (refs: SelfMediaProjectFileRef[]) => {
			const pending = refs.filter((ref) => !ref.filePath || !selectedPaths.has(ref.filePath))
			if (pending.length === 0) return

			setLoadingProjectFile(true)
			try {
				const newItems = await Promise.all(
					pending.map(async ({ fileId, fileName, filePath }) => {
						const blob = (await getFileContentById(fileId, {
							responseType: "blob",
						})) as Blob
						const file = new File([blob], fileName, { type: blob.type })
						const previewUrl = file.type.startsWith("image/")
							? URL.createObjectURL(file)
							: ""
						return {
							id: generateId(),
							file,
							previewUrl,
							description: "",
							uploadedPath: filePath,
						} satisfies MaterialItem
					}),
				)
				onChange([...materials, ...newItems])
				setShowProjectPicker(false)
				setSearchQuery("")
				setPendingProjectFiles(new Map())
			} catch (err) {
				console.error("Failed to load project files:", err)
			} finally {
				setLoadingProjectFile(false)
			}
		},
		[materials, onChange, selectedPaths],
	)

	const handleDropPayload = useCallback(
		(payload: DropPayload) => {
			if (payload.kind === "local") {
				const dt = new DataTransfer()
				payload.files.forEach((file) => dt.items.add(file))
				handleFiles(dt.files)
				return
			}
			void addProjectFileRefs(payload.files)
		},
		[addProjectFileRefs, handleFiles],
	)

	const { isDragging, dropZoneProps } = useDropZone({
		disabled: loadingProjectFile,
		onDropPayload: handleDropPayload,
	})

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const clipboardData = e.clipboardData
			if (!clipboardData) return

			// Try to get files directly from clipboard
			if (clipboardData.files && clipboardData.files.length > 0) {
				e.preventDefault()
				handleFiles(clipboardData.files)
				return
			}

			// Fallback: extract files from clipboard items (e.g., pasted screenshots)
			const items = clipboardData.items
			if (!items) return

			const files: File[] = []
			for (let i = 0; i < items.length; i++) {
				const item = items[i]
				if (item.kind === "file") {
					const file = item.getAsFile()
					if (file) files.push(file)
				}
			}

			if (files.length > 0) {
				e.preventDefault()
				const dt = new DataTransfer()
				files.forEach((f) => dt.items.add(f))
				handleFiles(dt.files)
			}
		},
		[handleFiles],
	)

	// Also listen for document-level paste when the dropdown is open
	useEffect(() => {
		if (!showProjectPicker) return
		const handler = (e: ClipboardEvent) => {
			const activeEl = document.activeElement
			if (activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA") return

			const clipboardData = e.clipboardData
			if (!clipboardData) return

			const files: File[] = []
			if (clipboardData.files && clipboardData.files.length > 0) {
				files.push(...Array.from(clipboardData.files))
			} else if (clipboardData.items) {
				for (let i = 0; i < clipboardData.items.length; i++) {
					const item = clipboardData.items[i]
					if (item.kind === "file") {
						const file = item.getAsFile()
						if (file) files.push(file)
					}
				}
			}

			if (files.length > 0) {
				e.preventDefault()
				const dt = new DataTransfer()
				files.forEach((f) => dt.items.add(f))
				handleFiles(dt.files)
				setShowProjectPicker(false)
				setSearchQuery("")
			}
		}
		document.addEventListener("paste", handler)
		return () => document.removeEventListener("paste", handler)
	}, [showProjectPicker, handleFiles])

	const projectFiles = useMemo(
		() =>
			enableProjectPicker
				? projectFilesStore.workspaceFilesList.filter((f) => !f.is_directory)
				: [],
		[enableProjectPicker],
	)

	const filteredProjectFiles = useMemo(() => {
		if (!searchQuery.trim()) return projectFiles
		const query = searchQuery.toLowerCase()
		return projectFiles.filter(
			(f) =>
				(f.display_filename || f.file_name || "").toLowerCase().includes(query) ||
				(f.relative_file_path || "").toLowerCase().includes(query),
		)
	}, [projectFiles, searchQuery])

	const handleProjectFileSelect = useCallback(
		async (fileId: string, fileName: string, relativePath?: string) => {
			if (relativePath && selectedPaths.has(relativePath)) {
				setShowProjectPicker(false)
				setSearchQuery("")
				return
			}

			setLoadingProjectFile(true)
			try {
				const blob = (await getFileContentById(fileId, {
					responseType: "blob",
				})) as Blob
				const file = new File([blob], fileName, { type: blob.type })
				const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : ""
				const newItem: MaterialItem = {
					id: generateId(),
					file,
					previewUrl,
					description: "",
					uploadedPath: relativePath,
				}
				onChange([...materials, newItem])
				setShowProjectPicker(false)
				setSearchQuery("")
				setPendingProjectFiles(new Map())
			} catch (err) {
				console.error("Failed to load project file:", err)
			} finally {
				setLoadingProjectFile(false)
			}
		},
		[materials, onChange, selectedPaths],
	)

	const handleProjectFileToggle = useCallback(
		(fileId: string, fileName: string, filePath?: string) => {
			if (filePath && selectedPaths.has(filePath)) return

			setPendingProjectFiles((prev) => {
				const next = new Map(prev)
				if (next.has(fileId)) {
					next.delete(fileId)
				} else {
					next.set(fileId, { fileId, fileName, filePath })
				}
				return next
			})
		},
		[selectedPaths],
	)

	const handleConfirmProjectFiles = useCallback(async () => {
		if (pendingProjectFiles.size === 0) return
		await addProjectFileRefs(Array.from(pendingProjectFiles.values()))
	}, [addProjectFileRefs, pendingProjectFiles])

	const handleOpenChange = useCallback((open: boolean) => {
		setShowProjectPicker(open)
		if (!open) {
			setSearchQuery("")
			setPendingProjectFiles(new Map())
		}
	}, [])

	const handleLocalUpload = useCallback(() => {
		inputRef.current?.click()
		setShowProjectPicker(false)
		setSearchQuery("")
	}, [])

	const dropdownContent = enableProjectPicker ? (
		<DropdownMenuContent
			align="start"
			sideOffset={4}
			className="flex max-h-96 w-72 flex-col overflow-hidden p-0"
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<ProjectFilePickerContent
				files={filteredProjectFiles}
				loading={loadingProjectFile}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				onSelect={handleProjectFileSelect}
				selectedPaths={selectedPaths}
				onLocalUpload={handleLocalUpload}
				multiSelect
				pendingIds={new Set(pendingProjectFiles.keys())}
				onToggle={handleProjectFileToggle}
				onConfirm={handleConfirmProjectFiles}
				pendingCount={pendingProjectFiles.size}
				confirmLabel={t("detail.selfMedia.initPanel.referenceFilePicker.confirmSelection", {
					count: pendingProjectFiles.size,
					defaultValue: "确认添加 ({{count}})",
				})}
			/>
		</DropdownMenuContent>
	) : null

	const listRef = useRef<HTMLDivElement>(null)
	const useVirtualList = materials.length >= MATERIAL_VIRTUAL_THRESHOLD
	const rowHeight = compact ? COMPACT_ROW_HEIGHT : FULL_ROW_HEIGHT

	const virtualizer = useVirtualizer({
		count: materials.length,
		getScrollElement: () => listRef.current,
		estimateSize: () => rowHeight,
		overscan: 4,
		enabled: useVirtualList,
	})

	const renderMaterialRow = (item: MaterialItem) => (
		<MaterialAttachmentRow
			key={item.id}
			item={item}
			compact={compact}
			descriptionPlaceholder={descriptionPlaceholder}
			onRemove={handleRemove}
			onDescriptionChange={handleDescriptionChange}
		/>
	)

	return (
		<div
			className={cn(
				"relative space-y-2 transition-colors",
				isDragging && "bg-primary/[0.03] ring-1 ring-primary/30",
				className,
			)}
			onPaste={handlePaste}
			tabIndex={-1}
			{...dropZoneProps}
		>
			{isDragging ? (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border border-dashed border-primary/40 bg-primary/5 text-[11px] font-semibold text-primary">
					{t("detail.selfMedia.initPanel.referenceFilePicker.dropHere", "拖放文件到这里")}
				</div>
			) : null}
			{compact ? (
				enableProjectPicker ? (
					<DropdownMenu open={showProjectPicker} onOpenChange={handleOpenChange}>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="inline-flex items-center gap-1 border-b border-dashed border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
								</svg>
								{addLabel || "添加附件"}
							</button>
						</DropdownMenuTrigger>
						{dropdownContent}
					</DropdownMenu>
				) : (
					<button
						type="button"
						className="inline-flex items-center gap-1 border-b border-dashed border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
						onClick={() => inputRef.current?.click()}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
						</svg>
						{addLabel || "添加附件"}
					</button>
				)
			) : enableProjectPicker ? (
				<DropdownMenu open={showProjectPicker} onOpenChange={handleOpenChange}>
					<DropdownMenuTrigger asChild>
						<div className="flex cursor-pointer items-center justify-center border-b border-dashed border-zinc-950/15 bg-zinc-50/40 px-4 py-5 transition-colors hover:bg-primary/[0.03] focus:border-primary/40 focus:outline-none">
							<div className="flex flex-col items-center gap-1.5 text-center">
								<div className="flex h-9 w-9 items-center justify-center bg-primary/10">
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										className="text-primary"
									>
										<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
										<polyline points="17 8 12 3 7 8" />
										<line x1="12" y1="3" x2="12" y2="15" />
									</svg>
								</div>
								<p className="text-sm font-medium text-foreground">
									{addLabel || "点击、拖拽或粘贴上传附件"}
								</p>
								{emptyHint && (
									<p className="text-xs text-muted-foreground">{emptyHint}</p>
								)}
							</div>
						</div>
					</DropdownMenuTrigger>
					{dropdownContent}
				</DropdownMenu>
			) : (
				<div
					className="flex cursor-pointer items-center justify-center border-b border-dashed border-zinc-950/15 bg-zinc-50/40 px-4 py-5 transition-colors hover:bg-primary/[0.03] focus:border-primary/40 focus:outline-none"
					onClick={() => inputRef.current?.click()}
				>
					<div className="flex flex-col items-center gap-1.5 text-center">
						<div className="flex h-9 w-9 items-center justify-center bg-primary/10">
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								className="text-primary"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
						</div>
						<p className="text-sm font-medium text-foreground">
							{addLabel || "点击、拖拽或粘贴上传附件"}
						</p>
						{emptyHint && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
					</div>
				</div>
			)}

			<input
				ref={inputRef}
				type="file"
				multiple
				accept={ACCEPT_TYPES}
				className="hidden"
				onChange={(e) => {
					handleFiles(e.target.files)
					e.target.value = ""
				}}
			/>

			{materials.length > 0 ? (
				useVirtualList ? (
					<div
						ref={listRef}
						className="max-h-80 overflow-y-auto"
						style={{ contentVisibility: "auto" as const }}
					>
						<div
							className="relative w-full"
							style={{ height: `${virtualizer.getTotalSize()}px` }}
						>
							{virtualizer.getVirtualItems().map((virtualItem) => {
								const item = materials[virtualItem.index]
								return (
									<div
										key={item.id}
										className="absolute left-0 top-0 w-full pb-2"
										style={{ transform: `translateY(${virtualItem.start}px)` }}
									>
										{renderMaterialRow(item)}
									</div>
								)
							})}
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-2">{materials.map(renderMaterialRow)}</div>
				)
			) : null}
		</div>
	)
}

interface MaterialAttachmentRowProps {
	item: MaterialItem
	compact: boolean
	descriptionPlaceholder?: string
	onRemove: (id: string) => void
	onDescriptionChange: (id: string, description: string) => void
}

function MaterialAttachmentRow({
	item,
	compact,
	descriptionPlaceholder,
	onRemove,
	onDescriptionChange,
}: MaterialAttachmentRowProps) {
	return (
		<div
			className={cn(
				"group flex gap-2 rounded-lg border bg-background shadow-xs transition-all hover:border-primary/40 hover:bg-accent/30",
				compact ? "p-2" : "gap-3 p-3",
			)}
		>
			<div
				className={cn(
					"relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/50",
					compact ? "h-10 w-10" : "h-16 w-16",
				)}
			>
				{item.previewUrl ? (
					<img
						src={item.previewUrl}
						alt={item.file.name}
						className="h-full w-full object-cover"
					/>
				) : (
					<svg
						width={compact ? 16 : 24}
						height={compact ? 16 : 24}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						className="text-muted-foreground"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
				)}
				<button
					type="button"
					className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
					onClick={() => onRemove(item.id)}
				>
					<svg width="8" height="8" viewBox="0 0 12 12" fill="none">
						<path
							d="M9 3L3 9M3 3l6 6"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-xs font-medium text-foreground">
						{item.file.name}
					</span>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{formatFileSize(item.file.size)}
					</span>
				</div>
				<div className="group relative">
					<input
						type="text"
						className="w-full border-0 border-b border-zinc-200 bg-zinc-50/40 px-2 py-1 pr-6 text-xs outline-none transition-all placeholder:text-muted-foreground/60 focus:border-zinc-950 focus:bg-primary/[0.03]"
						placeholder={descriptionPlaceholder || "添加说明…"}
						value={item.description}
						onChange={(e) => onDescriptionChange(item.id, e.target.value)}
					/>
					<InlineVoiceButton
						value={item.description}
						onResult={(text) => onDescriptionChange(item.id, text)}
					/>
				</div>
			</div>
		</div>
	)
}
