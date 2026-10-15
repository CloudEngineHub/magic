import { useTranslation } from "react-i18next"
import { previewModelPrice, referenceModelPrices } from "../../../../../model-billing-reference"

/** 右侧金额为只读结果，明确区分编辑预览与后端已保存数据。 */
export function MultiplierReferencePreview({
	amount,
	editing,
}: {
	amount: string | null
	editing: boolean
}) {
	const { t } = useTranslation()
	return (
		<aside
			className="min-w-0 rounded-md bg-muted/30 p-5"
			aria-label={t("platformInfo.multiplier.referenceAmount")}
		>
			<p className="text-xs text-muted-foreground">
				{editing
					? t("platformInfo.multiplier.livePreview")
					: t("platformInfo.multiplier.savedResult")}
			</p>
			<h4 className="mt-2 text-sm font-medium">
				{t("platformInfo.multiplier.referenceAmount")}
			</h4>
			<div className="mt-2 flex flex-wrap items-baseline gap-2">
				<output
					data-testid="multiplier-reference-amount"
					className="break-all text-2xl font-semibold tabular-nums"
					aria-live="polite"
				>
					{amount ?? t("common.emptyValue")}
				</output>
				<span className="text-xs text-muted-foreground">
					{t("platformInfo.multiplier.cny")}
				</span>
			</div>
			<div className="mt-5 space-y-2 border-t pt-4">
				<h4 className="text-sm font-medium">
					{t("platformInfo.multiplier.referenceTitle")}
				</h4>
				<div className="flex flex-wrap justify-between gap-2 text-sm">
					<span>{t("platformInfo.multiplier.inputUsage")}</span>
					<span>10,000 token</span>
				</div>
				<div className="flex flex-wrap justify-between gap-2 text-sm">
					<span>{t("platformInfo.multiplier.outputUsage")}</span>
					<span>1,000 token</span>
				</div>
				<p className="text-xs text-muted-foreground">
					{t("platformInfo.multiplier.noCache")}
				</p>
			</div>
			<p className="mt-4 border-t pt-4 text-sm leading-6 text-muted-foreground">
				{t("platformInfo.multiplier.shortFormula")}
			</p>
			{editing ? (
				<p className="mt-3 text-xs leading-5 text-muted-foreground">
					{t("platformInfo.multiplier.previewHint")}
				</p>
			) : null}
		</aside>
	)
}

/** 官方价格快照只演示倍率变化，与平台实际价格和模型权限隔离。 */
export function MultiplierReferenceExamples({
	base,
	rate,
}: {
	base: string | null
	rate: string | null
}) {
	const { t } = useTranslation()
	const basis = {
		fixed: t("platformInfo.multiplier.basisFixed"),
		tiers: t("platformInfo.multiplier.basisTiers"),
		peak: t("platformInfo.multiplier.basisPeak"),
		internationalTiers: t("platformInfo.multiplier.basisInternational"),
	}
	return (
		<section
			className="space-y-4 border-t pt-6"
			aria-label={t("platformInfo.multiplier.examplesTitle")}
		>
			<div>
				<h4 className="text-sm font-medium">
					{t("platformInfo.multiplier.examplesTitle")}
				</h4>
				<p className="mt-1 text-sm leading-6 text-muted-foreground">
					{t("platformInfo.multiplier.examplesHint")}
				</p>
			</div>
			{/* 桌面保持四列可对照，小屏每个模型折成两行，避免横向溢出。 */}
			<div className="divide-y">
				<div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_1fr_0.8fr] gap-4 pb-3 text-xs text-muted-foreground sm:grid">
					<span>{t("platformInfo.multiplier.modelColumn")}</span>
					<span>{t("platformInfo.multiplier.priceColumn")}</span>
					<span className="text-right">{t("platformInfo.multiplier.amountColumn")}</span>
					<span className="text-right">{t("platformInfo.multiplier.ratioColumn")}</span>
				</div>
				{referenceModelPrices.map((model) => {
					const result = previewModelPrice(model, rate, base)
					return (
						<div
							key={model.id}
							data-testid={`multiplier-example-${model.id}`}
							className="grid grid-cols-2 items-center gap-3 py-4 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_1fr_0.8fr] sm:gap-4"
						>
							<div className="min-w-0">
								<p className="break-words font-medium">{model.name}</p>
								<a
									href={model.source}
									target="_blank"
									rel="noreferrer"
									className="mt-1 inline-block text-xs leading-5 text-muted-foreground underline underline-offset-4"
								>
									{basis[model.basis]}
								</a>
							</div>
							<div className="text-right text-xs tabular-nums sm:text-left">
								<p>
									{t("platformInfo.multiplier.exampleInput", {
										price: model.input,
									})}
								</p>
								<p className="mt-1">
									{t("platformInfo.multiplier.exampleOutput", {
										price: model.output,
									})}
								</p>
							</div>
							<div className="break-all tabular-nums sm:text-right">
								<span className="mr-1 text-xs text-muted-foreground sm:hidden">
									{t("platformInfo.multiplier.amountColumn")}
								</span>
								{result.amount ?? t("common.emptyValue")}
							</div>
							<output
								className="text-right font-medium tabular-nums"
								data-testid={`multiplier-example-ratio-${model.id}`}
							>
								{result.multiplier ?? t("common.emptyValue")}
							</output>
						</div>
					)
				})}
			</div>
			<p className="text-xs leading-5 text-muted-foreground">
				{t("platformInfo.multiplier.snapshotHint")}
			</p>
			<p className="text-xs leading-5 text-muted-foreground">
				{t("platformInfo.multiplier.tierSources")}
			</p>
		</section>
	)
}

/** 规则始终展开，预览和编辑使用同一份说明。 */
export function MultiplierReferenceRules() {
	const { t } = useTranslation()
	const rules = [
		[
			t("platformInfo.multiplier.usageRuleTitle"),
			t("platformInfo.multiplier.usageRuleDescription"),
		],
		[
			t("platformInfo.multiplier.averageRuleTitle"),
			t("platformInfo.multiplier.calculationSteps"),
		],
		[
			t("platformInfo.multiplier.missingPriceTitle"),
			t("platformInfo.multiplier.missingPriceDescription"),
		],
		[
			t("platformInfo.multiplier.priceScopeTitle"),
			t("platformInfo.multiplier.priceScopeDescription"),
		],
		[
			t("platformInfo.multiplier.dynamicModelTitle"),
			t("platformInfo.multiplier.dynamicModelDescription"),
		],
		[
			t("platformInfo.multiplier.refreshTitle"),
			t("platformInfo.multiplier.refreshDescription"),
		],
	]
	return (
		<section
			className="border-t pt-6"
			data-testid="model-multiplier-explanation"
			aria-label={t("platformInfo.multiplier.rulesTitle")}
		>
			<h4 className="text-sm font-medium">{t("platformInfo.multiplier.rulesTitle")}</h4>
			<dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
				{rules.map(([title, description]) => (
					<div key={title}>
						<dt className="text-sm font-medium">{title}</dt>
						<dd className="mt-1 text-sm leading-6 text-muted-foreground">
							{description}
						</dd>
					</div>
				))}
			</dl>
		</section>
	)
}
