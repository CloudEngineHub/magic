import { useTranslation } from "react-i18next"
import type { FileInfoModel } from "../types"
import FieldList from "./FieldList"

function SpecialSection({ model }: { model: FileInfoModel }) {
	const { t } = useTranslation("super")
	const section = model.specialSection
	if (!section) return null

	return (
		<div className="space-y-3">
			<FieldList fields={section.fields} />
			{section.chips?.length ? (
				<div className="flex flex-wrap gap-1.5">
					{section.chips.map((chip) => (
						<span
							key={chip}
							className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
						>
							{chip}
						</span>
					))}
				</div>
			) : null}
			{section.previewItems?.length ? (
				<div className="rounded-md bg-muted/60 p-2.5">
					<div className="mb-2 text-xs text-muted-foreground">
						{t("topicFiles.fileInfo.labels.preview")}
					</div>
					<div className="space-y-1">
						{section.previewItems.map((item) => (
							<div
								key={item}
								className="truncate text-xs text-foreground"
								title={item}
							>
								{item}
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	)
}

export default SpecialSection
