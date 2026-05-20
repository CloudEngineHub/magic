import { useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import type { MaterialItem } from "./types"

const ACCEPT_TYPES = "image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"

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
}

export default function MaterialAttachmentList({
	materials,
	onChange,
	compact = false,
	className,
	addLabel,
	descriptionPlaceholder,
	emptyHint,
}: MaterialAttachmentListProps) {
	const inputRef = useRef<HTMLInputElement>(null)

	const handleFiles = useCallback(
		(fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return

			const newItems: MaterialItem[] = Array.from(fileList).map((file) => ({
				id: generateId(),
				file,
				previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
				description: "",
			}))

			onChange([...materials, ...newItems])
		},
		[materials, onChange],
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

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			handleFiles(e.dataTransfer.files)
		},
		[handleFiles],
	)

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
	}, [])

	return (
		<div className={cn("space-y-2", className)}>
			{compact ? (
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
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
			) : (
				<div
					className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-5 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
					onClick={() => inputRef.current?.click()}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
				>
					<div className="flex flex-col items-center gap-1.5 text-center">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
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
							{addLabel || "点击或拖拽上传附件"}
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

			{materials.length > 0 && (
				<div className="flex flex-col gap-2">
					{materials.map((item) => (
						<div
							key={item.id}
							className={cn(
								"group flex gap-2 rounded-lg border border-border/50 bg-background transition-all hover:shadow-sm",
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
									className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
									onClick={() => handleRemove(item.id)}
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
								<input
									type="text"
									className="w-full rounded-md border border-input bg-background/80 px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
									placeholder={descriptionPlaceholder || "添加说明…"}
									value={item.description}
									onChange={(e) =>
										handleDescriptionChange(item.id, e.target.value)
									}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
