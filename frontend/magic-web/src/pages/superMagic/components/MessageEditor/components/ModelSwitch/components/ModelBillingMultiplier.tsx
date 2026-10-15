import { useTranslation } from "react-i18next"

/** 只展示明确下发的非负有限倍率；零倍率有效，缺失值不显示占位数字。 */
export function ModelBillingMultiplier({ value }: { value?: number | null }) {
	const { t } = useTranslation("super")
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
	return (
		<span
			className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
			aria-label={t("messageEditor.modelSwitch.billingMultiplierValue", { value })}
		>
			{value}x
		</span>
	)
}
