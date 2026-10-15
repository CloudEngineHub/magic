import { Flex, Form } from "antd"
import type { FormInstance } from "antd"
import type { ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import { MagicInput, MagicSwitch, SubHeader } from "@admin-components"

/** 维护旧版配置表单的样式体系，显示说明并原样保存展示配置。 */
export default function ModelMultiplierSettings({
	form,
	disabled,
}: {
	form: FormInstance
	disabled: boolean
}) {
	const { t } = useTranslation("admin/platform/info")
	/** 启用时要求完整配置；关闭时可以清空金额，但不接受非法的已填数值。 */
	async function validateAmount(_rule: unknown, value: string | null | undefined) {
		const enabled = form.getFieldValue(["model_billing_multiplier", "enabled"])
		if (!enabled && (value === null || value === undefined || value === "")) return
		if (!value || !/^\d{1,12}(?:\.\d{1,12})?$/.test(value) || Number(value) <= 0)
			throw new Error(t("multiplier.invalidAmount"))
	}
	return (
		<>
			<SubHeader title={t("multiplier.title")} />
			<Flex vertical gap={16}>
				<p>{t("multiplier.explanation")}</p>
				<p>{t("multiplier.formula")}</p>
				<Form.Item
					label={t("multiplier.enabled")}
					name={["model_billing_multiplier", "enabled"]}
					valuePropName="checked"
				>
					<MagicSwitch disabled={disabled} aria-label={t("multiplier.enabled")} />
				</Form.Item>
				<Form.Item
					label={t("multiplier.basePrice")}
					name={["model_billing_multiplier", "base_price_cny"]}
					dependencies={[["model_billing_multiplier", "enabled"]]}
					rules={[{ validator: validateAmount }]}
					getValueProps={(value) => ({ value: value ?? "" })}
					getValueFromEvent={(event: ChangeEvent<HTMLInputElement>) =>
						event.target.value || null
					}
				>
					<MagicInput
						inputMode="decimal"
						disabled={disabled}
						placeholder={t("multiplier.basePlaceholder")}
					/>
				</Form.Item>
				<Form.Item
					label={t("multiplier.exchangeRate")}
					name={["model_billing_multiplier", "usd_to_cny_rate"]}
					dependencies={[["model_billing_multiplier", "enabled"]]}
					rules={[{ validator: validateAmount }]}
					getValueProps={(value) => ({ value: value ?? "" })}
					getValueFromEvent={(event: ChangeEvent<HTMLInputElement>) =>
						event.target.value || null
					}
				>
					<MagicInput
						inputMode="decimal"
						disabled={disabled}
						placeholder={t("multiplier.ratePlaceholder")}
					/>
				</Form.Item>
			</Flex>
		</>
	)
}
