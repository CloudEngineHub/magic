import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/shadcn-ui/checkbox"

interface FileShareHtmlDependenciesOptionProps {
	analysisError: Error | null
	checked: boolean
	dependencyFileCount: number
	onCheckedChange: (checked: boolean) => void
	visible: boolean
}

export default function FileShareHtmlDependenciesOption({
	analysisError,
	checked,
	dependencyFileCount,
	onCheckedChange,
	visible,
}: FileShareHtmlDependenciesOptionProps) {
	const { t } = useTranslation("super")

	if (visible) {
		return (
			<label
				className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5"
				data-testid="file-share-html-dependencies-option"
			>
				<Checkbox
					checked={checked}
					onCheckedChange={(next) => onCheckedChange(next === true)}
				/>
				<span className="flex min-w-0 flex-col gap-1">
					<span className="text-sm font-medium leading-5 text-foreground">
						{t("share.includeHtmlDependencies", { count: dependencyFileCount })}
					</span>
					<span className="text-xs leading-4 text-muted-foreground">
						{t("share.includeHtmlDependenciesDescription")}
					</span>
				</span>
			</label>
		)
	}

	if (analysisError) {
		return (
			<div
				role="alert"
				className="text-xs leading-4 text-destructive"
				data-testid="file-share-html-dependencies-error"
			>
				{t("share.htmlDependenciesAnalysisFailed")}
			</div>
		)
	}

	return null
}
