import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { ChevronDown, Eye, History } from "lucide-react"
import { cn } from "@/lib/utils"

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
	isPlatformFetching?: boolean
	onPlatformFetchStart?: () => void
	onPlatformFetchEnd?: () => void
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
		isPlatformFetching = false,
		onPlatformFetchStart,
		onPlatformFetchEnd,
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
	const initialized = useRef(false)

	const isBrandAssetsReady = useCallback(() => {
		return !brandImages.some((img) => img.file.size > 0 && !img.uploadedPath)
	}, [brandImages])

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

	const isFetching = isPlatformFetching

	return (
		<div
			className={cn("mx-auto max-w-5xl space-y-6 py-4", isFetching && "pointer-events-none")}
		>
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
						<BrandInfoFields
							author={author}
							brandPosition={brandPosition}
							targetAudience={targetAudience}
							brandImages={brandImages}
							onChange={onChange}
							onBrandImagesChange={onBrandImagesChange}
							fileStorageService={fileStorageService}
							attachmentList={attachmentList}
							projectId={projectId}
							folderPath={folderPath}
							isPlatformFetching={isPlatformFetching}
							onPlatformFetchStart={onPlatformFetchStart}
							onPlatformFetchEnd={onPlatformFetchEnd}
							onBrandImagesUploadingChange={onBrandImagesUploadingChange}
							brandImageUploadTarget={brandImageUploadTarget}
						/>

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

			{showSaveConfirm && (
				<SaveConfirmDialog onConfirm={handleConfirmSave} onCancel={handleSkipSave} />
			)}
		</div>
	)
})

export default StepBrandInfo
export type { BrandImageItem }
