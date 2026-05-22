import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { cn } from "@/lib/utils"
import { Globe, Eye, History, ChevronRight, ChevronDown } from "lucide-react"

import InlineVoiceButton from "../../components/ui/InlineVoiceButton"

import type { SelfMediaBrandRecordService, StoredBrandRecord } from "@/services/selfMedia"
import type { AttachmentNode } from "../../../../services"
import type { SelfMediaFileStorageService } from "../../../../services/SelfMediaFileStorageService"
import { fetchAccountInfoViaTopic } from "../../../../services/selfMediaAccountFetch"
import { useBrandImagePreviewHydration } from "../../hooks/useBrandImagePreviewHydration"

import { WelcomeHero } from "./components/WelcomeHero"
import { BrandAssetUpload } from "./components/BrandAssetUpload"
import { BrandFieldRow } from "./components/BrandFieldRow"
import { HistoryRecordPicker } from "./components/HistoryRecordPicker"
import { SaveConfirmDialog } from "./components/SaveConfirmDialog"
import { BrandImageItem } from "../../types"

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

type BrandInfoField = "author" | "brandPosition" | "targetAudience" | "brandAssets"

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
	const [isBrandFormOpen, setIsBrandFormOpen] = useState(false)
	const [activeBrandField, setActiveBrandField] = useState<BrandInfoField | null>(null)
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
			setIsBrandFormOpen(true)
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
		async (files: FileList, uploadedPaths?: (string | undefined)[]) => {
			if (files.length === 0) return

			const newItems: BrandImageItem[] = Array.from(files).map((file, index) => {
				const isImage = file.type.startsWith("image/")
				return {
					id: crypto.randomUUID(),
					file,
					previewUrl: isImage ? URL.createObjectURL(file) : "",
					description: "",
					isImage,
					uploadedPath: uploadedPaths?.[index],
				}
			})

			let currentItems = [...brandImages, ...newItems]
			onBrandImagesChange(currentItems)

			if (!fileStorageService) return

			for (const item of newItems) {
				if (item.uploadedPath) continue

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
	const getFieldLabelClass = (field: BrandInfoField) =>
		cn(
			"inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
			activeBrandField === field ? "bg-primary/20 text-zinc-950" : "text-muted-foreground",
		)

	return (
		<div
			className={cn("mx-auto max-w-5xl space-y-6 py-4", isFetching && "pointer-events-none")}
		>
			{/* Platform fetching loading notification */}
			{isFetching && (
				<div className="mb-6 flex animate-pulse items-center gap-2.5 border-l-2 border-primary bg-primary/5 px-4 py-3">
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

			<WelcomeHero />

			<div className="bg-white">
				<div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-950/10 px-1 py-4">
					<button
						type="button"
						className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-4 text-left transition-colors hover:bg-zinc-50/50"
						onClick={() => setIsBrandFormOpen((open) => !open)}
					>
						<div className="space-y-1">
							<div className="space-y-1">
								<span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
									Optional Brand Profile
								</span>
								<h2 className="text-lg font-black tracking-tight text-foreground">
									{t(
										"detail.selfMedia.initPanel.stepBrand.title",
										"账号与品牌定位",
									)}
								</h2>
							</div>
							<p className="text-xs font-medium text-muted-foreground">
								品牌信息选填，用于让 AI 更懂你；也可以直接进入下一步。
							</p>
						</div>
						<ChevronDown
							size={18}
							className={cn(
								"mt-1 shrink-0 text-muted-foreground transition-transform",
								isBrandFormOpen && "rotate-180",
							)}
						/>
					</button>

					{records.length > 0 && (
						<button
							type="button"
							className={cn(
								"flex items-center gap-1.5 bg-zinc-100 px-3 py-1.5 text-xs font-semibold transition-all duration-300",
								showRecordPicker
									? "bg-primary/15 text-zinc-950"
									: "cursor-pointer text-muted-foreground hover:bg-zinc-200 hover:text-foreground active:scale-[0.98]",
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
							<span className="bg-white px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground/80">
								{records.length}
							</span>
						</button>
					)}
				</div>

				{showRecordPicker && records.length > 0 && (
					<HistoryRecordPicker
						records={records}
						onSelect={handleSelectRecord}
						onDelete={handleDeleteRecord}
						onClose={() => setShowRecordPicker(false)}
					/>
				)}

				{isBrandFormOpen && (
					<div className="space-y-6 px-1 py-5 animate-in fade-in slide-in-from-top-2">
						<div className="space-y-5">
							<div className="flex flex-col gap-6">
								<BrandFieldRow
									illustration="author"
									isActive={activeBrandField === "author"}
									data-testid="self-media-brand-field-author"
									header={
										<label className={getFieldLabelClass("author")}>
											{t(
												"detail.selfMedia.initPanel.stepBrand.accountName",
												"账号名称",
											)}
										</label>
									}
								>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
										<div className="group relative min-w-0 flex-1">
											<input
												type="text"
												className="w-full border-0 border-b border-zinc-200 bg-zinc-50/40 px-4 py-3 pr-8 text-sm outline-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03]"
												placeholder={t(
													"detail.selfMedia.initPanel.stepBrand.accountPlaceholder",
													"如：@超级麦吉",
												)}
												value={author}
												onChange={(e) => onChange("author", e.target.value)}
												onFocus={() => setActiveBrandField("author")}
												onBlur={() => setActiveBrandField(null)}
												disabled={isFetching}
											/>
											<InlineVoiceButton
												onResult={(text) =>
													onChange("author", author + text)
												}
											/>
										</div>

										<div
											className="relative shrink-0"
											ref={platformDropdownRef}
										>
											<button
												type="button"
												className={cn(
													"flex h-11 w-full items-center justify-center gap-1.5 px-4 text-xs font-bold transition-all duration-300 sm:w-auto",
													isPlatformFetching
														? "cursor-wait bg-primary/10 text-primary"
														: !canFetchFromPlatform
															? "cursor-not-allowed bg-zinc-50 text-muted-foreground/35"
															: "cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:scale-[0.98]",
												)}
												onClick={() => {
													if (!canFetchFromPlatform || isPlatformFetching)
														return
													setShowPlatformFetch(!showPlatformFetch)
												}}
												disabled={
													isPlatformFetching || !canFetchFromPlatform
												}
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
												<div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden border border-zinc-950/10 bg-white shadow-md duration-150 animate-in fade-in slide-in-from-top-2">
													<div className="border-b border-zinc-950/10 bg-zinc-50 px-4 py-2">
														<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
															选择目标平台以拉取
														</span>
													</div>
													<div className="py-1">
														{PLATFORM_OPTIONS.map((opt) => (
															<button
																key={opt.key}
																type="button"
																className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-primary/5"
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
								</BrandFieldRow>

								<BrandFieldRow
									illustration="position"
									isActive={activeBrandField === "brandPosition"}
									data-testid="self-media-brand-field-position"
									header={
										<label className={getFieldLabelClass("brandPosition")}>
											{t(
												"detail.selfMedia.initPanel.stepBrand.brandPosition",
												"品牌/IP 定位",
											)}
										</label>
									}
								>
									<div className="space-y-2.5">
										<div className="group relative">
											<textarea
												rows={4}
												className="min-h-[110px] max-h-56 w-full resize-y border-0 border-b border-zinc-200 bg-zinc-50/40 px-4 py-3.5 pr-10 text-xs sm:text-sm leading-relaxed outline-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03] scrollbar-thin"
												placeholder={t(
													"detail.selfMedia.initPanel.stepBrand.brandPositionPlaceholder",
													"一句话描述你的定位，如：分享 AI 工具",
												)}
												value={brandPosition}
												onChange={(e) =>
													onChange("brandPosition", e.target.value)
												}
												onFocus={() => setActiveBrandField("brandPosition")}
												onBlur={() => setActiveBrandField(null)}
												disabled={isFetching}
											/>
											<InlineVoiceButton
												variant="textarea"
												onResult={(text) =>
													onChange("brandPosition", brandPosition + text)
												}
											/>
										</div>

										<div className="flex flex-wrap items-center gap-1.5 pb-1 pt-1.5">
											<span className="mr-1 text-[10px] font-bold text-muted-foreground/50">
												推荐定位:
											</span>
											{QUICK_TAGS.map((tag) => (
												<button
													key={tag}
													type="button"
													className="cursor-pointer bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 transition-all hover:bg-primary/20 hover:text-zinc-950 rounded-sm"
													onClick={() => onChange("brandPosition", tag)}
												>
													#{tag}
												</button>
											))}
										</div>
									</div>
								</BrandFieldRow>

								<BrandFieldRow
									illustration="audience"
									isActive={activeBrandField === "targetAudience"}
									data-testid="self-media-brand-field-audience"
									header={
										<div className="flex items-center gap-1.5">
											<label className={getFieldLabelClass("targetAudience")}>
												{t(
													"detail.selfMedia.initPanel.stepBrand.targetAudience",
													"目标受众",
												)}
											</label>
											<span className="bg-muted px-1.5 py-0.5 text-[10px] font-normal lowercase text-muted-foreground">
												{t(
													"detail.selfMedia.initPanel.stepBrand.optional",
													"选填",
												)}
											</span>
										</div>
									}
								>
									<div className="group relative">
										<textarea
											rows={4}
											className="min-h-[110px] max-h-56 w-full resize-y border-0 border-b border-zinc-200 bg-zinc-50/40 px-4 py-3.5 pr-10 text-xs sm:text-sm leading-relaxed outline-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03] scrollbar-thin"
											placeholder={t(
												"detail.selfMedia.initPanel.stepBrand.targetAudiencePlaceholder",
												"如：25-35 岁职场人、大学生、宝妈",
											)}
											value={targetAudience}
											onChange={(e) =>
												onChange("targetAudience", e.target.value)
											}
											onFocus={() => setActiveBrandField("targetAudience")}
											onBlur={() => setActiveBrandField(null)}
											disabled={isFetching}
										/>
										<InlineVoiceButton
											variant="textarea"
											onResult={(text) =>
												onChange("targetAudience", targetAudience + text)
											}
										/>
									</div>
								</BrandFieldRow>

								<BrandFieldRow
									illustration="assets"
									isActive={activeBrandField === "brandAssets"}
									data-testid="self-media-brand-field-assets"
									header={
										<div className="flex items-center gap-1.5">
											<label className={getFieldLabelClass("brandAssets")}>
												{t(
													"detail.selfMedia.initPanel.stepBrand.brandImages",
													"品牌形象素材",
												)}
											</label>
											<span className="bg-muted px-1.5 py-0.5 text-[10px] font-normal lowercase text-muted-foreground">
												{t(
													"detail.selfMedia.initPanel.stepBrand.optional",
													"选填",
												)}
											</span>
										</div>
									}
								>
									<div
										className="space-y-3"
										onFocus={() => setActiveBrandField("brandAssets")}
										onBlur={() => setActiveBrandField(null)}
									>
										<p className="text-xs font-medium text-muted-foreground/85">
											{t(
												"detail.selfMedia.initPanel.stepBrand.brandImagesHint",
												"上传品牌 IP 形象、Logo 或风格参考图，AI 生图时将融合这些元素",
											)}
										</p>

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
								</BrandFieldRow>
							</div>
						</div>

						{/* Inline save record trigger */}
						{author.trim() && brandPosition.trim() && brandService && (
							<div className="flex justify-end border-t border-zinc-100 pt-4 animate-in fade-in">
								<button
									type="button"
									className="flex cursor-pointer items-center gap-1.5 bg-zinc-100 px-4 py-1.5 text-xs font-bold text-zinc-800 transition-all hover:bg-zinc-200 active:scale-[0.98]"
									onClick={handleSaveRecord}
								>
									<Eye size={12} className="text-zinc-950" />
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
				)}
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
