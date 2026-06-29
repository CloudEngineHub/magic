import { useTranslation } from "react-i18next"
import MagicEllipseWithTooltip from "@/components/base/MagicEllipseWithTooltip/MagicEllipseWithTooltip"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import type { FileInfoModel } from "../types"
import { translateValue } from "../helpers"
import FieldList from "./FieldList"
import Section from "./Section"
import SpecialSection from "./SpecialSection"
import TechnicalSection from "./TechnicalSection"

function FileInfoContent({ model }: { model: FileInfoModel }) {
	const { t } = useTranslation("super")
	const typeLabel = model.typeLabelFallback || t(model.typeLabelKey)

	return (
		<div className="flex max-h-[min(720px,80vh)] flex-col overflow-hidden rounded-b-lg bg-background">
			<div className="flex gap-3 px-5 py-5">
				<div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
					<MagicFileIcon type={model.iconType} size={32} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="line-clamp-2 break-words text-base font-semibold leading-5 text-foreground">
						{model.displayName}
					</div>
					<div className="mt-2 flex min-w-0 items-center gap-2">
						<span className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
							{typeLabel}
						</span>
						<MagicEllipseWithTooltip
							text={model.path}
							maxWidth="100%"
							className="min-w-0 flex-1 text-xs text-muted-foreground"
						/>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 px-5 pb-4 sm:grid-cols-4">
				{model.metrics.map((metric) => (
					<div key={metric.key} className="rounded-md bg-muted/60 px-3 py-2">
						<div className="truncate text-sm font-medium text-foreground">
							{translateValue(t, metric.value)}
						</div>
						<div className="mt-0.5 truncate text-xs text-muted-foreground">
							{t(metric.labelKey)}
						</div>
					</div>
				))}
			</div>

			<div className="min-h-0 overflow-y-auto">
				<Section title={t("topicFiles.fileInfo.sections.general")}>
					<FieldList fields={model.generalFields} />
				</Section>

				{model.contentFields.length > 0 && (
					<Section title={t("topicFiles.fileInfo.sections.content")}>
						<FieldList fields={model.contentFields} />
					</Section>
				)}

				{model.specialSection && (
					<Section title={t("topicFiles.fileInfo.sections.special")}>
						<SpecialSection model={model} />
					</Section>
				)}

				<TechnicalSection fields={model.technicalFields} />
			</div>
		</div>
	)
}

export default FileInfoContent
