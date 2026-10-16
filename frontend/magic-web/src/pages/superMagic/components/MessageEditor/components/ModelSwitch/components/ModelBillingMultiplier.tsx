import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"

/** 只展示明确下发的非负有限倍率；零倍率有效，缺失值不显示占位数字。 */
export function ModelBillingMultiplier({
	value,
	className,
}: {
	value?: number | null
	className?: string
}) {
	const { t } = useTranslation("super")
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
	const display = value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2)
	return (
		<span
			className={cn(
				"shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground",
				className,
			)}
			aria-label={t("messageEditor.modelSwitch.billingMultiplierValue", { value: display })}
		>
			{display}x
		</span>
	)
}
