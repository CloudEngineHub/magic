import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { Progress } from "@/components/shadcn-ui/progress"
import { cn } from "@/lib/utils"
import type { SelfMediaBrandRecordService } from "@/services/selfMedia"
import type { StoredBrandRecord } from "@/services/selfMedia"
import type { BrandImageItem } from "./types"
import type { AttachmentNode } from "../../services"
import type { SelfMediaFileStorageService } from "../../services/SelfMediaFileStorageService"
import { fetchAccountInfoViaTopic } from "../../services/selfMediaAccountFetch"
import { useBrandImagePreviewHydration } from "./hooks/useBrandImagePreviewHydration"

const PLATFORM_OPTIONS = [
	{ key: "xiaohongshu", label: "从小红书获取账号信息" },
	{ key: "douyin", label: "从抖音获取账号信息" },
	{ key: "weixin-mp", label: "从微信公众号获取账号信息" },
	{ key: "bilibili", label: "从B站获取账号信息" },
	{ key: "instagram", label: "从 Instagram 获取账号信息" },
	{ key: "tiktok", label: "从 TikTok 获取账号信息" },
] as const

interface BrandRecord {
	id: string
	author: string
	brandPosition: string
	targetAudience: string
	createdAt: number
}

export interface StepBrandInfoRef {
	/** 检查是否需要弹出保存确认框，如果需要则弹出并返回 false，否则返回 true */
	checkBeforeNext: () => boolean
	/** 品牌素材是否仍在上传或尚未写入项目文件 */
	isBrandAssetsReady: () => boolean
}

interface StepBrandInfoProps {
	author: string
	brandPosition: string
	targetAudience: string
	brandImages: BrandImageItem[]
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	onBrandImagesChange: (images: BrandImageItem[]) => void
	fileStorageService?: SelfMediaFileStorageService | null
	brandService?: SelfMediaBrandRecordService | null
	attachmentList?: AttachmentNode[]
	projectId?: string
	folderPath?: string
	isPlatformFetching?: boolean
	onPlatformFetchStart?: () => void
	onPlatformFetchEnd?: () => void
	onConfirmNext?: () => void
	onBrandImagesUploadingChange?: (uploading: boolean) => void
}

const StepBrandInfo = forwardRef<StepBrandInfoRef, StepBrandInfoProps>(function StepBrandInfo(
	{
		author,
		brandPosition,
		targetAudience,
		brandImages,
		onChange,
		onBrandImagesChange,
		fileStorageService,
		brandService,
		attachmentList,
		projectId,
		folderPath,
		isPlatformFetching = false,
		onPlatformFetchStart,
		onPlatformFetchEnd,
		onConfirmNext,
		onBrandImagesUploadingChange,
	},
	ref,
) {
	const { t } = useTranslation("super")
	const [records, setRecords] = useState<BrandRecord[]>([])
	const [showRecordPicker, setShowRecordPicker] = useState(false)
	const [showPlatformFetch, setShowPlatformFetch] = useState(false)
	const [showSaveConfirm, setShowSaveConfirm] = useState(false)
	const hasAutoFilled = useRef(false)
	const initialized = useRef(false)
	const platformDropdownRef = useRef<HTMLDivElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [brandImageUploadProgress, setBrandImageUploadProgress] = useState<
		Record<string, number>
	>({})

	const { hydratingImageIds } = useBrandImagePreviewHydration({
		attachmentList,
		brandImages,
		onBrandImagesChange,
	})

	const isBrandAssetsReady = useCallback(() => {
		if (Object.keys(brandImageUploadProgress).length > 0) return false
		return !brandImages.some((img) => img.file.size > 0 && !img.uploadedPath)
	}, [brandImages, brandImageUploadProgress])

	// 暴露 ref 方法给父组件
	useImperativeHandle(
		ref,
		() => ({
			checkBeforeNext: () => {
				if (!isBrandAssetsReady()) return false
				if (records.length === 0 && author.trim() && brandPosition.trim()) {
					setShowSaveConfirm(true)
					return false
				}
				return true
			},
			isBrandAssetsReady,
		}),
		[records.length, author, brandPosition, isBrandAssetsReady],
	)

	useEffect(() => {
		onBrandImagesUploadingChange?.(Object.keys(brandImageUploadProgress).length > 0)
	}, [brandImageUploadProgress, onBrandImagesUploadingChange])

	// 点击外部关闭平台下拉框
	useEffect(() => {
		if (!showPlatformFetch) return
		const handleClickOutside = (e: MouseEvent) => {
			if (
				platformDropdownRef.current &&
				!platformDropdownRef.current.contains(e.target as Node)
			) {
				setShowPlatformFetch(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [showPlatformFetch])

	const handleFetchFromPlatform = useCallback(
		async (platform: string, platformLabel: string) => {
			if (!projectId || !author.trim() || isPlatformFetching) return
			setShowPlatformFetch(false)
			onPlatformFetchStart?.()
			try {
				const result = await fetchAccountInfoViaTopic({
					platform,
					platformLabel,
					projectId,
					folderPath,
					accountName: author.trim(),
				})
				if (!result) {
					onPlatformFetchEnd?.()
				}
				// ip-manager writes draft.json; parent reloads on file change
			} catch (err) {
				console.error("Failed to fetch account info:", err)
				onPlatformFetchEnd?.()
			}
		},
		[
			projectId,
			author,
			isPlatformFetching,
			onPlatformFetchStart,
			onPlatformFetchEnd,
			folderPath,
		],
	)

	// 从 IDB 加载品牌记录
	useEffect(() => {
		if (initialized.current || !brandService) return
		initialized.current = true
		console.log("[StepBrandInfo] 开始从 IDB 加载品牌记录")
		;(async () => {
			const list = await brandService.listRecords()
			const mapped: BrandRecord[] = list.map((r: StoredBrandRecord) => ({
				id: r.id,
				author: r.author,
				brandPosition: r.brandPosition,
				targetAudience: r.targetAudience,
				createdAt: r.createdAt,
			}))
			console.log(
				"[StepBrandInfo] IDB 记录数量:",
				mapped.length,
				mapped.length > 0 ? { latestAuthor: mapped[0].author } : "",
			)
			setRecords(mapped)

			// 自动回填最新记录
			if (!hasAutoFilled.current && !author && !brandPosition && mapped.length > 0) {
				hasAutoFilled.current = true
				const latest = mapped[0]
				console.log("[StepBrandInfo] 自动回填 IDB 记录:", {
					author: latest.author,
					brandPosition: latest.brandPosition,
				})
				onChange("author", latest.author)
				onChange("brandPosition", latest.brandPosition)
				onChange("targetAudience", latest.targetAudience)
			} else {
				console.log("[StepBrandInfo] 跳过自动回填:", {
					hasAutoFilled: hasAutoFilled.current,
					author,
					brandPosition,
					recordsCount: mapped.length,
				})
			}
		})()
	}, [brandService]) // eslint-disable-line react-hooks/exhaustive-deps

	// 保存确认后的处理
	const handleConfirmSave = useCallback(() => {
		if (author.trim() && brandPosition.trim() && brandService) {
			;(async () => {
				const saved = await brandService.saveRecord({
					author: author.trim(),
					brandPosition: brandPosition.trim(),
					targetAudience: targetAudience.trim(),
				})
				setRecords((prev) => [
					{
						id: saved.id,
						author: saved.author,
						brandPosition: saved.brandPosition,
						targetAudience: saved.targetAudience,
						createdAt: saved.createdAt,
					},
					...prev,
				])
			})()
		}
		setShowSaveConfirm(false)
		onConfirmNext?.()
	}, [author, brandPosition, targetAudience, brandService, onConfirmNext])

	const handleSkipSave = useCallback(() => {
		setShowSaveConfirm(false)
		onConfirmNext?.()
	}, [onConfirmNext])

	const handleSaveRecord = useCallback(() => {
		if (!author.trim() || !brandPosition.trim() || !brandService) return
		;(async () => {
			const saved = await brandService.saveRecord({
				author: author.trim(),
				brandPosition: brandPosition.trim(),
				targetAudience: targetAudience.trim(),
			})
			const newRecord: BrandRecord = {
				id: saved.id,
				author: saved.author,
				brandPosition: saved.brandPosition,
				targetAudience: saved.targetAudience,
				createdAt: saved.createdAt,
			}
			setRecords((prev) => [newRecord, ...prev])
		})()
	}, [author, brandPosition, targetAudience, brandService])

	const handleSelectRecord = useCallback(
		(record: BrandRecord) => {
			onChange("author", record.author)
			onChange("brandPosition", record.brandPosition)
			onChange("targetAudience", record.targetAudience)
			setShowRecordPicker(false)
		},
		[onChange],
	)

	const handleDeleteRecord = useCallback(
		(id: string) => {
			setRecords((prev) => prev.filter((r) => r.id !== id))
			brandService?.deleteRecord(id)
		},
		[brandService],
	)

	const handleFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files
			if (!files || files.length === 0) return

			const newItems: BrandImageItem[] = Array.from(files).map((file) => {
				const isImage = file.type.startsWith("image/")
				return {
					id: crypto.randomUUID(),
					file,
					previewUrl: isImage ? URL.createObjectURL(file) : "",
					description: "",
					isImage,
				}
			})

			let currentItems = [...brandImages, ...newItems]
			onBrandImagesChange(currentItems)
			e.target.value = ""

			if (!fileStorageService) return

			for (const item of newItems) {
				setBrandImageUploadProgress((prev) => ({ ...prev, [item.id]: 0 }))

				const uploadedPath = await fileStorageService.uploadBrandImageToDraft(
					item.file,
					(percent) => {
						setBrandImageUploadProgress((prev) => ({ ...prev, [item.id]: percent }))
					},
				)

				setBrandImageUploadProgress((prev) => {
					const next = { ...prev }
					delete next[item.id]
					return next
				})

				if (uploadedPath) {
					currentItems = currentItems.map((img) =>
						img.id === item.id ? { ...img, uploadedPath } : img,
					)
					onBrandImagesChange(currentItems)
				} else {
					message.error(
						t("detail.selfMedia.initPanel.stepBrand.brandImagesUploadFailed", {
							name: item.file.name,
						}),
					)
				}
			}
		},
		[brandImages, onBrandImagesChange, fileStorageService, t],
	)

	const handleRemoveBrandImage = useCallback(
		(id: string) => {
			const item = brandImages.find((img) => img.id === id)
			if (item?.previewUrl) {
				URL.revokeObjectURL(item.previewUrl)
			}
			onBrandImagesChange(brandImages.filter((img) => img.id !== id))
		},
		[brandImages, onBrandImagesChange],
	)

	const handleBrandImageDescChange = useCallback(
		(id: string, description: string) => {
			onBrandImagesChange(
				brandImages.map((img) => (img.id === id ? { ...img, description } : img)),
			)
		},
		[brandImages, onBrandImagesChange],
	)

	const isFetching = isPlatformFetching
	const canFetchFromPlatform = Boolean(author.trim()) && Boolean(projectId)

	// Close platform menu when account name is cleared
	useEffect(() => {
		if (!author.trim()) {
			setShowPlatformFetch(false)
		}
	}, [author])

	return (
		<div className={cn("mx-auto max-w-lg", isFetching && "pointer-events-none")}>
			{/* Loading overlay */}
			{isFetching && (
				<div className="mb-5 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
					<svg
						className="animate-spin text-primary"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</svg>
					<span className="text-xs font-medium text-primary">
						{t("detail.selfMedia.initPanel.stepBrand.platformFetchLoading")}
					</span>
				</div>
			)}

			<div className="mb-8 text-center">
				<h2 className="mb-2 text-xl font-bold tracking-tight">
					{t("detail.selfMedia.initPanel.stepBrand.title")}
				</h2>
				<p className="text-sm text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepBrand.subtitle")}
				</p>
			</div>

			{/* Records management bar */}
			<div className="mb-5 flex items-center justify-between">
				<div className="flex items-center gap-2">
					{records.length >= 2 && (
						<button
							type="button"
							className={cn(
								"flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
								showRecordPicker
									? "border-primary/40 bg-primary/5 text-primary"
									: "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
							)}
							onClick={() => setShowRecordPicker(!showRecordPicker)}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M12 8v4l3 3" />
								<circle cx="12" cy="12" r="10" />
							</svg>
							{t("detail.selfMedia.initPanel.stepBrand.historyRecords")}
							<span className="rounded bg-muted px-1 py-0.5 text-[10px]">
								{records.length}
							</span>
						</button>
					)}
				</div>
				{records.length >= 1 && author.trim() && brandPosition.trim() && (
					<button
						type="button"
						className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground active:scale-[0.97]"
						onClick={handleSaveRecord}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
							<polyline points="17 21 17 13 7 13 7 21" />
							<polyline points="7 3 7 8 15 8" />
						</svg>
						{t("detail.selfMedia.initPanel.stepBrand.saveAsNew")}
					</button>
				)}
			</div>

			{/* Record picker dropdown */}
			{showRecordPicker && (
				<div className="mb-5 rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden">
					<div className="border-b border-border/50 px-4 py-2.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepBrand.selectRecordHint")}
						</span>
					</div>
					<div className="max-h-48 overflow-y-auto">
						{records.map((record) => (
							<div
								key={record.id}
								className="group flex items-center justify-between gap-3 border-b border-border/30 px-4 py-3 last:border-b-0 hover:bg-muted/30 transition-colors"
							>
								<button
									type="button"
									className="flex flex-1 flex-col items-start gap-0.5 text-left"
									onClick={() => handleSelectRecord(record)}
								>
									<span className="text-sm font-medium text-foreground">
										{record.author}
									</span>
									<span className="text-xs text-muted-foreground line-clamp-1">
										{record.brandPosition}
									</span>
								</button>
								<div className="flex items-center gap-1.5 shrink-0">
									<span className="text-[10px] text-muted-foreground/60">
										{new Date(record.createdAt).toLocaleDateString()}
									</span>
									<button
										type="button"
										className="rounded p-1 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
										onClick={(e) => {
											e.stopPropagation()
											handleDeleteRecord(record.id)
										}}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path d="M18 6 6 18M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-6">
				<div className="group">
					<label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
						<span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs text-primary">
							1
						</span>
						{t("detail.selfMedia.initPanel.stepBrand.accountName")}
						<span className="text-destructive">*</span>
					</label>
					<div className="flex items-center gap-2">
						<input
							type="text"
							className={cn(
								"flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:shadow-md",
								isFetching && "opacity-50",
							)}
							placeholder={t(
								"detail.selfMedia.initPanel.stepBrand.accountPlaceholder",
							)}
							value={author}
							onChange={(e) => onChange("author", e.target.value)}
							disabled={isFetching}
						/>
						{/* Platform fetch dropdown */}
						<div className="relative" ref={platformDropdownRef}>
							<button
								type="button"
								className={cn(
									"flex items-center gap-1 rounded-xl border px-3 py-3 text-xs font-medium whitespace-nowrap transition-all",
									isPlatformFetching
										? "border-primary/40 bg-primary/5 text-primary cursor-wait"
										: !canFetchFromPlatform
											? "cursor-not-allowed border-border bg-muted/30 text-muted-foreground/50"
											: "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
								)}
								onClick={() => {
									if (!canFetchFromPlatform || isPlatformFetching) return
									setShowPlatformFetch(!showPlatformFetch)
								}}
								disabled={isPlatformFetching || !canFetchFromPlatform}
							>
								{isPlatformFetching ? (
									<>
										<svg
											className="animate-spin"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path d="M21 12a9 9 0 1 1-6.219-8.56" />
										</svg>
										{t("detail.selfMedia.initPanel.stepBrand.platformFetching")}
									</>
								) : (
									<>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
											<polyline points="7 10 12 15 17 10" />
											<line x1="12" y1="15" x2="12" y2="3" />
										</svg>
										从平台获取
									</>
								)}
							</button>
							{showPlatformFetch && canFetchFromPlatform && (
								<div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden">
									<div className="border-b border-border/50 px-4 py-2.5">
										<span className="text-xs font-medium text-muted-foreground">
											选择平台以自动获取账号信息
										</span>
									</div>
									<div className="py-1">
										{PLATFORM_OPTIONS.map((opt) => (
											<button
												key={opt.key}
												type="button"
												className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
												onClick={() =>
													handleFetchFromPlatform(opt.key, opt.label)
												}
											>
												<svg
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round"
													className="text-muted-foreground"
												>
													<circle cx="12" cy="12" r="10" />
													<line x1="2" y1="12" x2="22" y2="12" />
													<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
												</svg>
												{opt.label}
											</button>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				<div className="group">
					<label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
						<span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs text-primary">
							2
						</span>
						{t("detail.selfMedia.initPanel.stepBrand.brandPosition")}
						<span className="text-destructive">*</span>
					</label>
					<input
						type="text"
						className={cn(
							"w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:shadow-md",
							isFetching && "opacity-50",
						)}
						placeholder={t(
							"detail.selfMedia.initPanel.stepBrand.brandPositionPlaceholder",
						)}
						value={brandPosition}
						onChange={(e) => onChange("brandPosition", e.target.value)}
						disabled={isFetching}
					/>
					<p className="mt-1.5 text-xs text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepBrand.brandPositionHint")}
					</p>
				</div>

				<div className="group">
					<label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
						<span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
							3
						</span>
						{t("detail.selfMedia.initPanel.stepBrand.targetAudience")}
						<span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepBrand.optional")}
						</span>
					</label>
					<input
						type="text"
						className={cn(
							"w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:shadow-md",
							isFetching && "opacity-50",
						)}
						placeholder={t(
							"detail.selfMedia.initPanel.stepBrand.targetAudiencePlaceholder",
						)}
						value={targetAudience}
						onChange={(e) => onChange("targetAudience", e.target.value)}
						disabled={isFetching}
					/>
					<p className="mt-1.5 text-xs text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepBrand.targetAudienceHint")}
					</p>
				</div>

				{/* Brand Image / IP Assets */}
				<div className="group">
					<label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
						<span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
							4
						</span>
						{t("detail.selfMedia.initPanel.stepBrand.brandImages")}
						<span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepBrand.optional")}
						</span>
					</label>
					<p className="mb-3 text-xs text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepBrand.brandImagesHint")}
					</p>
					<p className="mb-3 text-xs text-muted-foreground/80">
						{t("detail.selfMedia.initPanel.stepBrand.brandImagesUploadHint")}
					</p>

					{/* Upload area */}
					<input
						ref={fileInputRef}
						type="file"
						className="hidden"
						multiple
						accept="image/*,.pdf,.ai,.svg,.psd"
						onChange={handleFileSelect}
					/>
					<button
						type="button"
						className={cn(
							"mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground active:scale-[0.99]",
							isFetching && "opacity-50 cursor-not-allowed",
						)}
						onClick={() => fileInputRef.current?.click()}
						disabled={isFetching}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						{t("detail.selfMedia.initPanel.stepBrand.brandImagesUpload")}
					</button>

					{/* Preview list */}
					{brandImages.length > 0 && (
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{brandImages.map((item) => {
								const uploadProgress = brandImageUploadProgress[item.id]
								const isUploading = uploadProgress !== undefined
								const isHydratingPreview = hydratingImageIds.has(item.id)

								return (
									<div
										key={item.id}
										className="group/item relative overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm"
									>
										{item.isImage ? (
											<div className="relative h-16 w-full overflow-hidden bg-muted/30">
												{item.previewUrl ? (
													<img
														src={item.previewUrl}
														alt={item.description || item.file.name}
														className="h-full w-full object-cover"
													/>
												) : isHydratingPreview ? (
													<div className="flex h-full w-full animate-pulse items-center justify-center bg-muted/40">
														<div className="flex flex-col items-center gap-1 text-muted-foreground/70">
															<svg
																className="animate-spin"
																width="16"
																height="16"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2"
															>
																<path d="M21 12a9 9 0 1 1-6.219-8.56" />
															</svg>
															<div className="h-1 w-8 rounded-full bg-muted-foreground/20" />
														</div>
													</div>
												) : (
													<div className="flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground/70">
														<svg
															width="18"
															height="18"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="1.5"
															strokeLinecap="round"
															strokeLinejoin="round"
														>
															<rect
																x="3"
																y="3"
																width="18"
																height="18"
																rx="2"
															/>
															<circle cx="8.5" cy="8.5" r="1.5" />
															<path d="m21 15-5-5L5 21" />
														</svg>
													</div>
												)}
												{isUploading ? (
													<div className="absolute inset-0 flex flex-col justify-end bg-black/35 p-1">
														<Progress
															value={uploadProgress}
															className="h-1 bg-white/25 [&_[data-slot=progress-indicator]]:bg-white"
														/>
													</div>
												) : null}
												{item.uploadedPath ? (
													<div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
														<svg
															width="10"
															height="10"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="3"
														>
															<path d="M20 6 9 17l-5-5" />
														</svg>
													</div>
												) : null}
											</div>
										) : (
											<div className="relative flex h-16 w-full flex-col items-center justify-center bg-muted/30 px-1">
												<svg
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.5"
													className="mb-0.5 text-muted-foreground"
												>
													<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
													<polyline points="14 2 14 8 20 8" />
												</svg>
												<span className="line-clamp-1 w-full text-center text-[9px] text-muted-foreground">
													{item.file.name}
												</span>
												{isUploading ? (
													<div className="absolute inset-x-1 bottom-1">
														<Progress
															value={uploadProgress}
															className="h-1"
														/>
													</div>
												) : null}
											</div>
										)}

										<div className="p-1">
											<input
												type="text"
												className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-[10px] placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
												placeholder={t(
													"detail.selfMedia.initPanel.stepBrand.brandImagesDescPlaceholder",
												)}
												value={item.description}
												onChange={(e) =>
													handleBrandImageDescChange(
														item.id,
														e.target.value,
													)
												}
											/>
										</div>

										<button
											type="button"
											className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground/70 opacity-0 shadow-sm backdrop-blur-sm transition-all group-hover/item:opacity-100 hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none"
											onClick={() => handleRemoveBrandImage(item.id)}
											disabled={isUploading}
										>
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
											>
												<path d="M18 6 6 18M6 6l12 12" />
											</svg>
										</button>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>

			{/* Quick fill hint */}
			{!author && !brandPosition && records.length === 0 && (
				<div className="mt-8 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
					<p className="text-xs text-muted-foreground">
						💡 {t("detail.selfMedia.initPanel.stepBrand.quickFillHint")}
					</p>
				</div>
			)}

			{/* Save confirmation dialog */}
			{showSaveConfirm && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
					<div className="mx-4 w-full max-w-sm rounded-2xl border border-border/60 bg-background p-6 shadow-xl">
						<div className="mb-4 flex items-center gap-2">
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-primary"
							>
								<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
								<polyline points="17 21 17 13 7 13 7 21" />
								<polyline points="7 3 7 8 15 8" />
							</svg>
							<h3 className="text-sm font-semibold text-foreground">
								{t("detail.selfMedia.initPanel.stepBrand.saveConfirmTitle")}
							</h3>
						</div>
						<p className="mb-5 text-xs text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepBrand.saveConfirmDesc")}
						</p>
						<div className="flex items-center justify-end gap-3">
							<button
								type="button"
								className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
								onClick={handleSkipSave}
							>
								{t("detail.selfMedia.initPanel.stepBrand.saveConfirmSkip")}
							</button>
							<button
								type="button"
								className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
								onClick={handleConfirmSave}
							>
								{t("detail.selfMedia.initPanel.stepBrand.saveConfirmSave")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
})

export default StepBrandInfo
