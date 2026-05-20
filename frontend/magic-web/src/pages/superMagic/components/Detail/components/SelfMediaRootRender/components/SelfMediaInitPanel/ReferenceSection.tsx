import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { MaterialItem } from "./types"
import MaterialAttachmentList from "./MaterialAttachmentList"

interface ReferenceSectionProps {
	text: string
	onTextChange: (text: string) => void
	materials: MaterialItem[]
	onMaterialsChange: (materials: MaterialItem[]) => void
	onBlur?: () => void
	className?: string
}

export default function ReferenceSection({
	text,
	onTextChange,
	materials,
	onMaterialsChange,
	onBlur,
	className,
}: ReferenceSectionProps) {
	const { t } = useTranslation("super")

	return (
		<div className={cn("space-y-2", className)}>
			<div>
				<label className="mb-1 block text-sm font-semibold">
					{t("detail.selfMedia.initPanel.stepDetail.referencesLabel")}
				</label>
				<p className="text-xs text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepDetail.referencesHint")}
				</p>
			</div>

			<div className="space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4">
				<textarea
					className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
					placeholder={t(
						"detail.selfMedia.initPanel.stepDetail.referencesTextPlaceholder",
					)}
					rows={3}
					value={text}
					onChange={(e) => onTextChange(e.target.value)}
					onBlur={onBlur}
				/>

				<MaterialAttachmentList
					materials={materials}
					onChange={onMaterialsChange}
					addLabel={t("detail.selfMedia.initPanel.stepDetail.referencesUploadLabel")}
					descriptionPlaceholder={t(
						"detail.selfMedia.initPanel.stepDetail.referencesFilePlaceholder",
					)}
					emptyHint={t("detail.selfMedia.initPanel.stepDetail.referencesUploadHint")}
				/>
			</div>
		</div>
	)
}
