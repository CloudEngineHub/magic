import { Flex, Form } from "antd"
import type { FormInstance } from "antd"
import type { ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import { MagicInput, MagicSwitch, SubHeader } from "@admin-components"
import {
	getReferenceAmount,
	previewModelPrice,
	referenceModelPrices,
	validateMultiplierSettings,
} from "../../../../../model-billing-reference"
import type { ModelBillingMultiplierSettings } from "../../../../../model-billing-reference"
import { useModelMultiplierStyles } from "./ModelMultiplierSettings.styles"

/** 保留旧版表单和权限行为，共享精确预览与配置校验，不计算实际收费。 */
export default function ModelMultiplierSettings({
	form,
	disabled,
}: {
	form: FormInstance
	disabled: boolean
}) {
	const { t } = useTranslation("admin/platform/info")
	const { styles } = useModelMultiplierStyles()
	// 监听该配置组，编辑和刷新时同步预览，不给接口缺失项补默认价格。
	const value = Form.useWatch(["model_billing_multiplier"], { form, preserve: true }) as
		ModelBillingMultiplierSettings | undefined
	const reference = value ? getReferenceAmount(value, !disabled) : null
	const fields = [
		{
			field: "input_price_cny",
			label: t("multiplier.inputPrice"),
			unit: t("multiplier.inputPriceUnit"),
			placeholder: t("multiplier.inputPlaceholder"),
		},
		{
			field: "output_price_cny",
			label: t("multiplier.outputPrice"),
			unit: t("multiplier.outputPriceUnit"),
			placeholder: t("multiplier.outputPlaceholder"),
		},
		{
			field: "usd_to_cny_rate",
			label: t("multiplier.exchangeRateLabel"),
			unit: t("multiplier.exchangeRateUnit"),
			placeholder: t("multiplier.ratePlaceholder"),
		},
	] as const
	const basis = {
		fixed: t("multiplier.basisFixed"),
		tiers: t("multiplier.basisTiers"),
		peak: t("multiplier.basisPeak"),
		internationalTiers: t("multiplier.basisInternational"),
	}
	const rules = [
		[t("multiplier.usageRuleTitle"), t("multiplier.usageRuleDescription")],
		[t("multiplier.averageRuleTitle"), t("multiplier.calculationSteps")],
		[t("multiplier.missingPriceTitle"), t("multiplier.missingPriceDescription")],
		[t("multiplier.priceScopeTitle"), t("multiplier.priceScopeDescription")],
		[t("multiplier.dynamicModelTitle"), t("multiplier.dynamicModelDescription")],
		[t("multiplier.refreshTitle"), t("multiplier.refreshDescription")],
	]
	return (
		<div className={styles.root}>
			<SubHeader title={t("multiplier.title")} />
			<Form.Item
				label={t("multiplier.enabled")}
				name={["model_billing_multiplier", "enabled"]}
				valuePropName="checked"
				extra={t("multiplier.enabledHint")}
			>
				<MagicSwitch disabled={disabled} aria-label={t("multiplier.enabled")} />
			</Form.Item>
			{/* 保留接口返回的旧金额用于兼容保存，不由输入框联动覆盖。 */}
			<Form.Item
				name={["model_billing_multiplier", "base_price_cny"]}
				hidden
				getValueProps={(amount) => ({ value: amount ?? "" })}
			>
				<MagicInput />
			</Form.Item>
			<div className={styles.layout}>
				<div>
					<h4>{t("multiplier.benchmarkTitle")}</h4>
					<p className={styles.muted}>{t("multiplier.benchmarkHint")}</p>
					{fields.map(({ field, label, unit, placeholder }) => (
						<Form.Item
							key={field}
							label={label}
							name={["model_billing_multiplier", field]}
							extra={unit}
							dependencies={[
								["model_billing_multiplier", "enabled"],
								["model_billing_multiplier", "input_price_cny"],
								["model_billing_multiplier", "output_price_cny"],
							]}
							rules={[
								{
									async validator() {
										const config = form.getFieldValue([
											"model_billing_multiplier",
										]) as ModelBillingMultiplierSettings
										if (
											config &&
											validateMultiplierSettings(config).includes(field)
										)
											throw new Error(
												t(
													field === "usd_to_cny_rate"
														? "multiplier.invalidAmount"
														: "multiplier.invalidPrices",
												),
											)
									},
								},
							]}
							getValueProps={(amount) => ({ value: amount ?? "" })}
							getValueFromEvent={(event: ChangeEvent<HTMLInputElement>) =>
								event.target.value || null
							}
						>
							<MagicInput
								aria-label={label}
								inputMode="decimal"
								disabled={disabled}
								placeholder={placeholder}
							/>
						</Form.Item>
					))}
					{value?.base_price_cny != null &&
					value.input_price_cny == null &&
					value.output_price_cny == null ? (
						<p className={styles.muted}>{t("multiplier.legacyHint")}</p>
					) : null}
				</div>
				<aside className={styles.preview} aria-label={t("multiplier.referenceAmount")}>
					<p className={styles.muted}>
						{disabled ? t("multiplier.savedResult") : t("multiplier.livePreview")}
					</p>
					<h4>{t("multiplier.referenceAmount")}</h4>
					<div className={styles.row}>
						<output
							data-testid="legacy-multiplier-reference-amount"
							className={styles.amount}
							aria-live="polite"
						>
							{reference ?? "—"}
						</output>
						<span className={styles.muted}>{t("multiplier.cny")}</span>
					</div>
					<div className={styles.section}>
						<h4>{t("multiplier.referenceTitle")}</h4>
						<p>{t("multiplier.inputUsage")} 10,000 token</p>
						<p>{t("multiplier.outputUsage")} 1,000 token</p>
						<p className={styles.muted}>{t("multiplier.noCache")}</p>
					</div>
					<p className={styles.muted}>{t("multiplier.shortFormula")}</p>
					<p className={styles.muted}>{t("multiplier.previewHint")}</p>
				</aside>
			</div>
			<section className={styles.section} aria-label={t("multiplier.examplesTitle")}>
				<h4>{t("multiplier.examplesTitle")}</h4>
				<p className={styles.muted}>{t("multiplier.examplesHint")}</p>
				{referenceModelPrices.map((model) => {
					const result = previewModelPrice(
						model,
						value?.usd_to_cny_rate ?? null,
						reference,
					)
					return (
						<div key={model.id} className={styles.example}>
							<div>
								<strong>{model.name}</strong>
								<br />
								<a href={model.source} target="_blank" rel="noreferrer">
									{basis[model.basis]}
								</a>
							</div>
							<div className={styles.muted}>
								<p>{t("multiplier.exampleInput", { price: model.input })}</p>
								<p>{t("multiplier.exampleOutput", { price: model.output })}</p>
							</div>
							<div>
								<span className={styles.muted}>{t("multiplier.amountColumn")}</span>
								<br />
								{result.amount ?? "—"}
							</div>
							<output data-testid={`legacy-example-ratio-${model.id}`}>
								{result.multiplier ?? "—"}
							</output>
						</div>
					)
				})}
				<Flex vertical gap={8} className={styles.muted}>
					<p>{t("multiplier.snapshotHint")}</p>
					<p>{t("multiplier.tierSources")}</p>
				</Flex>
			</section>
			<section className={styles.section} aria-label={t("multiplier.rulesTitle")}>
				<h4>{t("multiplier.rulesTitle")}</h4>
				<dl className={styles.rules}>
					{rules.map(([title, description]) => (
						<div key={title}>
							<dt>{title}</dt>
							<dd className={styles.muted}>{description}</dd>
						</div>
					))}
				</dl>
			</section>
		</div>
	)
}
