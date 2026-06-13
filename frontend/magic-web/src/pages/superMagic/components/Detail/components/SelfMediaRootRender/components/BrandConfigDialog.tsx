import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { message } from "antd"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { useSelfMediaBrandConfig } from "../hooks/useSelfMediaBrandConfig"
import type { AttachmentNode } from "../services"
import type { SelfMediaFileStorageService } from "../services/SelfMediaFileStorageService"
import { selfMediaOverlayStyles } from "./selfMediaOverlayStyles"
import { BrandInfoFields } from "./SelfMediaInitPanel/steps/StepBrandInfo/components/BrandInfoFields"
import type { BrandImageItem, SelfMediaInitGlobalSettings } from "./SelfMediaInitPanel/types"

interface BrandConfigDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	fileStorageService: SelfMediaFileStorageService | null
	attachmentList?: AttachmentNode[]
}

function BrandConfigDialog({
	open,
	onOpenChange,
	fileStorageService,
	attachmentList,
}: BrandConfigDialogProps) {
	const { t } = useTranslation("super")
	const { settings, saveSettings, isLoading, isSaving } = useSelfMediaBrandConfig({
		fileStorageService,
	})
	const [draftSettings, setDraftSettings] = useState<SelfMediaInitGlobalSettings>(settings)
	const [brandImagesUploading, setBrandImagesUploading] = useState(false)

	useEffect(() => {
		if (!open) return
		setDraftSettings(settings)
	}, [open, settings])

	const handleFieldChange = useCallback(
		(field: "author" | "brandPosition" | "targetAudience", value: string) => {
			setDraftSettings((prev) => ({ ...prev, [field]: value }))
		},
		[],
	)

	const handleBrandImagesChange = useCallback((brandImages: BrandImageItem[]) => {
		setDraftSettings((prev) => ({ ...prev, brandImages }))
	}, [])

	const handleSave = useCallback(async () => {
		try {
			await saveSettings(draftSettings)
			onOpenChange(false)
		} catch {
			message.error(t("detail.selfMedia.brandConfig.saveError"))
		}
	}, [draftSettings, onOpenChange, saveSettings, t])

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen && (isSaving || brandImagesUploading)) return
			onOpenChange(nextOpen)
		},
		[brandImagesUploading, isSaving, onOpenChange],
	)

	const handleCancel = useCallback(() => {
		if (isSaving || brandImagesUploading) return
		setDraftSettings(settings)
		onOpenChange(false)
	}, [brandImagesUploading, isSaving, onOpenChange, settings])

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className={`grid max-h-[88vh] !max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 ${selfMediaOverlayStyles.dialogSurface}`}
				data-testid="self-media-brand-config-dialog"
			>
				<DialogHeader
					className={selfMediaOverlayStyles.dialogHeader}
					data-testid="self-media-brand-config-header"
				>
					<DialogTitle className={selfMediaOverlayStyles.dialogTitle}>
						{t("detail.selfMedia.brandConfig.title")}
					</DialogTitle>
					<DialogDescription className={selfMediaOverlayStyles.dialogDescription}>
						{t("detail.selfMedia.brandConfig.description")}
					</DialogDescription>
				</DialogHeader>

				<div className={selfMediaOverlayStyles.dialogBody}>
					{isLoading ? (
						<div
							className={`min-h-64 ${selfMediaOverlayStyles.loadingPanel}`}
							data-testid="self-media-brand-config-loading"
						>
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							<span>{t("detail.selfMedia.brandConfig.loading")}</span>
						</div>
					) : (
						<BrandInfoFields
							author={draftSettings.author}
							brandPosition={draftSettings.brandPosition}
							targetAudience={draftSettings.targetAudience}
							brandImages={draftSettings.brandImages}
							onChange={handleFieldChange}
							onBrandImagesChange={handleBrandImagesChange}
							fileStorageService={fileStorageService}
							attachmentList={attachmentList}
							onBrandImagesUploadingChange={setBrandImagesUploading}
							brandImageUploadTarget="brand"
							layout="settings"
						/>
					)}
				</div>

				<DialogFooter className={selfMediaOverlayStyles.dialogFooter}>
					<Button
						type="button"
						variant="outline"
						className={selfMediaOverlayStyles.secondaryButton}
						onClick={handleCancel}
						data-testid="self-media-brand-config-cancel-button"
					>
						{t("detail.selfMedia.brandConfig.cancel")}
					</Button>
					<Button
						type="button"
						className={selfMediaOverlayStyles.primaryButton}
						onClick={() => void handleSave()}
						disabled={isLoading || isSaving || brandImagesUploading}
						data-testid="self-media-brand-config-save-button"
					>
						{isSaving
							? t("detail.selfMedia.brandConfig.saving")
							: t("detail.selfMedia.brandConfig.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default BrandConfigDialog
