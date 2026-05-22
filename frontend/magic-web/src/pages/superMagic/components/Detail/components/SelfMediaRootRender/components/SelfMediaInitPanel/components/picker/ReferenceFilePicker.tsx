import { useState, useCallback, useRef, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Upload, FolderOpen, X, Loader2, Plus } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
} from "@/components/shadcn-ui/dropdown-menu"
import projectFilesStore from "@/stores/projectFiles"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import { cn } from "@/lib/utils"
import ProjectFilePickerContent from "./ProjectFilePickerContent"
import { useDropZone } from "../../lib/useDropZone"
import type { DropPayload } from "../../lib/projectFileDrag"
import type { SelfMediaProjectFileRef } from "../../lib/projectFileDrag"
import type { ReferenceFileValue } from "../../types"

export type { ReferenceFileValue }

interface ReferenceFilePickerProps {
	value: ReferenceFileValue[]
	onChange: (value: ReferenceFileValue[]) => void
	/** Max selectable files; omit for unlimited */
	maxFiles?: number
	disabled?: boolean
	onError?: (message: string) => void
	/** Compact mode: render as a small icon button */
	compact?: boolean
	/** Custom label for the upload button (overrides default "上传参考资料") */
	label?: string
	className?: string
}

const TEXT_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"css",
	"scss",
	"less",
	"html",
	"htm",
	"js",
	"jsx",
	"ts",
	"tsx",
	"json",
	"xml",
	"svg",
	"csv",
	"yaml",
	"yml",
	"vue",
])

function isTextFileName(name: string): boolean {
	const ext = name.split(".").pop()?.toLowerCase() || ""
	return TEXT_EXTENSIONS.has(ext)
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

function readLocalFile(file: File): Promise<ReferenceFileValue> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		const asText = file.type.startsWith("text/") || isTextFileName(file.name)
		reader.onload = () =>
			resolve({
				name: file.name,
				content: reader.result as string,
				kind: asText ? "text" : "data-url",
			})
		reader.onerror = () => reject(reader.error)
		if (asText) reader.readAsText(file)
		else reader.readAsDataURL(file)
	})
}

async function readProjectFile(
	fileId: string,
	fileName: string,
	filePath?: string,
): Promise<ReferenceFileValue> {
	if (isTextFileName(fileName)) {
		const content = (await getFileContentById(fileId, {
			responseType: "text",
		})) as string
		return { name: fileName, content, kind: "text", file_id: fileId, file_path: filePath }
	}

	const blob = (await getFileContentById(fileId, {
		responseType: "blob",
	})) as Blob
	const content = await blobToDataUrl(blob)
	return { name: fileName, content, kind: "data-url", file_id: fileId, file_path: filePath }
}

export default function ReferenceFilePicker({
	value,
	onChange,
	maxFiles,
	disabled = false,
	onError,
	compact = false,
	label,
	className,
}: ReferenceFilePickerProps) {
	const { t } = useTranslation("super")
	const [showProjectPicker, setShowProjectPicker] = useState(false)
	const [loadingProjectFile, setLoadingProjectFile] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [pendingProjectFiles, setPendingProjectFiles] = useState<
		Map<string, { fileId: string; fileName: string; filePath?: string }>
	>(() => new Map())
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const dropZoneRef = useRef<HTMLDivElement | null>(null)

	const canAddMore = maxFiles == null || value.length < maxFiles
	const allowMultiSelect = maxFiles == null || maxFiles > 1

	const appendFiles = useCallback(
		(files: ReferenceFileValue[]) => {
			if (!files.length) return
			const limit = maxFiles ?? Infinity
			const remaining = limit - value.length
			if (remaining <= 0) return
			onChange([...value, ...files.slice(0, remaining)])
		},
		[maxFiles, onChange, value],
	)

	const selectedPaths = useMemo(
		() =>
			new Set(
				value
					.filter((v) => v.file_path)
					.map((v) => v.file_path!)
					.filter((p): p is string => !!p),
			),
		[value],
	)

	const addProjectFileRefs = useCallback(
		async (refs: SelfMediaProjectFileRef[]) => {
			const pending = refs.filter((ref) => !ref.filePath || !selectedPaths.has(ref.filePath))
			if (pending.length === 0) return

			setLoadingProjectFile(true)
			try {
				const limit = maxFiles ?? Infinity
				const remaining = limit - value.length
				const selections = pending.slice(0, remaining)
				const files = await Promise.all(
					selections.map(({ fileId, fileName, filePath }) =>
						readProjectFile(fileId, fileName, filePath),
					),
				)
				appendFiles(files)
				setShowProjectPicker(false)
				setSearchQuery("")
				setPendingProjectFiles(new Map())
			} catch {
				onError?.(t("detail.selfMedia.initPanel.referenceFilePicker.readProjectError"))
			} finally {
				setLoadingProjectFile(false)
			}
		},
		[appendFiles, maxFiles, onError, selectedPaths, t, value.length],
	)

	const handleLocalFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const fileList = e.target.files
			if (!fileList?.length) return

			const readers = Array.from(fileList).map((file) => readLocalFile(file))
			void Promise.all(readers)
				.then(appendFiles)
				.catch(() => {
					onError?.(t("detail.selfMedia.initPanel.referenceFilePicker.readLocalError"))
				})
			e.target.value = ""
		},
		[appendFiles, onError, t],
	)

	const handleDropPayload = useCallback(
		(payload: DropPayload) => {
			if (disabled || !canAddMore) return

			if (payload.kind === "local") {
				const readers = payload.files.map((file) => readLocalFile(file))
				void Promise.all(readers)
					.then(appendFiles)
					.catch(() => {
						onError?.(
							t("detail.selfMedia.initPanel.referenceFilePicker.readLocalError"),
						)
					})
				return
			}

			void addProjectFileRefs(payload.files)
		},
		[addProjectFileRefs, appendFiles, canAddMore, disabled, onError, t],
	)

	const { isDragging, dropZoneProps } = useDropZone({
		disabled: disabled || !canAddMore || loadingProjectFile,
		onDropPayload: handleDropPayload,
	})

	const handleProjectFileSelect = useCallback(
		async (fileId: string, fileName: string, filePath?: string) => {
			setLoadingProjectFile(true)
			try {
				appendFiles([await readProjectFile(fileId, fileName, filePath)])
				setShowProjectPicker(false)
				setSearchQuery("")
				setPendingProjectFiles(new Map())
			} catch {
				onError?.(t("detail.selfMedia.initPanel.referenceFilePicker.readProjectError"))
			} finally {
				setLoadingProjectFile(false)
			}
		},
		[appendFiles, onError, t],
	)

	const handleProjectFileToggle = useCallback(
		(fileId: string, fileName: string, filePath?: string) => {
			setPendingProjectFiles((prev) => {
				const next = new Map(prev)
				if (next.has(fileId)) {
					next.delete(fileId)
				} else {
					const limit = maxFiles ?? Infinity
					const remaining = limit - value.length
					if (next.size >= remaining) return prev
					next.set(fileId, { fileId, fileName, filePath })
				}
				return next
			})
		},
		[maxFiles, value.length],
	)

	const handleConfirmProjectFiles = useCallback(async () => {
		if (pendingProjectFiles.size === 0) return
		await addProjectFileRefs(Array.from(pendingProjectFiles.values()))
	}, [addProjectFileRefs, pendingProjectFiles])

	const handleRemove = useCallback(
		(index: number) => {
			onChange(value.filter((_, i) => i !== index))
		},
		[onChange, value],
	)

	const handleOpenChange = useCallback((open: boolean) => {
		setShowProjectPicker(open)
		if (!open) {
			setSearchQuery("")
			setPendingProjectFiles(new Map())
		}
	}, [])

	const handleLocalUpload = useCallback(() => {
		fileInputRef.current?.click()
		setShowProjectPicker(false)
		setSearchQuery("")
	}, [])

	const isDisabled = disabled || loadingProjectFile

	const projectFiles = projectFilesStore.workspaceFilesList.filter((f) => !f.is_directory)

	const filteredProjectFiles = useMemo(() => {
		if (!searchQuery.trim()) return projectFiles
		const query = searchQuery.toLowerCase()
		return projectFiles.filter(
			(f) =>
				(f.display_filename || f.file_name || "").toLowerCase().includes(query) ||
				(f.relative_file_path || "").toLowerCase().includes(query),
		)
	}, [projectFiles, searchQuery])

	// Shared dropdown content for project file picker
	const dropdownContent = canAddMore ? (
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
				onLocalUpload={compact ? handleLocalUpload : undefined}
				localUploadLabel={
					compact
						? t("detail.selfMedia.initPanel.referenceFilePicker.localUpload")
						: undefined
				}
				multiSelect={allowMultiSelect}
				pendingIds={new Set(pendingProjectFiles.keys())}
				onToggle={handleProjectFileToggle}
				onConfirm={allowMultiSelect ? handleConfirmProjectFiles : undefined}
				pendingCount={pendingProjectFiles.size}
				confirmLabel={t("detail.selfMedia.initPanel.referenceFilePicker.confirmSelection", {
					count: pendingProjectFiles.size,
					defaultValue: "确认添加 ({{count}})",
				})}
			/>
		</DropdownMenuContent>
	) : null

	return (
		<div className={cn("relative", compact && "w-full", className)}>
			{/* Compact mode: just an icon button */}
			{compact ? (
				<>
					<input
						ref={fileInputRef}
						type="file"
						multiple={allowMultiSelect}
						className="hidden"
						onChange={handleLocalFileSelect}
					/>
					<div
						className={cn(
							"relative flex w-full flex-wrap items-center gap-1.5 transition-colors",
							isDragging && "bg-primary/5 ring-1 ring-primary/30",
						)}
						{...dropZoneProps}
					>
						{isDragging ? (
							<span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/5 text-[10px] font-semibold text-primary">
								{t(
									"detail.selfMedia.initPanel.referenceFilePicker.dropHere",
									"拖放文件到这里",
								)}
							</span>
						) : null}
						{value.length > 0 && (
							<div className="flex items-center gap-1.5">
								{value.map((file, index) => (
									<div
										key={`${file.name}-${index}`}
										className="group flex items-center gap-1.5 border-l-2 border-primary/60 bg-primary/10 px-2 py-1 text-zinc-700 transition-colors hover:bg-primary/15"
									>
										<FileText className="size-3 text-zinc-500" />
										<span className="max-w-[70px] truncate text-[11px] font-black">
											{file.name}
										</span>
										<button
											type="button"
											className="shrink-0 p-0.5 text-zinc-400 transition-all hover:bg-zinc-200/80 hover:text-destructive"
											onClick={() => handleRemove(index)}
											disabled={disabled}
										>
											<X className="size-2.5" />
										</button>
									</div>
								))}
							</div>
						)}
						{canAddMore && (
							<DropdownMenu open={showProjectPicker} onOpenChange={handleOpenChange}>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50/80 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-900/80 transition-all font-semibold"
										disabled={disabled}
									>
										<Upload className="size-3.5" />
										{value.length === 0 && (
											<span>
												{label ||
													t(
														"detail.selfMedia.initPanel.referenceFilePicker.uploadLabel",
														"上传参考资料",
													)}
											</span>
										)}
									</button>
								</DropdownMenuTrigger>
								{dropdownContent}
							</DropdownMenu>
						)}
					</div>
				</>
			) : (
				<>
					{/* File chips */}
					{value.length > 0 && (
						<div className="mb-2 flex flex-wrap gap-1.5">
							{value.map((file, index) => (
								<div
									key={`${file.name}-${index}`}
									className="group flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 transition-colors hover:border-border hover:bg-muted/70"
								>
									<FileText className="size-3 shrink-0 text-primary/70" />
									<span className="max-w-[140px] truncate text-xs text-foreground/90">
										{file.name}
									</span>
									<button
										type="button"
										className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
										onClick={() => handleRemove(index)}
										disabled={disabled}
									>
										<X className="size-3" />
									</button>
								</div>
							))}
						</div>
					)}

					{/* Drop zone & action buttons */}
					{canAddMore && (
						<>
							<input
								ref={fileInputRef}
								type="file"
								multiple={allowMultiSelect}
								className="hidden"
								onChange={handleLocalFileSelect}
							/>
							<div
								ref={dropZoneRef}
								className={cn(
									"relative flex items-center gap-2 border border-dashed px-3 py-2.5 transition-all",
									isDragging
										? "border-primary bg-primary/5"
										: "border-border/60 hover:border-border",
								)}
								{...dropZoneProps}
							>
								<div className="flex flex-1 items-center gap-3">
									<button
										type="button"
										className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
										onClick={() => fileInputRef.current?.click()}
										disabled={isDisabled}
									>
										<Upload className="size-3.5" />
										{t(
											"detail.selfMedia.initPanel.referenceFilePicker.localUpload",
										)}
									</button>
									<DropdownMenu
										open={showProjectPicker}
										onOpenChange={handleOpenChange}
									>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/80 hover:text-foreground"
												disabled={isDisabled}
											>
												<FolderOpen className="size-3.5" />
												{t(
													"detail.selfMedia.initPanel.referenceFilePicker.projectFile",
												)}
											</button>
										</DropdownMenuTrigger>
										{dropdownContent}
									</DropdownMenu>
								</div>
								{isDragging && (
									<span className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary/5 text-xs font-medium text-primary">
										<Plus className="mr-1 size-3.5" />
										{t(
											"detail.selfMedia.initPanel.referenceFilePicker.dropHere",
											"拖放文件到这里",
										)}
									</span>
								)}
							</div>
							<p className="mt-1 text-[11px] text-muted-foreground/50">
								{t("detail.selfMedia.initPanel.referenceFilePicker.hint")}
							</p>
						</>
					)}
				</>
			)}
		</div>
	)
}
