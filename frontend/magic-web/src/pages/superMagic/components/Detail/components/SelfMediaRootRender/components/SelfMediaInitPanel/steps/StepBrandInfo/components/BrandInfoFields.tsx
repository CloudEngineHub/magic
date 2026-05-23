import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { ChevronRight, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

import InlineVoiceButton from "../../../components/ui/InlineVoiceButton"
import { fetchAccountInfoViaTopic } from "../../../../../services/selfMediaAccountFetch"
import { useBrandImagePreviewHydration } from "../../../hooks/useBrandImagePreviewHydration"
import type { AttachmentNode } from "../../../../../services"
import type { SelfMediaFileStorageService } from "../../../../../services/SelfMediaFileStorageService"
import type { BrandImageItem } from "../../../types"
import { BrandAssetUpload } from "./BrandAssetUpload"
import { BrandFieldRow } from "./BrandFieldRow"

const PLATFORM_OPTIONS = [
	{ key: "xiaohongshu", label: "从小红书获取账号信息" },
	{ key: "douyin", label: "从抖音获取账号信息" },
	{ key: "weixin-mp", label: "从微信公众号获取账号信息" },
	{ key: "bilibili", label: "从B站获取账号信息" },
	{ key: "instagram", label: "从 Instagram 获取账号信息" },
	{ key: "tiktok", label: "从 TikTok 获取账号信息" },
] as const

const QUICK_TAGS = ["AI分享", "科技数码", "职场成长", "好物测评", "萌宠日常", "美食探店"]

type BrandInfoField = "author" | "brandPosition" | "targetAudience" | "brandAssets"

interface BrandInfoFieldsProps {
	author: string
	brandPosition: string
	targetAudience: string
	brandImages: BrandImageItem[]
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	onBrandImagesChange: (images: BrandImageItem[]) => void
	fileStorageService?: SelfMediaFileStorageService | null
	attachmentList?: AttachmentNode[]
	projectId?: string
	folderPath?: string
	isPlatformFetching?: boolean
	onPlatformFetchStart?: () => void
	onPlatformFetchEnd?: () => void
	onBrandImagesUploadingChange?: (uploading: boolean) => void
	brandImageUploadTarget?: "draft" | "brand"
	compact?: boolean
	showPlatformImport?: boolean
}

export function BrandInfoFields({
	author,
	brandPosition,
	targetAudience,
	brandImages,
	onChange,
	onBrandImagesChange,
	fileStorageService,
	attachmentList,
	projectId,
	folderPath,
	isPlatformFetching = false,
	onPlatformFetchStart,
	onPlatformFetchEnd,
	onBrandImagesUploadingChange,
	brandImageUploadTarget = "draft",
	compact = false,
	showPlatformImport = true,
}: BrandInfoFieldsProps) {
	const { t } = useTranslation("super")
	const [showPlatformFetch, setShowPlatformFetch] = useState(false)
	const [activeBrandField, setActiveBrandField] = useState<BrandInfoField | null>(null)
	const platformDropdownRef = useRef<HTMLDivElement>(null)
	const [brandImageUploadProgress, setBrandImageUploadProgress] = useState<
		Record<string, number>
	>({})

	const { hydratingImageIds } = useBrandImagePreviewHydration({
		attachmentList,
		brandImages,
		onBrandImagesChange,
	})

	useEffect(() => {
		onBrandImagesUploadingChange?.(Object.keys(brandImageUploadProgress).length > 0)
	}, [brandImageUploadProgress, onBrandImagesUploadingChange])

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

	useEffect(() => {
		if (!author.trim()) setShowPlatformFetch(false)
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
				if (!result) onPlatformFetchEnd?.()
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

				const upload =
					brandImageUploadTarget === "brand"
						? fileStorageService.uploadBrandImageToBrandConfig.bind(fileStorageService)
						: fileStorageService.uploadBrandImageToDraft.bind(fileStorageService)
				const uploadedPath = await upload(item.file, (percent) => {
					setBrandImageUploadProgress((prev) => ({ ...prev, [item.id]: percent }))
				})

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
		[brandImages, onBrandImagesChange, fileStorageService, brandImageUploadTarget, t],
	)

	const handleRemoveBrandImage = useCallback(
		(id: string) => {
			const item = brandImages.find((img) => img.id === id)
			if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
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

	const handleAutoResize = useCallback((el: HTMLTextAreaElement) => {
		el.style.height = "auto"
		el.style.height = `${el.scrollHeight}px`
	}, [])

	const handleTextareaBlur = useCallback((el: HTMLTextAreaElement) => {
		el.style.height = ""
		setActiveBrandField(null)
	}, [])

	const isFetching = isPlatformFetching
	const canFetchFromPlatform = Boolean(author.trim()) && Boolean(projectId)
	const getFieldLabelClass = (field: BrandInfoField) =>
		cn(
			"inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
			activeBrandField === field ? "bg-primary/20 text-zinc-950" : "text-muted-foreground",
		)
	const rowClassName = compact ? "gap-y-1.5 pb-4 pt-3" : undefined
	const inputClassName = cn(
		"w-full border-0 border-b border-zinc-200 bg-zinc-50/40 pr-8 outline-none transition-all duration-300 placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03]",
		compact ? "px-3 py-2.5 text-xs" : "px-4 py-3 text-sm",
	)
	const textareaClassName = cn(
		"scrollbar-thin w-full resize-none border-0 border-b border-zinc-200 bg-zinc-50/40 pr-10 text-xs leading-relaxed outline-none transition-[border-color,background-color] duration-300 placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03] sm:text-sm",
		compact ? "min-h-[84px] px-3 py-2.5" : "min-h-[110px] px-4 py-3.5",
	)

	return (
		<div className={cn("space-y-5", compact && "space-y-3")}>
			<div className={cn("flex flex-col gap-6", compact && "gap-4")}>
				<BrandFieldRow
					illustration="author"
					isActive={activeBrandField === "author"}
					className={rowClassName}
					data-testid="self-media-brand-field-author"
					header={
						<label className={getFieldLabelClass("author")}>
							{t("detail.selfMedia.initPanel.stepBrand.accountName", "账号名称")}
						</label>
					}
				>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<div className="group relative min-w-0 flex-1">
							<input
								type="text"
								className={inputClassName}
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
								value={author}
								onResult={(text) => onChange("author", text)}
							/>
						</div>

						{showPlatformImport ? (
							<div className="relative shrink-0" ref={platformDropdownRef}>
								<button
									type="button"
									className={cn(
										"flex w-full items-center justify-center gap-1.5 text-xs font-bold transition-all duration-300 sm:w-auto",
										compact ? "h-10 px-3" : "h-11 px-4",
										isPlatformFetching
											? "cursor-wait bg-primary/10 text-primary"
											: !canFetchFromPlatform
												? "cursor-not-allowed bg-zinc-50 text-muted-foreground/35"
												: "cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:scale-[0.98]",
									)}
									onClick={() => {
										if (!canFetchFromPlatform || isPlatformFetching) return
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
														handleFetchFromPlatform(opt.key, opt.label)
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
						) : null}
					</div>
				</BrandFieldRow>

				<BrandFieldRow
					illustration="position"
					isActive={activeBrandField === "brandPosition"}
					className={rowClassName}
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
								rows={compact ? 3 : 4}
								className={textareaClassName}
								placeholder={t(
									"detail.selfMedia.initPanel.stepBrand.brandPositionPlaceholder",
									"一句话描述你的定位，如：分享 AI 工具",
								)}
								value={brandPosition}
								onChange={(e) => {
									onChange("brandPosition", e.target.value)
									handleAutoResize(e.currentTarget)
								}}
								onFocus={(e) => {
									setActiveBrandField("brandPosition")
									handleAutoResize(e.currentTarget)
								}}
								onBlur={(e) => handleTextareaBlur(e.currentTarget)}
								disabled={isFetching}
							/>
							<InlineVoiceButton
								variant="textarea"
								value={brandPosition}
								onResult={(text) => onChange("brandPosition", text)}
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
									className="cursor-pointer rounded-sm bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 transition-all hover:bg-primary/20 hover:text-zinc-950"
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
					className={rowClassName}
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
								{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
							</span>
						</div>
					}
				>
					<div className="group relative">
						<textarea
							rows={compact ? 3 : 4}
							className={textareaClassName}
							placeholder={t(
								"detail.selfMedia.initPanel.stepBrand.targetAudiencePlaceholder",
								"如：25-35 岁职场人、大学生、宝妈",
							)}
							value={targetAudience}
							onChange={(e) => {
								onChange("targetAudience", e.target.value)
								handleAutoResize(e.currentTarget)
							}}
							onFocus={(e) => {
								setActiveBrandField("targetAudience")
								handleAutoResize(e.currentTarget)
							}}
							onBlur={(e) => handleTextareaBlur(e.currentTarget)}
							disabled={isFetching}
						/>
						<InlineVoiceButton
							variant="textarea"
							value={targetAudience}
							onResult={(text) => onChange("targetAudience", text)}
						/>
					</div>
				</BrandFieldRow>

				<BrandFieldRow
					illustration="assets"
					isActive={activeBrandField === "brandAssets"}
					className={rowClassName}
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
								{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
							</span>
						</div>
					}
				>
					<div
						className={cn("space-y-3", compact && "space-y-2")}
						onFocus={() => setActiveBrandField("brandAssets")}
						onBlur={() => setActiveBrandField(null)}
					>
						<p
							className={cn(
								"text-xs font-medium text-muted-foreground/85",
								compact && "text-[11px]",
							)}
						>
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
	)
}
