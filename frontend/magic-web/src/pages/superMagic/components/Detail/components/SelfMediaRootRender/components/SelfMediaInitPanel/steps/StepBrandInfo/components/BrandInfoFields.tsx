import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Textarea } from "@/components/shadcn-ui/textarea"

import InlineVoiceButton from "../../../components/ui/InlineVoiceButton"
import { useBrandImagePreviewHydration } from "../../../hooks/useBrandImagePreviewHydration"
import type { AttachmentNode } from "../../../../../services"
import type { SelfMediaFileStorageService } from "../../../../../services/SelfMediaFileStorageService"
import type { BrandImageItem } from "../../../types"
import { BrandAssetUpload } from "./BrandAssetUpload"
import { BrandFieldRow } from "./BrandFieldRow"

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
	onBrandImagesUploadingChange?: (uploading: boolean) => void
	brandImageUploadTarget?: "draft" | "brand"
	compact?: boolean
	layout?: "wizard" | "settings"
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
	onBrandImagesUploadingChange,
	brandImageUploadTarget = "draft",
	compact = false,
	layout = "wizard",
}: BrandInfoFieldsProps) {
	const { t } = useTranslation("super")
	const [activeBrandField, setActiveBrandField] = useState<BrandInfoField | null>(null)
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

	const getFieldLabelClass = (field: BrandInfoField) =>
		cn(
			"inline-flex text-xs font-medium transition-colors",
			activeBrandField === field ? "text-foreground" : "text-muted-foreground",
		)
	const rowClassName = compact ? "gap-y-1.5 pb-4 pt-3" : undefined
	const inputClassName = cn(
		"pr-8 placeholder:text-muted-foreground/60",
		compact ? "h-9 text-xs" : "h-10 text-sm",
	)
	const textareaClassName = cn(
		"scrollbar-thin resize-none pr-10 text-xs leading-relaxed placeholder:text-muted-foreground/60 sm:text-sm",
		compact ? "min-h-[84px]" : "min-h-[110px]",
	)

	if (layout === "settings") {
		return (
			<div
				className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
				data-testid="self-media-brand-config-settings-layout"
			>
				<section
					className="rounded-lg border bg-card p-4 shadow-xs"
					data-testid="self-media-brand-config-profile-card"
				>
					<div className="mb-4">
						<h3 className="text-sm font-semibold text-foreground">
							{t("detail.selfMedia.initPanel.stepBrand.profileSection", "账号档案")}
						</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							{t(
								"detail.selfMedia.initPanel.stepBrand.profileSectionHint",
								"配置 AI 生成内容时默认使用的身份、定位与受众。",
							)}
						</p>
					</div>

					<div className="space-y-4">
						<div className="space-y-1.5">
							<label className={getFieldLabelClass("author")}>
								{t("detail.selfMedia.initPanel.stepBrand.accountName", "账号名称")}
							</label>
							<div className="group relative">
								<Input
									type="text"
									className="h-9 pr-8 text-sm"
									placeholder={t(
										"detail.selfMedia.initPanel.stepBrand.accountPlaceholder",
										"如：@超级麦吉",
									)}
									value={author}
									onChange={(e) => onChange("author", e.target.value)}
									onFocus={() => setActiveBrandField("author")}
									onBlur={() => setActiveBrandField(null)}
								/>
								<InlineVoiceButton
									value={author}
									onResult={(text) => onChange("author", text)}
								/>
							</div>
						</div>

						<div className="space-y-1.5">
							<label className={getFieldLabelClass("brandPosition")}>
								{t(
									"detail.selfMedia.initPanel.stepBrand.brandPosition",
									"品牌/IP 定位",
								)}
							</label>
							<div className="group relative">
								<Textarea
									rows={3}
									className="min-h-[92px] resize-none pr-10 text-sm"
									placeholder={t(
										"detail.selfMedia.initPanel.stepBrand.brandPositionPlaceholder",
										"一句话描述你的定位，如：分享 AI 工具",
									)}
									value={brandPosition}
									onChange={(e) => onChange("brandPosition", e.target.value)}
									onFocus={() => setActiveBrandField("brandPosition")}
									onBlur={() => setActiveBrandField(null)}
								/>
								<InlineVoiceButton
									variant="textarea"
									value={brandPosition}
									onResult={(text) => onChange("brandPosition", text)}
								/>
							</div>

							<div className="flex flex-wrap items-center gap-1.5 pt-1">
								{QUICK_TAGS.map((tag) => (
									<Button
										key={tag}
										type="button"
										variant="secondary"
										size="sm"
										className="h-6 rounded-full px-2 text-[10px] font-medium"
										onClick={() => onChange("brandPosition", tag)}
									>
										#{tag}
									</Button>
								))}
							</div>
						</div>

						<div className="space-y-1.5">
							<div className="flex items-center gap-1.5">
								<label className={getFieldLabelClass("targetAudience")}>
									{t(
										"detail.selfMedia.initPanel.stepBrand.targetAudience",
										"目标受众",
									)}
								</label>
								<Badge
									variant="outline"
									className="rounded-md text-[10px] font-normal"
								>
									{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
								</Badge>
							</div>
							<div className="group relative">
								<Textarea
									rows={3}
									className="min-h-[84px] resize-none pr-10 text-sm"
									placeholder={t(
										"detail.selfMedia.initPanel.stepBrand.targetAudiencePlaceholder",
										"如：25-35 岁职场人、大学生、宝妈",
									)}
									value={targetAudience}
									onChange={(e) => onChange("targetAudience", e.target.value)}
									onFocus={() => setActiveBrandField("targetAudience")}
									onBlur={() => setActiveBrandField(null)}
								/>
								<InlineVoiceButton
									variant="textarea"
									value={targetAudience}
									onResult={(text) => onChange("targetAudience", text)}
								/>
							</div>
						</div>
					</div>
				</section>

				<section
					className="h-fit rounded-lg border bg-card p-4 shadow-xs"
					data-testid="self-media-brand-config-assets-card"
				>
					<div className="mb-4 flex items-start justify-between gap-3">
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								{t(
									"detail.selfMedia.initPanel.stepBrand.brandImages",
									"品牌形象素材",
								)}
							</h3>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								{t(
									"detail.selfMedia.initPanel.stepBrand.brandImagesHint",
									"上传 Logo、IP 形象或风格参考图。",
								)}
							</p>
						</div>
						<Badge variant="outline" className="rounded-md">
							{brandImages.length}
						</Badge>
					</div>

					<div
						className="space-y-3"
						onFocus={() => setActiveBrandField("brandAssets")}
						onBlur={() => setActiveBrandField(null)}
					>
						<BrandAssetUpload
							brandImages={brandImages}
							brandImageUploadProgress={brandImageUploadProgress}
							hydratingImageIds={hydratingImageIds}
							isFetching={false}
							onFilesSelect={handleFilesSelect}
							onRemoveBrandImage={handleRemoveBrandImage}
							onBrandImageDescChange={handleBrandImageDescChange}
							layout="stacked"
						/>
					</div>
				</section>
			</div>
		)
	}

	return (
		<div
			className={cn(
				"rounded-lg bg-[#434c81]/[0.045] p-4 text-card-foreground sm:p-5",
				compact && "p-3 sm:p-4",
			)}
			data-testid="self-media-brand-info-wizard-panel"
		>
			<div className="mb-4 flex flex-col gap-1">
				<h3 className="text-sm font-semibold text-foreground">
					{t("detail.selfMedia.initPanel.stepBrand.brandInfoSection", "账号与品牌信息")}
				</h3>
				<p className="text-xs text-muted-foreground">
					{t(
						"detail.selfMedia.initPanel.stepBrand.brandInfoSectionHint",
						"填写默认账号、定位和素材，让后续选题与成文保持统一口吻。",
					)}
				</p>
			</div>

			<div
				className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
				data-testid="self-media-brand-info-wizard-grid"
			>
				<div className={cn("space-y-4", compact && "space-y-3")}>
					<BrandFieldRow
						illustration="author"
						isActive={activeBrandField === "author"}
						className={rowClassName}
						data-testid="self-media-brand-field-author"
						variant="embedded"
						header={
							<label className={getFieldLabelClass("author")}>
								{t("detail.selfMedia.initPanel.stepBrand.accountName", "账号名称")}
							</label>
						}
					>
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
							<div className="group relative min-w-0 flex-1">
								<Input
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
								/>
								<InlineVoiceButton
									value={author}
									onResult={(text) => onChange("author", text)}
								/>
							</div>
						</div>
					</BrandFieldRow>

					<BrandFieldRow
						illustration="position"
						isActive={activeBrandField === "brandPosition"}
						className={rowClassName}
						data-testid="self-media-brand-field-position"
						variant="embedded"
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
								<Textarea
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
								/>
								<InlineVoiceButton
									variant="textarea"
									value={brandPosition}
									onResult={(text) => onChange("brandPosition", text)}
								/>
							</div>

							<div className="flex flex-wrap items-center gap-1.5 pb-1 pt-1.5">
								<span className="mr-1 text-[10px] font-medium text-muted-foreground/70">
									推荐定位
								</span>
								{QUICK_TAGS.map((tag) => (
									<Button
										key={tag}
										type="button"
										variant="secondary"
										size="sm"
										className="h-6 rounded-full px-2 text-[10px] font-medium"
										onClick={() => onChange("brandPosition", tag)}
									>
										#{tag}
									</Button>
								))}
							</div>
						</div>
					</BrandFieldRow>

					<BrandFieldRow
						illustration="audience"
						isActive={activeBrandField === "targetAudience"}
						className={rowClassName}
						data-testid="self-media-brand-field-audience"
						variant="embedded"
						header={
							<div className="flex items-center gap-1.5">
								<label className={getFieldLabelClass("targetAudience")}>
									{t(
										"detail.selfMedia.initPanel.stepBrand.targetAudience",
										"目标受众",
									)}
								</label>
								<Badge
									variant="outline"
									className="rounded-md text-[10px] font-normal"
								>
									{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
								</Badge>
							</div>
						}
					>
						<div className="group relative">
							<Textarea
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
							/>
							<InlineVoiceButton
								variant="textarea"
								value={targetAudience}
								onResult={(text) => onChange("targetAudience", text)}
							/>
						</div>
					</BrandFieldRow>
				</div>

				<BrandFieldRow
					illustration="assets"
					isActive={activeBrandField === "brandAssets"}
					className={cn(
						"h-fit bg-background/65 p-3 hover:bg-background/80 sm:p-4",
						rowClassName,
					)}
					data-testid="self-media-brand-field-assets"
					variant="embedded"
					header={
						<div className="flex items-center gap-1.5">
							<label className={getFieldLabelClass("brandAssets")}>
								{t(
									"detail.selfMedia.initPanel.stepBrand.brandImages",
									"品牌形象素材",
								)}
							</label>
							<Badge variant="outline" className="rounded-md text-[10px] font-normal">
								{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
							</Badge>
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
								"text-xs leading-relaxed text-muted-foreground",
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
							isFetching={false}
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
