import { useTranslation } from "react-i18next"
import { IconChevronDown, IconCopy } from "@tabler/icons-react"
import MagicIcon from "@/components/base/MagicIcon"
import magicToast from "@/components/base/MagicToaster/utils"
import { clipboard } from "@/utils/clipboard-helpers"
import type { FileInfoField } from "../types"
import { translateValue } from "../helpers"
import FieldList from "./FieldList"

function TechnicalSection({ fields }: { fields: FileInfoField[] }) {
	const { t } = useTranslation("super")
	if (fields.length === 0) return null

	const handleCopyTechnicalInfo = async () => {
		const content = fields
			.map((field) => `${t(field.labelKey)}: ${translateValue(t, field.value)}`)
			.join("\n")
		try {
			await clipboard.writeText(content)
			magicToast.success(t("topicFiles.fileInfo.copySuccess"))
		} catch {
			magicToast.error(t("topicFiles.fileInfo.copyFailed"))
		}
	}

	return (
		<section className="relative border-t border-border px-5 py-4">
			<button
				type="button"
				className="absolute right-5 top-3 flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
				onClick={handleCopyTechnicalInfo}
				aria-label={t("topicFiles.fileInfo.copyTechnicalInfo")}
				title={t("topicFiles.fileInfo.copyTechnicalInfo")}
			>
				<MagicIcon component={IconCopy} size={14} stroke={2} />
			</button>
			<details className="group">
				<summary className="flex cursor-pointer list-none items-center gap-1 pr-8 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
					<span>{t("topicFiles.fileInfo.sections.technical")}</span>
					<MagicIcon
						component={IconChevronDown}
						size={13}
						stroke={1.8}
						className="shrink-0 -rotate-90 text-muted-foreground/80 transition-transform group-open:rotate-0"
					/>
				</summary>
				<div className="mt-3">
					<FieldList fields={fields} />
				</div>
			</details>
		</section>
	)
}

export default TechnicalSection
