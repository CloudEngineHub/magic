import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { cn } from "@/lib/utils"
import { Sparkles, Globe, Eye, History, ChevronRight, User, Compass, Target } from "lucide-react"

import InlineVoiceButton from "../InlineVoiceButton"

import type { SelfMediaBrandRecordService } from "@/services/selfMedia"
import type { StoredBrandRecord } from "@/services/selfMedia"
import type { AttachmentNode } from "../../../services"
import type { SelfMediaFileStorageService } from "../../../services/SelfMediaFileStorageService"
import { fetchAccountInfoViaTopic } from "../../../services/selfMediaAccountFetch"
import { useBrandImagePreviewHydration } from "../hooks/useBrandImagePreviewHydration"

import { WelcomeHero } from "./components/WelcomeHero"
import { BrandAssetUpload } from "./components/BrandAssetUpload"
import { HistoryRecordPicker } from "./components/HistoryRecordPicker"
import { SaveConfirmDialog } from "./components/SaveConfirmDialog"
import { BrandImageItem } from "../types"

const PLATFORM_OPTIONS = [
	{ key: "xiaohongshu", label: "从小红书获取账号信息" },
	{ key: "douyin", label: "从抖音获取账号信息" },
	{ key: "weixin-mp", label: "从微信公众号获取账号信息" },
	{ key: "bilibili", label: "从B站获取账号信息" },
	{ key: "instagram", label: "从 Instagram 获取账号信息" },
	{ key: "tiktok", label: "从 TikTok 获取账号信息" },
] as const

const QUICK_TAGS = ["AI分享", "科技数码", "职场成长", "好物测评", "萌宠日常", "美食探店"]

interface BrandRecord {
	id: string
	author: string
	brandPosition: string
	targetAudience: string
	createdAt: number
}

export interface StepBrandInfoRef {
	checkBeforeNext: () => boolean
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

	// Expose methods to parent via Ref
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

	// Close platform fetch dropdown on outside click
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

	// Close platform menu if author is cleared
	useEffect(() => {
		if (!author.trim()) {
			setShowPlatformFetch(false)
		}
	}, [author])

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

	// Load historical records from IDB
	useEffect(() => {
		if (initialized.current || !brandService) return
		initialized.current = true
		;(async () => {
			const list = await brandService.listRecords()
			const mapped: BrandRecord[] = list.map((r: StoredBrandRecord) => ({
				id: r.id,
				author: r.author,
				brandPosition: r.brandPosition,
				targetAudience: r.targetAudience,
				createdAt: r.createdAt,
			}))
			setRecords(mapped)

			// Autofill with the latest record
			if (!hasAutoFilled.current && !author && !brandPosition && mapped.length > 0) {
				hasAutoFilled.current = true
				const latest = mapped[0]
				onChange("author", latest.author)
				onChange("brandPosition", latest.brandPosition)
				onChange("targetAudience", latest.targetAudience)
			}
		})()
	}, [brandService, author, brandPosition, onChange])

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
			message.success(t("detail.selfMedia.initPanel.stepBrand.saveSuccess", "保存成功"))
		})()
	}, [author, brandPosition, targetAudience, brandService, t])

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

	const handleFilesSelect = useCallback(
		async (files: FileList) => {
			if (files.length === 0) return

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

	return (
		<div className={cn("mx-auto max-w-5xl py-4", isFetching && "pointer-events-none")}>
			{/* Platform fetching loading notification */}
			{isFetching && (
				<div className="mb-6 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 animate-pulse">
					<svg
						className="animate-spin text-primary"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</svg>
					<span className="text-xs font-semibold text-primary">
						{t("detail.selfMedia.initPanel.stepBrand.platformFetchLoading")}
					</span>
				</div>
			)}

			<div className="grid grid-cols-1 gap-12 lg:grid-cols-12 items-stretch">
				{/* Left Welcome Brand Hero */}
				<div className="lg:col-span-5 flex flex-col justify-between">
					<WelcomeHero />
				</div>

				{/* Right Elegant Input Console (Card-free borderless design) */}
				<div className="lg:col-span-7 flex flex-col justify-center space-y-8 px-2">
					<div className="space-y-6">
						{/* Header */}
						<div className="flex items-center justify-between border-b border-border/10 pb-4">
							<div className="space-y-1">
								<span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
									Config Console
								</span>
								<h2 className="text-xl font-black tracking-tight text-foreground">
									{t(
										"detail.selfMedia.initPanel.stepBrand.title",
										"账号与品牌定位",
									)}
								</h2>
							</div>

							{records.length > 0 && (
								<button
									type="button"
									className={cn(
										"flex items-center gap-1.5 rounded-full border border-border/80 px-3 py-1.5 text-xs font-semibold transition-all duration-300",
										showRecordPicker
											? "border-primary/35 bg-primary/5 text-primary"
											: "text-muted-foreground hover:border-primary/20 hover:text-foreground active:scale-[0.98] cursor-pointer",
									)}
									onClick={() => setShowRecordPicker(!showRecordPicker)}
								>
									<History size={12} />
									<span>
										{t(
											"detail.selfMedia.initPanel.stepBrand.historyRecords",
											"历史记录",
										)}
									</span>
									<span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-bold text-muted-foreground/80">
										{records.length}
									</span>
								</button>
							)}
						</div>

						{/* History Picker Overlay */}
						{showRecordPicker && records.length > 0 && (
							<HistoryRecordPicker
								records={records}
								onSelect={handleSelectRecord}
								onDelete={handleDeleteRecord}
								onClose={() => setShowRecordPicker(false)}
							/>
						)}

						{/* Form Content - Elegant card-free borderless styling */}
						<div className="space-y-6">
							{/* 1. Account Name */}
							<div className="space-y-2">
								<label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
									{t(
										"detail.selfMedia.initPanel.stepBrand.accountName",
										"账号名称",
									)}
									<span className="text-primary ml-1">*</span>
								</label>

								<div className="flex items-center gap-3">
									<div className="group relative flex-1">
										<User
											className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/45"
											size={16}
										/>
										<input
											type="text"
											className="w-full rounded-xl border border-border/40 bg-muted/10 px-4 py-3 pl-10 pr-8 text-sm shadow-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-4 focus:ring-primary/5 outline-none"
											placeholder={t(
												"detail.selfMedia.initPanel.stepBrand.accountPlaceholder",
												"如：@超级麦吉",
											)}
											value={author}
											onChange={(e) => onChange("author", e.target.value)}
											disabled={isFetching}
										/>
										<InlineVoiceButton
											onResult={(text) => onChange("author", author + text)}
										/>
									</div>

									{/* Platform scrapers */}
									<div className="relative" ref={platformDropdownRef}>
										<button
											type="button"
											className={cn(
												"flex h-11 items-center gap-1.5 rounded-xl border px-4 text-xs font-semibold transition-all duration-300",
												isPlatformFetching
													? "border-primary/30 bg-primary/5 text-primary cursor-wait"
													: !canFetchFromPlatform
														? "cursor-not-allowed border-border/45 bg-muted/15 text-muted-foreground/35"
														: "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground active:scale-[0.98] cursor-pointer",
											)}
											onClick={() => {
												if (!canFetchFromPlatform || isPlatformFetching)
													return
												setShowPlatformFetch(!showPlatformFetch)
											}}
											disabled={isPlatformFetching || !canFetchFromPlatform}
										>
											<Globe size={13} />
											<span>
												{isPlatformFetching
													? t(
															"detail.selfMedia.initPanel.stepBrand.platformFetching",
															"获取中…",
														)
													: "平台导入"}
											</span>
										</button>

										{showPlatformFetch && canFetchFromPlatform && (
											<div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
												<div className="bg-muted/30 border-b border-border/50 px-4 py-2">
													<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
														选择目标平台以拉取
													</span>
												</div>
												<div className="py-1">
													{PLATFORM_OPTIONS.map((opt) => (
														<button
															key={opt.key}
															type="button"
															className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/50 cursor-pointer"
															onClick={() =>
																handleFetchFromPlatform(
																	opt.key,
																	opt.label,
																)
															}
														>
															<ChevronRight
																size={12}
																className="text-muted-foreground/50"
															/>
															<span>{opt.label}</span>
														</button>
													))}
												</div>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* 2. Brand Position */}
							<div className="space-y-2.5">
								<label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
									{t(
										"detail.selfMedia.initPanel.stepBrand.brandPosition",
										"品牌/IP 定位",
									)}
									<span className="text-primary ml-1">*</span>
								</label>

								<div className="group relative">
									<Compass
										className="absolute left-3.5 top-3 text-muted-foreground/45"
										size={16}
									/>
									<textarea
										rows={4}
										className="w-full rounded-xl border border-border/40 bg-muted/10 px-4 py-3 pl-10 pr-8 text-sm shadow-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-4 focus:ring-primary/5 outline-none resize-none"
										placeholder={t(
											"detail.selfMedia.initPanel.stepBrand.brandPositionPlaceholder",
											"一句话描述你的定位，如：分享 AI 工具",
										)}
										value={brandPosition}
										onChange={(e) => onChange("brandPosition", e.target.value)}
										disabled={isFetching}
									/>
									<InlineVoiceButton
										variant="textarea"
										onResult={(text) =>
											onChange("brandPosition", brandPosition + text)
										}
									/>
								</div>

								{/* Premium Quick Tags */}
								<div className="flex flex-wrap items-center gap-1.5 pt-1">
									<span className="text-[10px] font-bold text-muted-foreground/50 mr-1">
										推荐定位:
									</span>
									{QUICK_TAGS.map((tag) => (
										<button
											key={tag}
											type="button"
											className="rounded-full border border-border/40 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary cursor-pointer"
											onClick={() => onChange("brandPosition", tag)}
										>
											#{tag}
										</button>
									))}
								</div>
							</div>

							{/* 3. Target Audience */}
							<div className="space-y-2">
								<div className="flex items-center gap-1.5">
									<label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
										{t(
											"detail.selfMedia.initPanel.stepBrand.targetAudience",
											"目标受众",
										)}
									</label>
									<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground font-normal">
										{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
									</span>
								</div>

								<div className="group relative">
									<Target
										className="absolute left-3.5 top-3 text-muted-foreground/45"
										size={16}
									/>
									<textarea
										rows={4}
										className="w-full rounded-xl border border-border/40 bg-muted/10 px-4 py-3 pl-10 pr-8 text-sm shadow-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-4 focus:ring-primary/5 outline-none resize-none"
										placeholder={t(
											"detail.selfMedia.initPanel.stepBrand.targetAudiencePlaceholder",
											"如：25-35 岁职场人、大学生、宝妈",
										)}
										value={targetAudience}
										onChange={(e) => onChange("targetAudience", e.target.value)}
										disabled={isFetching}
									/>
									<InlineVoiceButton
										variant="textarea"
										onResult={(text) =>
											onChange("targetAudience", targetAudience + text)
										}
									/>
								</div>
							</div>

							<div className="h-px bg-border/10 my-2" />

							{/* 4. Brand Images Upload */}
							<BrandAssetUpload
								brandImages={brandImages}
								brandImageUploadProgress={brandImageUploadProgress}
								hydratingImageIds={hydratingImageIds}
								isFetching={isFetching}
								onFilesSelect={handleFilesSelect}
								onRemoveBrandImage={handleRemoveBrandImage}
								onBrandImageDescChange={handleBrandImageDescChange}
							/>
						</div>

						{/* Inline save record trigger */}
						{author.trim() && brandPosition.trim() && brandService && (
							<div className="flex justify-end border-t border-border/10 pt-4 animate-in fade-in">
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-full border border-border/80 px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-all duration-300 hover:border-primary/20 hover:text-foreground active:scale-[0.98] cursor-pointer"
									onClick={handleSaveRecord}
								>
									<Eye size={12} className="text-primary/70" />
									<span>
										{t(
											"detail.selfMedia.initPanel.stepBrand.saveAsNew",
											"保存到我的品牌库",
										)}
									</span>
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Save confirm dialog */}
			{showSaveConfirm && (
				<SaveConfirmDialog onConfirm={handleConfirmSave} onCancel={handleSkipSave} />
			)}
		</div>
	)
})

export default StepBrandInfo
export type { BrandImageItem }
