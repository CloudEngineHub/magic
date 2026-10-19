import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
	buildModelPriceGroups,
	calculateModelPrice,
	supportsPriceCalculation,
	type ModelPriceRow,
	type PreviewPrice,
} from "../../../../../model-billing-reference"
import type { ModelPricePreviewState } from "../../../../../model-billing-reference/use-model-price-preview"
import { useDefaultModelPriceStyles } from "./DefaultModelPriceTable.styles"

/** 展示分组与逐绑定公式，不参与平台配置提交。 */
export function DefaultModelPriceTable({
	preview,
	base,
	rate,
	enabled,
}: {
	preview: ModelPricePreviewState
	base: string | null
	rate: string | null
	enabled: boolean
}) {
	const { t } = useTranslation("admin/platform/info")
	const { styles: classes } = useDefaultModelPriceStyles()
	const snapshot = preview.data
	const supported = snapshot ? supportsPriceCalculation(snapshot) : true
	const groups = useMemo(() => (snapshot ? buildModelPriceGroups(snapshot) : []), [snapshot])
	const labels: Record<string, string> = {
		legacy: t("modelPricePreview.legacy"),
		fixed: t("modelPricePreview.fixed"),
		tiered: t("modelPricePreview.tiered"),
		missing: t("modelPricePreview.missing"),
		invalid: t("modelPricePreview.invalid"),
		available: t("modelPricePreview.available"),
		disabled: t("modelPricePreview.disabled"),
		no_valid_price: t("modelPricePreview.no_valid_price"),
		invalid_rate: t("modelPricePreview.invalid_rate"),
		invalid_base: t("modelPricePreview.invalid_base"),
		unsupported: t("modelPricePreview.unsupported"),
		unavailable: t("modelPricePreview.unavailable"),
		model_disabled: t("modelPricePreview.model_disabled"),
		provider_disabled: t("modelPricePreview.provider_disabled"),
		unsupported_billing: t("modelPricePreview.unsupported_billing"),
		unsupported_currency: t("modelPricePreview.unsupported_currency"),
		missing_config: t("modelPricePreview.missing_config"),
		invalid_price: t("modelPricePreview.invalid_price"),
		empty_rules: t("modelPricePreview.empty_rules"),
		missingReason: t("modelPricePreview.missingReason"),
		unsupported_type: t("modelPricePreview.unsupported_type"),
		not_loaded: t("modelPricePreview.not_loaded"),
		invalid_config: t("modelPricePreview.invalid_config"),
	}
	/** 单项来源仅解释接口售价，不从旧配置或市场价格推断。 */
	function priceDetails(price: PreviewPrice, title: string) {
		return (
			<div>
				<span>
					{title}: {price.effective_unit_price ?? "—"}
				</span>{" "}
				· {labels[price.source] ?? labels.invalid}
				{price.status === "missing_as_zero" && price.source !== "missing" ? (
					<span> · {labels.missing}</span>
				) : null}
				{price.status === "invalid" ? <span> · {labels.invalid}</span> : null}
				{price.source === "tiered" && price.rule_prices.length > 0 ? (
					<p>
						{t("modelPricePreview.rules")}: ({price.rule_prices.join(" + ") || "—"}) ÷{" "}
						{price.rule_prices.length} = {price.effective_unit_price ?? "—"}
					</p>
				) : null}
			</div>
		)
	}
	/** 动态项只有容器及候选关系，数值始终只属于普通模型。 */
	function renderRow(row: ModelPriceRow): ReactNode {
		const model = row.model
		const dynamic = model.kind === "dynamic"
		const open = preview.expanded.get(row.key) ?? dynamic
		const result =
			model.kind === "normal" ? calculateModelPrice(model, base, rate, supported) : null
		const unavailable =
			model.kind === "unavailable"
				? labels[model.reason === "missing" ? "missingReason" : model.reason]
				: null
		const status =
			result && result.status !== "available"
				? labels[result.status]
				: dynamic && model.state !== "available"
					? labels[model.state]
					: unavailable
		return (
			<div key={row.key} className={classes.node} style={{ marginLeft: row.depth ? 12 : 0 }}>
				<div className={classes.row}>
					<div className={classes.name}>
						<strong>{row.name}</strong>
						<p className={classes.muted}>
							{dynamic ? t("modelPricePreview.dynamic") : status}
						</p>
						{row.blocked ? <p role="status">{t("modelPricePreview.blocked")}</p> : null}
						{dynamic || model.kind === "normal" ? (
							<button
								type="button"
								className={classes.button}
								aria-expanded={open}
								onClick={() => preview.toggle(row.key, dynamic)}
							>
								{open ? "−" : "+"}{" "}
								{dynamic
									? t("modelPricePreview.dynamic")
									: t("modelPricePreview.details")}
							</button>
						) : null}
					</div>
					<div className={classes.prices}>
						{model.kind === "normal" ? (
							<>
								{model.bindings.length > 1 ? (
									<p className={classes.muted}>
										{t("modelPricePreview.bindings", {
											count: model.bindings.length,
										})}
									</p>
								) : null}
								{model.bindings.map((binding, index) => (
									<div key={`${index}:${binding.binding_id}`}>
										<span className={classes.muted}>
											{binding.provider_name} · {binding.currency ?? "—"}
										</span>
										<p>
											{t("modelPricePreview.input")}:{" "}
											{binding.input.effective_unit_price ?? "—"} /{" "}
											{t("modelPricePreview.output")}:{" "}
											{binding.output.effective_unit_price ?? "—"}
										</p>
									</div>
								))}
							</>
						) : (
							"—"
						)}
					</div>
					<div className={classes.amount}>
						<span className={classes.mobile}>{t("modelPricePreview.amount")}: </span>
						{result?.amount ?? "—"}
					</div>
					<output className={classes.ratio}>
						<span className={classes.mobile}>{t("modelPricePreview.ratio")}: </span>
						{result?.multiplier ?? "—"}
					</output>
				</div>
				{!dynamic && open && result ? (
					<div className={classes.formula}>
						<p className={classes.muted}>{t("modelPricePreview.reference")}</p>
						<p className={classes.muted}>{t("modelPricePreview.precision")}</p>
						{result.bindings.map(({ binding, amount, cny }, index) => (
							<div key={`${index}:${binding.binding_id}`} className={classes.binding}>
								<strong>
									{binding.provider_name} · {binding.currency ?? "—"}
								</strong>
								{priceDetails(binding.input, t("modelPricePreview.input"))}
								{priceDetails(binding.output, t("modelPricePreview.output"))}
								{!binding.eligible ? (
									<p>
										{t("modelPricePreview.excluded")}:{" "}
										{labels[binding.exclusion_reason ?? ""] ??
											t("modelPricePreview.unavailable")}
									</p>
								) : (
									<>
										<p>
											({binding.input.effective_unit_price ?? "—"} × 10,000 +{" "}
											{binding.output.effective_unit_price ?? "—"} × 1,000) ÷
											1,000,000 = {amount ?? "—"} {binding.currency}
										</p>
										{binding.currency === "USD" ? (
											<p>
												{amount ?? "—"} × {rate ?? "—"} = {cny ?? "—"} CNY
											</p>
										) : null}
									</>
								)}
							</div>
						))}
						{result.amount !== null ? (
							<>
								<p>
									{t("modelPricePreview.average", {
										count: result.bindings.filter((item) => item.cny !== null)
											.length,
									})}
									: (
									{result.bindings
										.filter((item) => item.cny !== null)
										.map((item) => item.cny)
										.join(" + ") || "—"}
									) ÷ {result.bindings.filter((item) => item.cny !== null).length}{" "}
									= {result.amount ?? "—"} CNY
								</p>
								<p>
									{t("modelPricePreview.division")}: {result.amount ?? "—"} ÷{" "}
									{base ?? "—"} = {result.multiplier ?? "—"}
								</p>
							</>
						) : null}

						{status ? <p role="status">{status}</p> : null}
					</div>
				) : null}
				{dynamic && open ? (
					<div>
						{row.children.map(renderRow)}
						{!row.children.length && !row.blocked ? (
							<p className={classes.muted}>{t("modelPricePreview.noChildren")}</p>
						) : null}
					</div>
				) : null}
			</div>
		)
	}
	return (
		<section className={classes.section} aria-label={t("modelPricePreview.title")}>
			<h4>{t("modelPricePreview.title")}</h4>
			<p className={classes.muted}>{t("modelPricePreview.hint")}</p>
			{!enabled ? (
				<p className={classes.muted}>{t("modelPricePreview.disabledHint")}</p>
			) : null}
			{preview.loading ? (
				<p role="status">{t("modelPricePreview.loading")}</p>
			) : preview.error ? (
				<div role="alert">
					{t("modelPricePreview.error")}{" "}
					<button type="button" className={classes.button} onClick={preview.retry}>
						{t("modelPricePreview.retry")}
					</button>
				</div>
			) : snapshot ? (
				<>
					<p className={classes.muted}>
						{snapshot.mode?.name} ·{" "}
						{t("modelPricePreview.snapshot", { time: snapshot.generated_at })}
					</p>
					{!supported ? <p role="alert">{t("modelPricePreview.unsupported")}</p> : null}
					{snapshot.warnings.length || groups.some((group) => hasBlocked(group.rows)) ? (
						<p role="status">{t("modelPricePreview.warning")}</p>
					) : null}
					{!groups.length ? (
						<p>{t("modelPricePreview.empty")}</p>
					) : (
						groups.map((group) => (
							<div key={group.id} className={classes.group}>
								<h5>{group.name}</h5>
								<div className={classes.header}>
									<span>{t("modelPricePreview.model")}</span>
									<span>{t("modelPricePreview.prices")}</span>
									<span>{t("modelPricePreview.amount")}</span>
									<span>{t("modelPricePreview.ratio")}</span>
								</div>
								{group.rows.length ? (
									group.rows.map(renderRow)
								) : (
									<p className={classes.muted}>{t("modelPricePreview.empty")}</p>
								)}
							</div>
						))
					)}
				</>
			) : null}
		</section>
	)
}
/** 汇总前端图保护提示，避免截断后静默隐藏候选。 */
function hasBlocked(rows: ModelPriceRow[]): boolean {
	return rows.some((row) => row.blocked || hasBlocked(row.children))
}
