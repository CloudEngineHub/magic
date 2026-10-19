import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Boxes, ChevronDown, Folder } from "lucide-react"
import {
	buildModelPriceGroups,
	calculateModelPrice,
	supportsPriceCalculation,
	formatPreviewDecimal,
	type ModelPriceRow,
	type PreviewPrice,
} from "../../../../../model-billing-reference"
import type { ModelPricePreviewState } from "../../../../../model-billing-reference/use-model-price-preview"
import { MagicAvatar } from "@admin-components"
import { useDefaultModelPriceStyles } from "./DefaultModelPriceTable.styles"
/** 复用本管理端头像和失败兜底，旧接口缺少图标时仍可正常展示。 */
function PricePreviewLogo({
	src,
	name,
	group = false,
}: {
	src?: string | null
	name: string
	group?: boolean
}) {
	return (
		<MagicAvatar src={src ?? undefined} size={28}>
			{group ? <Folder size={16} /> : <Boxes size={16} />}
		</MagicAvatar>
	)
}

/** 按已选统一分组表展示真实售价，仅展示层格式化，不改计算与配置提交。 */
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
	const groups = useMemo(
		() =>
			snapshot
				? buildModelPriceGroups(snapshot).filter((group) => group.rows.length > 0)
				: [],
		[snapshot],
	)
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
					{title}: {formatPreviewDecimal(price.effective_unit_price)}
				</span>{" "}
				· {labels[price.source] ?? labels.invalid}
				{price.status === "missing_as_zero" && price.source !== "missing" ? (
					<span> · {labels.missing}</span>
				) : null}
				{price.status === "invalid" ? <span> · {labels.invalid}</span> : null}
				{price.source === "tiered" && price.rule_prices.length > 0 ? (
					<p>
						{t("modelPricePreview.rules")}: (
						{price.rule_prices
							.map((value) => formatPreviewDecimal(value))
							.join(" + ") || "—"}
						) ÷ {price.rule_prices.length} ={" "}
						{formatPreviewDecimal(price.effective_unit_price)}
					</p>
				) : null}
			</div>
		)
	}
	/** 父项仅控制候选展开，普通模型的公式独立默认折叠。 */
	function renderRow(row: ModelPriceRow): ReactNode {
		const model = row.model
		const dynamic = model.kind === "dynamic"
		const open = preview.expanded.get(row.key) ?? dynamic
		const result =
			model.kind === "normal" ? calculateModelPrice(model, base, rate, supported) : null
		const status =
			result && result.status !== "available"
				? labels[result.status]
				: model.kind === "unavailable"
					? labels[model.reason === "missing" ? "missingReason" : model.reason]
					: dynamic && model.state !== "available"
						? labels[model.state]
						: null
		const disclosure = dynamic ? t("modelPricePreview.dynamic") : t("modelPricePreview.details")
		return (
			<div key={row.key} className={classes.node}>
				<div className={classes.row}>
					<div
						className={classes.name}
						style={{ paddingLeft: Math.min(row.depth, 8) * 20 }}
					>
						<PricePreviewLogo src={model.icon} name={row.name} />
						<div className={classes.text}>
							<strong>{row.name}</strong>
							{dynamic ? (
								<span className={classes.badge}>
									{t("modelPricePreview.dynamic")}
								</span>
							) : null}
							{row.name !== model.model_id ? (
								<p className={classes.identifier} title={model.model_id}>
									{model.model_id}
								</p>
							) : null}
							{status ? <p className={classes.muted}>{status}</p> : null}
							{row.blocked ? (
								<p className={classes.muted} role="status">
									{t("modelPricePreview.blocked")}
								</p>
							) : null}
						</div>
					</div>
					<div className={classes.prices}>
						{model.kind === "normal"
							? model.bindings.map((binding, index) => (
									<div key={`${index}:${binding.binding_id}`}>
										<div
											className={classes.priceLine}
											title={`${t("modelPricePreview.input")}: ${formatPreviewDecimal(binding.input.effective_unit_price)} / ${t("modelPricePreview.output")}: ${formatPreviewDecimal(binding.output.effective_unit_price)}`}
										>
											<span>
												<span className={classes.mobile}>
													{t("modelPricePreview.input")}:{" "}
												</span>
												{formatPreviewDecimal(
													binding.input.effective_unit_price,
													6,
												)}{" "}
												·{" "}
												<span className={classes.mobile}>
													{t("modelPricePreview.output")}:{" "}
												</span>
												{formatPreviewDecimal(
													binding.output.effective_unit_price,
													6,
												)}
											</span>
											<span className={classes.muted}>
												{binding.currency ?? "—"}
											</span>
										</div>
										<p
											className={classes.identifier}
											title={binding.provider_name}
										>
											{binding.provider_name}
										</p>
									</div>
								))
							: "—"}
					</div>
					<div className={classes.amount} title={result?.amount ?? undefined}>
						<span className={classes.mobile}>{t("modelPricePreview.amount")}: </span>
						{formatPreviewDecimal(result?.amount, 6)}
					</div>
					<output className={classes.ratio}>
						<span className={classes.mobile}>{t("modelPricePreview.ratio")}: </span>
						{result?.multiplier ?? "—"}
					</output>
					{dynamic || model.kind === "normal" ? (
						<button
							type="button"
							className={classes.button}
							aria-label={`${row.name}: ${disclosure}`}
							title={disclosure}
							aria-expanded={open}
							onClick={() => preview.toggle(row.key, dynamic)}
						>
							<ChevronDown
								size={16}
								className={classes.arrow}
								style={{ transform: open ? "rotate(180deg)" : undefined }}
								aria-hidden="true"
							/>
						</button>
					) : (
						<span />
					)}
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
											(
											{formatPreviewDecimal(
												binding.input.effective_unit_price,
											)}{" "}
											× 10,000 +{" "}
											{formatPreviewDecimal(
												binding.output.effective_unit_price,
											)}{" "}
											× 1,000) ÷ 1,000,000 = {formatPreviewDecimal(amount)}{" "}
											{binding.currency}
										</p>
										{binding.currency === "USD" ? (
											<p>
												{formatPreviewDecimal(amount)} ×{" "}
												{formatPreviewDecimal(rate)} ={" "}
												{formatPreviewDecimal(cny)} CNY
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
										.map((item) => formatPreviewDecimal(item.cny))
										.join(" + ") || "—"}
									) ÷ {result.bindings.filter((item) => item.cny !== null).length}{" "}
									= {formatPreviewDecimal(result.amount)} CNY
								</p>
								<p>
									{t("modelPricePreview.division")}:{" "}
									{formatPreviewDecimal(result.amount)} ÷{" "}
									{formatPreviewDecimal(base)} = {result.multiplier ?? "—"}
								</p>
							</>
						) : null}

						{status ? <p role="status">{status}</p> : null}
					</div>
				) : null}
				{dynamic && open ? (
					<div className={classes.children}>
						{row.children.map(renderRow)}
						{!row.children.length && !row.blocked ? (
							<p className={classes.formula}>{t("modelPricePreview.noChildren")}</p>
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
			{snapshot ? (
				<p className={classes.muted}>
					{t("modelPricePreview.snapshot", {
						time: snapshot.generated_at.replace("T", " ").slice(0, 16),
					})}
				</p>
			) : null}
			{!enabled ? (
				<p className={classes.muted}>{t("modelPricePreview.disabledHint")}</p>
			) : null}
			{preview.loading ? (
				<p role="status">{t("modelPricePreview.loading")}</p>
			) : preview.error ? (
				<div role="alert">
					{t("modelPricePreview.error")}{" "}
					<button type="button" onClick={preview.retry}>
						{t("modelPricePreview.retry")}
					</button>
				</div>
			) : snapshot ? (
				<>
					{!supported ? <p role="alert">{t("modelPricePreview.unsupported")}</p> : null}
					{snapshot.warnings.length || groups.some((group) => hasBlocked(group.rows)) ? (
						<p role="status" className={classes.muted}>
							{t("modelPricePreview.warning")}
						</p>
					) : null}
					{!groups.length ? (
						<p>{t("modelPricePreview.empty")}</p>
					) : (
						<div className={classes.table}>
							<div className={classes.header}>
								<span>{t("modelPricePreview.model")}</span>
								<div>
									{t("modelPricePreview.pricePair")}
									<p>{t("modelPricePreview.priceUnit")}</p>
								</div>
								<span className={classes.amount}>
									{t("modelPricePreview.amount")}
								</span>
								<span className={classes.amount}>
									{t("modelPricePreview.ratio")}
								</span>
								<span />
							</div>
							{groups.map((group) => (
								<div key={group.id} className={classes.group}>
									<h5 className={classes.groupHeading}>
										<PricePreviewLogo
											src={group.icon}
											name={group.name}
											group
										/>
										{group.name}
										<span className={classes.muted}>
											{t("modelPricePreview.modelsCount", {
												count: group.rows.length,
											})}
										</span>
									</h5>
									{group.rows.map(renderRow)}
								</div>
							))}
						</div>
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
