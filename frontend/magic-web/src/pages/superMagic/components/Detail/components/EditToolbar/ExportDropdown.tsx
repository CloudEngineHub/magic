import { memo, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { DownloadIcon } from "lucide-react"
import SlideSelectionDialog from "./SlideSelectionDialog"
import type { SlideItem } from "../PPTRender/PPTSidebar/types"
import ActionButton from "../CommonHeader/components/ActionButton"

interface ExportDropdownProps {
	showText?: boolean
	disabled?: boolean
	isExporting?: boolean
	supportPptx?: boolean
	supportSpecificPages?: boolean
	slides?: SlideItem[]
	onExportPptx?: () => void
	onExportSpecificPages?: (
		filePaths: string[],
		format: "source" | "pdf" | "pptx" | "image_png" | "image_jpeg",
	) => void
	onGenerateScreenshot?: (index: number) => Promise<void>
}

function ExportDropdown({
	showText = true,
	disabled = false,
	isExporting = false,
	supportPptx = true,
	supportSpecificPages = false,
	slides = [],
	onExportPptx,
	onExportSpecificPages,
	onGenerateScreenshot,
}: ExportDropdownProps) {
	const { t } = useTranslation("super")
	const [slideDialogOpen, setSlideDialogOpen] = useState(false)
	const isDisabled = disabled || isExporting

	const handlePrimaryClick = useCallback(() => {
		if (isDisabled) return
		if (supportSpecificPages && onExportSpecificPages) {
			setSlideDialogOpen(true)
			return
		}
		onExportPptx?.()
	}, [isDisabled, onExportPptx, onExportSpecificPages, supportSpecificPages])

	function handleConfirmExport(
		filePaths: string[],
		format: "source" | "pdf" | "pptx" | "image_png" | "image_jpeg",
	) {
		onExportSpecificPages?.(filePaths, format)
		setSlideDialogOpen(false)
	}

	return (
		<>
			{supportSpecificPages && onExportSpecificPages && (
				<SlideSelectionDialog
					open={slideDialogOpen}
					onOpenChange={setSlideDialogOpen}
					slides={slides}
					onConfirm={handleConfirmExport}
					isExporting={isExporting}
					onGenerateScreenshot={onGenerateScreenshot}
					supportPptx={supportPptx}
				/>
			)}
			<div className="inline-flex items-center" data-testid="export-dropdown-trigger">
				<span onClick={handlePrimaryClick} data-testid="export-dropdown-primary">
					<ActionButton
						icon={<DownloadIcon className="h-4 w-4" />}
						title={t("ppt.download")}
						text={t("ppt.download")}
						showText={showText}
						disabled={isDisabled}
					/>
				</span>
			</div>
		</>
	)
}

export default memo(ExportDropdown)
