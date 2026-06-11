import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { ChevronDown, Eye, History } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"

import type { SelfMediaBrandRecordService, StoredBrandRecord } from "@/services/selfMedia"
import type { AttachmentNode } from "../../../../services"
import type { SelfMediaFileStorageService } from "../../../../services/SelfMediaFileStorageService"
import type { BrandImageItem } from "../../types"
import { BrandInfoFields } from "./components/BrandInfoFields"
import { HistoryRecordPicker } from "./components/HistoryRecordPicker"
import { SaveConfirmDialog } from "./components/SaveConfirmDialog"
import { WelcomeHero } from "./components/WelcomeHero"

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
	onConfirmNext?: () => void
	onBrandImagesUploadingChange?: (uploading: boolean) => void
	brandImageUploadTarget?: "draft" | "brand"
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
		onConfirmNext,
		onBrandImagesUploadingChange,
		brandImageUploadTarget = "draft",
	},
	ref,
) {
	const { t } = useTranslation("super")
	const [records, setRecords] = useState<BrandRecord[]>([])
	const [showRecordPicker, setShowRecordPicker] = useState(false)
	const [showSaveConfirm, setShowSaveConfirm] = useState(false)
	const [isBrandFormOpen, setIsBrandFormOpen] = useState(false)
	const hasAutoFilled = useRef(false)
	const hasUserEditedBrand = useRef(false)
	const hasResolvedSavePrompt = useRef(false)
	const initialized = useRef(false)

	const isBrandAssetsReady = useCallback(() => {
		return !brandImages.some((img) => img.file.size > 0 && !img.uploadedPath)
	}, [brandImages])

	useImperativeHandle(
		ref,
		() => ({
			checkBeforeNext: () => {
				if (!isBrandAssetsReady()) return false
				if (
					hasUserEditedBrand.current &&
					!hasResolvedSavePrompt.current &&
					records.length === 0 &&
					author.trim() &&
					brandPosition.trim()
				) {
					setShowSaveConfirm(true)
					return false
				}
				return true
			},
			isBrandAssetsReady,
		}),
		[records.length, author, brandPosition, isBrandAssetsReady],
	)

	const markBrandEdited = useCallback(() => {
		hasUserEditedBrand.current = true
		hasResolvedSavePrompt.current = false
	}, [])

	const handleBrandFieldChange = useCallback(
		(field: "author" | "brandPosition" | "targetAudience", value: string) => {
			markBrandEdited()
			onChange(field, value)
		},
		[markBrandEdited, onChange],
	)

	const handleBrandImagesChange = useCallback(
		(images: BrandImageItem[]) => {
			markBrandEdited()
			onBrandImagesChange(images)
		},
		[markBrandEdited, onBrandImagesChange],
	)

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
		hasResolvedSavePrompt.current = true
		hasUserEditedBrand.current = false
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
		hasResolvedSavePrompt.current = true
		hasUserEditedBrand.current = false
		setShowSaveConfirm(false)
		onConfirmNext?.()
	}, [onConfirmNext])

	const handleSaveRecord = useCallback(() => {
		if (!author.trim() || !brandPosition.trim() || !brandService) return
		hasResolvedSavePrompt.current = true
		hasUserEditedBrand.current = false
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
			hasResolvedSavePrompt.current = true
			hasUserEditedBrand.current = false
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

	return (
		<div className="mx-auto max-w-5xl space-y-6 py-4">
			<WelcomeHero />

			<div className="space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-[#434c81]/[0.045] p-4 text-card-foreground">
					<button
						type="button"
						className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-4 rounded-md text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
						onClick={() => setIsBrandFormOpen((open) => !open)}
					>
						<div className="space-y-1">
							<div className="space-y-1">
								<span className="text-xs font-medium text-muted-foreground">
									Optional Brand Profile
								</span>
								<h2 className="text-lg font-semibold tracking-tight text-foreground">
									{t(
										"detail.selfMedia.initPanel.stepBrand.title",
										"账号与品牌定位",
									)}
								</h2>
							</div>
							<p className="text-xs text-muted-foreground">
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
						<Button
							type="button"
							className={cn(
								"gap-1.5 text-xs",
								showRecordPicker && "bg-accent text-accent-foreground",
							)}
							variant="outline"
							size="sm"
							onClick={() => setShowRecordPicker(!showRecordPicker)}
						>
							<History size={12} />
							<span>
								{t(
									"detail.selfMedia.initPanel.stepBrand.historyRecords",
									"历史记录",
								)}
							</span>
							<Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[9px]">
								{records.length}
							</Badge>
						</Button>
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
					<div className="space-y-6 animate-in fade-in slide-in-from-top-2">
						<BrandInfoFields
							author={author}
							brandPosition={brandPosition}
							targetAudience={targetAudience}
							brandImages={brandImages}
							onChange={handleBrandFieldChange}
							onBrandImagesChange={handleBrandImagesChange}
							fileStorageService={fileStorageService}
							attachmentList={attachmentList}
							projectId={projectId}
							folderPath={folderPath}
							onBrandImagesUploadingChange={onBrandImagesUploadingChange}
							brandImageUploadTarget={brandImageUploadTarget}
						/>

						{author.trim() && brandPosition.trim() && brandService && (
							<div className="flex justify-end pt-1 animate-in fade-in">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="gap-1.5 text-xs"
									onClick={handleSaveRecord}
								>
									<Eye size={12} />
									<span>
										{t(
											"detail.selfMedia.initPanel.stepBrand.saveAsNew",
											"保存到我的品牌库",
										)}
									</span>
								</Button>
							</div>
						)}
					</div>
				)}
			</div>

			{showSaveConfirm && (
				<SaveConfirmDialog onConfirm={handleConfirmSave} onCancel={handleSkipSave} />
			)}
		</div>
	)
})

export default StepBrandInfo
export type { BrandImageItem }
