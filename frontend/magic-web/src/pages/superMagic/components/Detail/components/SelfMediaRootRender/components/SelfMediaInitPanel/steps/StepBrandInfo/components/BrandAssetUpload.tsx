import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Progress } from "@/components/shadcn-ui/progress"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
} from "@/components/shadcn-ui/dropdown-menu"
import { cn } from "@/lib/utils"
import projectFilesStore from "@/stores/projectFiles"
import { UploadCloud, FileText, Trash2, CheckCircle2, Loader2, FolderOpen } from "lucide-react"
import ProjectFilePickerContent from "../../../components/picker/ProjectFilePickerContent"
import { useDropZone } from "../../../lib/useDropZone"
import {
	filesToFileList,
	loadProjectFilesAsFiles,
	type DropPayload,
	type SelfMediaProjectFileRef,
} from "../../../lib/projectFileDrag"
import type { BrandImageItem } from "../../../types"

const ACCEPT_TYPES = "image/*,.pdf,.ai,.svg,.psd"

interface BrandAssetUploadProps {
	brandImages: BrandImageItem[]
	brandImageUploadProgress: Record<string, number>
	hydratingImageIds: Set<string>
	isFetching: boolean
	onFilesSelect: (files: FileList, uploadedPaths?: (string | undefined)[]) => void
	onRemoveBrandImage: (id: string) => void
	onBrandImageDescChange: (id: string, description: string) => void
	enableProjectPicker?: boolean
	layout?: "default" | "stacked"
}

export function BrandAssetUpload({
	brandImages,
	brandImageUploadProgress,
	hydratingImageIds,
	isFetching,
	onFilesSelect,
	onRemoveBrandImage,
	onBrandImageDescChange,
	enableProjectPicker = true,
	layout = "default",
}: BrandAssetUploadProps) {
	const { t } = useTranslation("super")
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [showProjectPicker, setShowProjectPicker] = useState(false)
	const [loadingProjectFile, setLoadingProjectFile] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [pendingProjectFiles, setPendingProjectFiles] = useState<
		Map<string, SelfMediaProjectFileRef>
	>(() => new Map())

	const disabled = isFetching || loadingProjectFile
	const isStacked = layout === "stacked"

	const selectedPaths = useMemo(
		() => new Set(brandImages.map((item) => item.uploadedPath).filter((p): p is string => !!p)),
		[brandImages],
	)

	const handleLocalFiles = useCallback(
		(fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return
			onFilesSelect(fileList)
		},
		[onFilesSelect],
	)

	const addProjectFileRefs = useCallback(
		async (refs: SelfMediaProjectFileRef[]) => {
			const pending = refs.filter((ref) => !ref.filePath || !selectedPaths.has(ref.filePath))
			if (pending.length === 0) return

			setLoadingProjectFile(true)
			try {
				const files = await loadProjectFilesAsFiles(pending)
				const uploadedPaths = pending.map((ref) => ref.filePath)
				onFilesSelect(filesToFileList(files), uploadedPaths)
				setShowProjectPicker(false)
				setSearchQuery("")
				setPendingProjectFiles(new Map())
			} catch (err) {
				console.error("Failed to load project files:", err)
			} finally {
				setLoadingProjectFile(false)
			}
		},
		[onFilesSelect, selectedPaths],
	)

	const handleDropPayload = useCallback(
		(payload: DropPayload) => {
			if (payload.kind === "local") {
				onFilesSelect(filesToFileList(payload.files))
				return
			}
			void addProjectFileRefs(payload.files)
		},
		[addProjectFileRefs, onFilesSelect],
	)

	const { isDragging, dropZoneProps } = useDropZone({
		disabled,
		onDropPayload: handleDropPayload,
	})

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			if (disabled) return

			const clipboardData = e.clipboardData
			if (!clipboardData) return

			if (clipboardData.files && clipboardData.files.length > 0) {
				e.preventDefault()
				handleLocalFiles(clipboardData.files)
				return
			}

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
				handleLocalFiles(filesToFileList(files))
			}
		},
		[disabled, handleLocalFiles],
	)

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
				handleLocalFiles(filesToFileList(files))
				setShowProjectPicker(false)
				setSearchQuery("")
			}
		}

		document.addEventListener("paste", handler)
		return () => document.removeEventListener("paste", handler)
	}, [showProjectPicker, handleLocalFiles])

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

			await addProjectFileRefs([{ fileId, fileName, filePath: relativePath }])
		},
		[addProjectFileRefs, selectedPaths],
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

	const triggerFileSelect = useCallback(() => {
		if (disabled) return
		fileInputRef.current?.click()
	}, [disabled])

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files && e.target.files.length > 0) {
				handleLocalFiles(e.target.files)
				e.target.value = ""
			}
		},
		[handleLocalFiles],
	)

	const handleLocalUploadFromPicker = useCallback(() => {
		triggerFileSelect()
		setShowProjectPicker(false)
		setSearchQuery("")
	}, [triggerFileSelect])

	const projectPickerDropdown = enableProjectPicker ? (
		<DropdownMenuContent
			align="end"
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
				onLocalUpload={handleLocalUploadFromPicker}
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

	return (
		<div
			className={cn(
				"relative space-y-3 transition-colors",
				isDragging && "bg-[#434c81]/[0.035] ring-1 ring-[#434c81]/30",
			)}
			onPaste={handlePaste}
			tabIndex={-1}
			{...dropZoneProps}
		>
			{isDragging ? (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border border-dashed border-[#434c81]/40 bg-[#434c81]/[0.06] text-[11px] font-semibold text-[#38426f]">
					{t("detail.selfMedia.initPanel.referenceFilePicker.dropHere", "拖放文件到这里")}
				</div>
			) : null}

			<input
				ref={fileInputRef}
				type="file"
				className="hidden"
				multiple
				accept={ACCEPT_TYPES}
				onChange={handleInputChange}
				disabled={disabled}
			/>

			<div className={cn("flex gap-2", isStacked && "flex-col")}>
				<div
					role="button"
					tabIndex={0}
					onClick={triggerFileSelect}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault()
							triggerFileSelect()
						}
					}}
					className={cn(
						"group relative flex flex-1 cursor-pointer items-center gap-3 overflow-hidden rounded-lg bg-[#434c81]/[0.095] px-4 py-3 text-left transition-transform duration-200 ease-out after:absolute after:inset-y-2 after:left-3 after:w-10 after:rounded-full after:bg-[#434c81]/[0.12] after:opacity-0 after:blur-xl after:transition-opacity after:duration-300 hover:-translate-y-0.5 hover:after:opacity-100",
						isStacked && "min-h-[92px] items-start",
						isDragging
							? "bg-[#434c81]/[0.12] ring-1 ring-[#434c81]/25"
							: "hover:bg-[#434c81]/[0.12]",
						disabled && "pointer-events-none cursor-not-allowed opacity-50",
					)}
					data-testid="self-media-brand-asset-upload-trigger"
				>
					<div
						className={cn(
							"relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/65 text-[#434c81] transition-all group-hover:-translate-y-0.5 group-hover:scale-105",
							isDragging && "scale-110 bg-[#434c81]/[0.15] text-[#38426f]",
						)}
					>
						{loadingProjectFile ? (
							<Loader2 size={18} className="animate-spin" />
						) : (
							<UploadCloud size={18} className="transition-colors" />
						)}
					</div>
					<div className="relative z-[1] space-y-0.5">
						<p className="text-xs font-medium text-foreground">
							{t(
								"detail.selfMedia.initPanel.stepBrand.brandImagesUpload",
								"点击上传图片或文件",
							)}
						</p>
						<p className="text-[10px] text-muted-foreground">
							{t(
								"detail.selfMedia.initPanel.stepBrand.brandImagesDropHint",
								"支持拖拽、粘贴或从项目选择",
							)}
						</p>
					</div>
				</div>

				{enableProjectPicker ? (
					<DropdownMenu open={showProjectPicker} onOpenChange={handleOpenChange}>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								disabled={disabled}
								variant="secondary"
								className={cn(
									"h-auto shrink-0 px-3 py-3 text-[11px]",
									isStacked && "w-full justify-start",
								)}
							>
								<FolderOpen size={14} />
								{t(
									"detail.selfMedia.initPanel.stepBrand.brandImagesFromProject",
									"项目文件",
								)}
							</Button>
						</DropdownMenuTrigger>
						{projectPickerDropdown}
					</DropdownMenu>
				) : null}
			</div>

			{brandImages.length > 0 && (
				<div
					className={cn(
						"grid grid-cols-2 gap-3 sm:grid-cols-3",
						isStacked && "grid-cols-1 sm:grid-cols-1",
					)}
				>
					{brandImages.map((item) => {
						const uploadProgress = brandImageUploadProgress[item.id]
						const isUploading = uploadProgress !== undefined
						const isHydratingPreview = hydratingImageIds.has(item.id)

						return (
							<div
								key={item.id}
								className="group/item relative overflow-hidden rounded-lg bg-background/60 transition-all hover:bg-background/80"
							>
								{item.isImage ? (
									<div className="relative h-20 w-full overflow-hidden bg-muted/20">
										{item.previewUrl ? (
											<img
												src={item.previewUrl}
												alt={item.description || item.file.name}
												className="h-full w-full object-contain transition-transform duration-300 group-hover/item:scale-105"
											/>
										) : isHydratingPreview ? (
											<div className="flex h-full w-full items-center justify-center bg-muted/40">
												<Loader2
													size={16}
													className="animate-spin text-[#434c81]/70"
												/>
											</div>
										) : (
											<div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground/50">
												<FileText size={18} />
											</div>
										)}

										{isUploading && (
											<div className="absolute inset-0 flex flex-col justify-end bg-black/40 p-2">
												<Progress
													value={uploadProgress}
													className="h-1 bg-white/20 [&_[data-slot=progress-indicator]]:bg-white"
												/>
											</div>
										)}

										{item.uploadedPath && !isUploading && (
											<div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#434c81] text-white animate-in fade-in zoom-in">
												<CheckCircle2 size={10} strokeWidth={3} />
											</div>
										)}
									</div>
								) : (
									<div className="relative flex h-20 w-full flex-col items-center justify-center bg-muted/20 px-2 text-center">
										<FileText
											size={20}
											className="mb-1 text-muted-foreground/80"
										/>
										<span className="line-clamp-1 w-full text-[9px] font-medium text-muted-foreground">
											{item.file.name}
										</span>
										{isUploading && (
											<div className="absolute inset-x-2 bottom-2">
												<Progress value={uploadProgress} className="h-1" />
											</div>
										)}
										{item.uploadedPath && !isUploading && (
											<div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#434c81] text-white">
												<CheckCircle2 size={10} strokeWidth={3} />
											</div>
										)}
									</div>
								)}

								<div className="border-t bg-muted/20 p-1.5">
									<Input
										type="text"
										className="h-7 text-[10px]"
										placeholder={t(
											"detail.selfMedia.initPanel.stepBrand.brandImagesDescPlaceholder",
											"描述（如：品牌Logo）",
										)}
										value={item.description}
										onChange={(e) =>
											onBrandImageDescChange(item.id, e.target.value)
										}
									/>
								</div>

								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="absolute right-1.5 top-1.5 size-6 bg-background/90 text-muted-foreground/70 opacity-0 hover:text-destructive disabled:pointer-events-none group-hover/item:opacity-100"
									onClick={() => onRemoveBrandImage(item.id)}
									disabled={isUploading}
								>
									<Trash2 size={10} />
								</Button>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
