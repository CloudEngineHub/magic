import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Button } from "@/components/shadcn-ui/button"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { useLocaleText } from "@/pages/superMagic/components/MainInputContainer/panels/hooks/useLocaleText"
import SlidesTemplatePanelContent from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/SlidesTemplatePanelContent"
import { useSlidesTemplatePanelState } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplatePanelState"
import type { SlidesTemplateReplacementTarget } from "@/pages/superMagic/utils/slidesTemplateReplacementActions"

interface SlidesTemplateReplacementDialogProps {
	open: boolean
	target: SlidesTemplateReplacementTarget | null
	onOpenChange: (open: boolean) => void
	onConfirm: (template: OptionItem, target: SlidesTemplateReplacementTarget) => void
}

export default function SlidesTemplateReplacementDialog({
	open,
	target,
	onOpenChange,
	onConfirm,
}: SlidesTemplateReplacementDialogProps) {
	const { t } = useTranslation("super")
	const lt = useLocaleText()
	const [selectedTemplate, setSelectedTemplate] = useState<OptionItem | null>(null)
	const slidesState = useSlidesTemplatePanelState()

	if (!target) return null

	const scopeText =
		target.scope === "deck"
			? t("ppt.templateReplacement.scopeDeck")
			: t("ppt.templateReplacement.scopeSlide", { page: target.slideIndex + 1 })

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setSelectedTemplate(null)
				onOpenChange(nextOpen)
			}}
		>
			<DialogContent className="flex h-[760px] max-h-[calc(100vh-32px)] w-[min(90vw,1200px)] !max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
				<DialogHeader className="shrink-0 border-b px-6 py-4">
					<DialogTitle>{t("ppt.templateReplacement.title")}</DialogTitle>
					<p className="text-sm text-muted-foreground">{scopeText}</p>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
					<SlidesTemplatePanelContent
						slidesState={slidesState}
						selectedTemplate={selectedTemplate}
						onTemplateClick={setSelectedTemplate}
						className="h-full"
						toolbarClassName="sticky top-0 z-20 bg-background/95 pb-3 backdrop-blur"
						gridClassName="min-h-0 flex-1"
						showMyTemplates
						enableMyTemplateRemoval
					/>
				</div>
				<DialogFooter className="shrink-0 border-t px-6 py-4">
					<div className="mr-auto min-w-0 text-sm text-muted-foreground">
						{selectedTemplate
							? t("ppt.templateReplacement.selected", {
									name:
										lt(selectedTemplate.label) ||
										lt(selectedTemplate.value) ||
										"",
								})
							: t("ppt.templateReplacement.selectHint")}
					</div>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("common.cancel")}
					</Button>
					<Button
						disabled={!selectedTemplate}
						onClick={() => {
							if (!selectedTemplate) return
							onConfirm(selectedTemplate, target)
							setSelectedTemplate(null)
						}}
					>
						{t("ppt.templateReplacement.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
