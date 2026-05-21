import { useState, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Progress } from "@/components/shadcn-ui/progress"
import { cn } from "@/lib/utils"
import { UploadCloud, FileText, Trash2, CheckCircle2, Loader2 } from "lucide-react"
import type { BrandImageItem } from "../../types"

interface BrandAssetUploadProps {
	brandImages: BrandImageItem[]
	brandImageUploadProgress: Record<string, number>
	hydratingImageIds: Set<string>
	isFetching: boolean
	onFilesSelect: (files: FileList) => void
	onRemoveBrandImage: (id: string) => void
	onBrandImageDescChange: (id: string, description: string) => void
}

export function BrandAssetUpload({
	brandImages,
	brandImageUploadProgress,
	hydratingImageIds,
	isFetching,
	onFilesSelect,
	onRemoveBrandImage,
	onBrandImageDescChange,
}: BrandAssetUploadProps) {
	const { t } = useTranslation("super")
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isDragOver, setIsDragOver] = useState(false)

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			if (isFetching) return
			setIsDragOver(true)
		},
		[isFetching],
	)

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragOver(false)
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setIsDragOver(false)
			if (isFetching || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return
			onFilesSelect(e.dataTransfer.files)
		},
		[isFetching, onFilesSelect],
	)

	const triggerFileSelect = useCallback(() => {
		if (isFetching) return
		fileInputRef.current?.click()
	}, [isFetching])

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files && e.target.files.length > 0) {
				onFilesSelect(e.target.files)
				e.target.value = ""
			}
		},
		[onFilesSelect],
	)

	return (
		<div className="space-y-4">
			<label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				{t("detail.selfMedia.initPanel.stepBrand.brandImages", "品牌形象素材")}
				<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
				</span>
			</label>

			<p className="text-xs leading-relaxed text-muted-foreground">
				{t(
					"detail.selfMedia.initPanel.stepBrand.brandImagesHint",
					"上传品牌 IP 形象、Logo 或风格参考图，AI 生图时将融合这些元素",
				)}
			</p>

			{/* Hidden Input */}
			<input
				ref={fileInputRef}
				type="file"
				className="hidden"
				multiple
				accept="image/*,.pdf,.ai,.svg,.psd"
				onChange={handleInputChange}
				disabled={isFetching}
			/>

			{/* Drag & Drop Zone */}
			<div
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={triggerFileSelect}
				className={cn(
					"group relative flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer",
					isDragOver
						? "border-primary bg-primary/[0.04] shadow-md shadow-primary/5"
						: "border-border bg-muted/10 hover:border-primary/40 hover:bg-primary/[0.01]",
					isFetching && "opacity-50 cursor-not-allowed pointer-events-none",
				)}
			>
				<div
					className={cn(
						"flex h-10 w-10 items-center justify-center rounded-full bg-background border border-border transition-all group-hover:scale-105 shadow-sm group-hover:shadow",
						isDragOver && "border-primary scale-110 shadow-primary/10",
					)}
				>
					<UploadCloud
						size={18}
						className={cn(
							"text-muted-foreground transition-colors group-hover:text-primary",
							isDragOver && "text-primary",
						)}
					/>
				</div>
				<div className="space-y-1">
					<p className="text-xs font-semibold text-foreground">
						{t(
							"detail.selfMedia.initPanel.stepBrand.brandImagesUpload",
							"点击上传图片或文件",
						)}
					</p>
				</div>
			</div>

			{/* Previews Grid */}
			{brandImages.length > 0 && (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{brandImages.map((item) => {
						const uploadProgress = brandImageUploadProgress[item.id]
						const isUploading = uploadProgress !== undefined
						const isHydratingPreview = hydratingImageIds.has(item.id)

						return (
							<div
								key={item.id}
								className="group/item relative overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-all hover:shadow-md"
							>
								{item.isImage ? (
									<div className="relative h-20 w-full overflow-hidden bg-muted/20">
										{item.previewUrl ? (
											<img
												src={item.previewUrl}
												alt={item.description || item.file.name}
												className="h-full w-full object-cover transition-transform duration-300 group-hover/item:scale-105"
											/>
										) : isHydratingPreview ? (
											<div className="flex h-full w-full items-center justify-center bg-muted/40">
												<Loader2
													size={16}
													className="animate-spin text-primary/70"
												/>
											</div>
										) : (
											<div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground/50">
												<FileText size={18} />
											</div>
										)}

										{/* Upload overlay */}
										{isUploading && (
											<div className="absolute inset-0 flex flex-col justify-end bg-black/40 p-2">
												<Progress
													value={uploadProgress}
													className="h-1 bg-white/20 [&_[data-slot=progress-indicator]]:bg-white"
												/>
											</div>
										)}

										{/* Success Badge */}
										{item.uploadedPath && !isUploading && (
											<div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm animate-in fade-in zoom-in">
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
											<div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
												<CheckCircle2 size={10} strokeWidth={3} />
											</div>
										)}
									</div>
								)}

								{/* Info & Input */}
								<div className="p-1.5 border-t border-border/40 bg-muted/5">
									<input
										type="text"
										className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none"
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

								{/* Delete Button */}
								<button
									type="button"
									className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground/70 opacity-0 shadow-sm backdrop-blur-sm transition-all group-hover/item:opacity-100 hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none"
									onClick={() => onRemoveBrandImage(item.id)}
									disabled={isUploading}
								>
									<Trash2 size={10} />
								</button>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
