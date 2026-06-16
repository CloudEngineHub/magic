import { useTranslation } from "react-i18next"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Textarea } from "@/components/shadcn-ui/textarea"
import InlineVoiceButton from "../../../components/ui/InlineVoiceButton"
import type { BrandImageItem } from "../../../types"
import { BrandAssetUpload } from "./BrandAssetUpload"
import { BRAND_POSITION_QUICK_TAGS } from "./brandInfoOptions"

export type BrandInfoSettingsField = "author" | "brandPosition" | "targetAudience" | "brandAssets"

interface BrandInfoSettingsLayoutProps {
	author: string
	brandPosition: string
	targetAudience: string
	brandImages: BrandImageItem[]
	brandImageUploadProgress: Record<string, number>
	hydratingImageIds: Set<string>
	activeBrandField: BrandInfoSettingsField | null
	onActiveBrandFieldChange: (field: BrandInfoSettingsField | null) => void
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	onFilesSelect: (files: FileList, uploadedPaths?: (string | undefined)[]) => void
	onRemoveBrandImage: (id: string) => void
	onBrandImageDescChange: (id: string, description: string) => void
	layout?: "wizard" | "settings"
}

export function BrandInfoSettingsLayout({
	author,
	brandPosition,
	targetAudience,
	brandImages,
	brandImageUploadProgress,
	hydratingImageIds,
	activeBrandField,
	onActiveBrandFieldChange,
	onChange,
	onFilesSelect,
	onRemoveBrandImage,
	onBrandImageDescChange,
	layout = "settings",
}: BrandInfoSettingsLayoutProps) {
	const { t } = useTranslation("super")
	const isWizardLayout = layout === "wizard"
	const showBrandPositionQuickTags = !isWizardLayout
	const showBrandImageCount = !isWizardLayout || brandImages.length > 0
	const getFieldLabelClass = (field: BrandInfoSettingsField) =>
		`inline-flex text-xs font-medium transition-colors ${
			activeBrandField === field ? "text-[#18181b]" : "text-[#71717a]"
		}`

	return (
		<div
			className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start"
			data-testid="self-media-brand-config-settings-layout"
			data-layout={layout}
		>
			<section
				className="rounded-[20px] border border-[#18181b]/[0.06] bg-white p-4 shadow-[0_12px_32px_rgba(24,24,27,0.05)]"
				data-testid="self-media-brand-config-profile-card"
			>
				{!isWizardLayout ? (
					<div className="mb-4">
						<h3 className="text-sm font-[780] text-[#18181b]">
							{t("detail.selfMedia.initPanel.stepBrand.profileSection", "账号档案")}
						</h3>
						<p className="mt-1 text-xs leading-relaxed text-[#52525b]">
							{t(
								"detail.selfMedia.initPanel.stepBrand.profileSectionHint",
								"配置 AI 生成内容时默认使用的身份、定位与受众。",
							)}
						</p>
					</div>
				) : null}

				<div className="space-y-4">
					<div className="space-y-1.5">
						<label className={getFieldLabelClass("author")}>
							{t("detail.selfMedia.initPanel.stepBrand.accountName", "账号名称")}
						</label>
						<div className="group relative">
							<Input
								type="text"
								className="h-10 rounded-[14px] border border-[#18181b]/[0.06] bg-[#f8f8f9] pr-8 text-sm text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.78)] placeholder:text-[#71717a]/60 focus-visible:ring-[#18181b]/15"
								placeholder={t(
									"detail.selfMedia.initPanel.stepBrand.accountPlaceholder",
									"如：@超级麦吉",
								)}
								value={author}
								onChange={(e) => onChange("author", e.target.value)}
								onFocus={() => onActiveBrandFieldChange("author")}
								onBlur={() => onActiveBrandFieldChange(null)}
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
								className="min-h-[92px] resize-none rounded-[16px] border border-[#18181b]/[0.06] bg-[#f8f8f9] pr-10 text-sm text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.78)] placeholder:text-[#71717a]/60 focus-visible:ring-[#18181b]/15"
								placeholder={t(
									"detail.selfMedia.initPanel.stepBrand.brandPositionPlaceholder",
									"一句话描述你的定位，如：分享 AI 工具",
								)}
								value={brandPosition}
								onChange={(e) => onChange("brandPosition", e.target.value)}
								onFocus={() => onActiveBrandFieldChange("brandPosition")}
								onBlur={() => onActiveBrandFieldChange(null)}
							/>
							<InlineVoiceButton
								variant="textarea"
								value={brandPosition}
								onResult={(text) => onChange("brandPosition", text)}
							/>
						</div>

						{showBrandPositionQuickTags ? (
							<div className="flex flex-wrap items-center gap-1.5 pt-1">
								{BRAND_POSITION_QUICK_TAGS.map((tag) => (
									<Button
										key={tag}
										type="button"
										variant="secondary"
										size="sm"
										className="h-6 rounded-full border border-[#18181b]/[0.06] bg-[#f8f8f9] px-2 text-[10px] font-[720] text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.78)] hover:bg-[#18181b] hover:text-[#ffd637]"
										onClick={() => onChange("brandPosition", tag)}
									>
										#{tag}
									</Button>
								))}
							</div>
						) : null}
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center gap-1.5">
							<label className={getFieldLabelClass("targetAudience")}>
								{t(
									"detail.selfMedia.initPanel.stepBrand.targetAudience",
									"目标受众",
								)}
							</label>
							<Badge className="rounded-full border border-[#18181b]/[0.06] bg-[#f8f8f9] px-2 text-[10px] font-normal text-[#52525b] shadow-[inset_0_1px_rgba(255,255,255,0.78)]">
								{t("detail.selfMedia.initPanel.stepBrand.optional", "选填")}
							</Badge>
						</div>
						<div className="group relative">
							<Textarea
								rows={3}
								className="min-h-[84px] resize-none rounded-[16px] border border-[#18181b]/[0.06] bg-[#f8f8f9] pr-10 text-sm text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.78)] placeholder:text-[#71717a]/60 focus-visible:ring-[#18181b]/15"
								placeholder={t(
									"detail.selfMedia.initPanel.stepBrand.targetAudiencePlaceholder",
									"如：25-35 岁职场人、大学生、宝妈",
								)}
								value={targetAudience}
								onChange={(e) => onChange("targetAudience", e.target.value)}
								onFocus={() => onActiveBrandFieldChange("targetAudience")}
								onBlur={() => onActiveBrandFieldChange(null)}
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
				className="h-fit rounded-[20px] border border-[#18181b]/[0.06] bg-white p-4 shadow-[0_12px_32px_rgba(24,24,27,0.05)]"
				data-testid="self-media-brand-config-assets-card"
			>
				<div className="mb-4 flex items-start justify-between gap-3">
					<div>
						<h3 className="text-sm font-[780] text-[#18181b]">
							{t("detail.selfMedia.initPanel.stepBrand.brandImages", "品牌形象素材")}
						</h3>
						{!isWizardLayout ? (
							<p className="mt-1 text-xs leading-relaxed text-[#52525b]">
								{t(
									"detail.selfMedia.initPanel.stepBrand.brandImagesHint",
									"上传 Logo、IP 形象或风格参考图。",
								)}
							</p>
						) : null}
					</div>
					{showBrandImageCount ? (
						<Badge className="rounded-full border-0 bg-[#18181b] px-2 text-[#ffd637] shadow-[0_10px_22px_rgba(24,24,27,0.14)]">
							{brandImages.length}
						</Badge>
					) : null}
				</div>

				<div
					className="space-y-3"
					onFocus={() => onActiveBrandFieldChange("brandAssets")}
					onBlur={() => onActiveBrandFieldChange(null)}
				>
					<BrandAssetUpload
						brandImages={brandImages}
						brandImageUploadProgress={brandImageUploadProgress}
						hydratingImageIds={hydratingImageIds}
						isFetching={false}
						onFilesSelect={onFilesSelect}
						onRemoveBrandImage={onRemoveBrandImage}
						onBrandImageDescChange={onBrandImageDescChange}
						layout="stacked"
					/>
				</div>
			</section>
		</div>
	)
}
