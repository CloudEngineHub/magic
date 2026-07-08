import { useTranslation } from "react-i18next"
import { IconCopy } from "@tabler/icons-react"
import MagicEllipseWithTooltip from "@/components/base/MagicEllipseWithTooltip/MagicEllipseWithTooltip"
import MagicIcon from "@/components/base/MagicIcon"
import magicToast from "@/components/base/MagicToaster/utils"
import { clipboard } from "@/utils/clipboard-helpers"
import type { FileInfoField } from "../types"
import { translateValue } from "../helpers"

function FieldValue({ field }: { field: FileInfoField }) {
	const { t } = useTranslation("super")
	const value = translateValue(t, field.value)

	const handleCopy = async () => {
		if (!field.copyable || !value || value === "-") return
		try {
			await clipboard.writeText(value)
			magicToast.success(t("topicFiles.fileInfo.copySuccess"))
		} catch {
			magicToast.error(t("topicFiles.fileInfo.copyFailed"))
		}
	}

	return (
		<div className="flex min-w-0 items-center gap-1.5 text-right text-xs text-foreground">
			<MagicEllipseWithTooltip
				text={value}
				maxWidth="100%"
				className="min-w-0 flex-1 text-right text-xs text-foreground"
			/>
			{field.copyable && value !== "-" && (
				<button
					type="button"
					className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={handleCopy}
					aria-label={t("topicFiles.fileInfo.copy")}
				>
					<MagicIcon component={IconCopy} size={14} stroke={2} />
				</button>
			)}
		</div>
	)
}

function FieldList({ fields }: { fields: FileInfoField[] }) {
	const { t } = useTranslation("super")
	if (fields.length === 0) return null

	return (
		<div className="space-y-2">
			{fields.map((field) => (
				<div
					key={field.key}
					className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3"
				>
					<div className="text-xs text-muted-foreground">{t(field.labelKey)}</div>
					<FieldValue field={field} />
				</div>
			))}
		</div>
	)
}

export default FieldList
