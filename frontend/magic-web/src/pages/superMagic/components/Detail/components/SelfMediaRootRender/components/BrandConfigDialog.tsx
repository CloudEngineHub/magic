import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
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
import { BrandInfoFields } from "./SelfMediaInitPanel/steps/StepBrandInfo/components/BrandInfoFields"
import type { BrandImageItem, SelfMediaInitGlobalSettings } from "./SelfMediaInitPanel/types"

interface BrandConfigDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	fileStorageService: SelfMediaFileStorageService | null
	attachmentList?: AttachmentNode[]
	projectId?: string
	folderPath?: string
}

function BrandConfigDialog({
	open,
	onOpenChange,
	fileStorageService,
	attachmentList,
	projectId,
	folderPath,
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
		await saveSettings(draftSettings)
		onOpenChange(false)
	}, [draftSettings, onOpenChange, saveSettings])

	const handleCancel = useCallback(() => {
		setDraftSettings(settings)
		onOpenChange(false)
	}, [onOpenChange, settings])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="grid max-h-[88vh] !max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
				data-testid="self-media-brand-config-dialog"
			>
				<DialogHeader className="gap-1 border-b bg-card px-5 py-4">
					<DialogTitle className="text-lg font-semibold tracking-tight">
						{t("detail.selfMedia.brandConfig.title")}
					</DialogTitle>
					<DialogDescription className="text-xs">
						{t("detail.selfMedia.brandConfig.description")}
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-5">
					{isLoading ? (
						<div
							className="flex min-h-64 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium text-muted-foreground"
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
							projectId={projectId}
							folderPath={folderPath}
							onBrandImagesUploadingChange={setBrandImagesUploading}
							brandImageUploadTarget="brand"
							compact
							layout="settings"
						/>
					)}
				</div>

				<DialogFooter className="border-t bg-card px-5 py-3">
					<Button
						type="button"
						variant="outline"
						onClick={handleCancel}
						data-testid="self-media-brand-config-cancel-button"
					>
						{t("detail.selfMedia.brandConfig.cancel")}
					</Button>
					<Button
						type="button"
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
