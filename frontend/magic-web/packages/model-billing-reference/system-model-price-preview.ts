/** 默认文本模型售价快照，仅包含后台接口允许展示的售价字段。 */
export interface ModelPriceSnapshot {
	snapshot_id: string
	generated_at: string
	scope: "default_text_models"
	mode: { id: string; name: string } | null
	calculation: {
		version: string
		input_tokens: number
		output_tokens: number
		price_unit: string
		decimal_scale: number
		tier_aggregation: string
		provider_aggregation: string
	}
	groups: {
		id: string
		name: string
		icon?: string | null
		items: { relation_id: string; model_id: string; display_name: string }[]
	}[]
	models: Record<string, PreviewModel>
	warnings: { code: string; model_id: string | null }[]
}
/** 单个输入或输出售价的解析结果，缺价与非法价格严格区分。 */
export interface PreviewPrice {
	status: "priced" | "missing_as_zero" | "invalid"
	effective_unit_price: string | null
	source: "legacy" | "fixed" | "tiered" | "missing"
	rule_prices: string[]
}
/** 一个服务商绑定的真实售价及参与资格。 */
export interface PreviewBinding {
	binding_id: string
	provider_name: string
	currency: "CNY" | "USD" | null
	eligible: boolean
	exclusion_reason: string | null
	input: PreviewPrice
	output: PreviewPrice
}
/** 动态模型只描述候选关系，不参与父项价格聚合。 */
export type PreviewModel =
	| {
			kind: "normal"
			model_id: string
			name: string
			icon?: string | null
			state: "available" | "disabled" | "no_valid_price"
			bindings: PreviewBinding[]
	  }
	| {
			kind: "dynamic"
			model_id: string
			name: string
			icon?: string | null
			state: "available" | "disabled" | "invalid_config"
			children: { index: number; model_id: string }[]
	  }
	| {
			kind: "unavailable"
			model_id: string
			name: string
			icon?: string | null
			reason: "missing" | "unsupported_type" | "not_loaded"
	  }
/** 公式和结果共用同一次计算，避免详情与表格数值不一致。 */
export interface ModelPriceResult {
	status:
		| "available"
		| "no_valid_price"
		| "invalid_rate"
		| "invalid_base"
		| "unsupported"
		| "disabled"
	amount: string | null
	multiplier: string | null
	ratio: string | null
	bindings: { binding: PreviewBinding; amount: string | null; cny: string | null }[]
}
const ZERO = BigInt(0)
const SCALE = BigInt(10) ** BigInt(36)
/** 读取非负十进制，限制长度以避免异常响应耗尽计算资源。 */
function units(value: string | null): bigint | null {
	if (typeof value !== "string" || !/^\d{1,64}(?:\.\d{1,36})?$/.test(value)) return null
	const [integer, fraction = ""] = value.split(".")
	return BigInt(integer + fraction.padEnd(36, "0"))
}
/** 输出精确十进制，不把极小正数格式化成零。 */
function decimal(value: bigint): string {
	const digits = value.toString().padStart(37, "0")
	const fraction = digits.slice(-36).replace(/0+$/, "")
	return digits.slice(0, -36) + (fraction ? `.${fraction}` : "")
}
/** 校验整份算法协议，未知版本或固定用量变化时拒绝静默误算。 */
export function supportsPriceCalculation(snapshot: ModelPriceSnapshot): boolean {
	const c = snapshot.calculation
	return (
		snapshot.scope === "default_text_models" &&
		c.version === "text-reference-v1" &&
		c.input_tokens === 10000 &&
		c.output_tokens === 1000 &&
		c.price_unit === "per_million_tokens" &&
		c.decimal_scale === 36 &&
		c.tier_aggregation === "equal_average" &&
		c.provider_aggregation === "equal_average"
	)
}
/** 按后端 BC 数学顺序逐步截断三十六位，再仅在倍率展示边界转换浮点数。 */
export function calculateModelPrice(
	model: Extract<PreviewModel, { kind: "normal" }>,
	base: string | null,
	rate: string | null,
	supported = true,
): ModelPriceResult {
	const result: ModelPriceResult = {
		status: "no_valid_price",
		amount: null,
		multiplier: null,
		ratio: null,
		bindings: [],
	}
	if (!supported) return { ...result, status: "unsupported" }
	if (model.state === "disabled")
		return {
			...result,
			status: "disabled",
			bindings: model.bindings.map((binding) => ({ binding, amount: null, cny: null })),
		}
	const exchange = units(rate)
	let sum = ZERO
	let count = 0
	let invalidRate = false
	for (const binding of model.bindings) {
		const input =
			binding.input.status === "missing_as_zero"
				? ZERO
				: binding.input.status === "priced"
					? units(binding.input.effective_unit_price)
					: null
		const output =
			binding.output.status === "missing_as_zero"
				? ZERO
				: binding.output.status === "priced"
					? units(binding.output.effective_unit_price)
					: null
		let amount: bigint | null = null
		let cny: bigint | null = null
		if (
			binding.eligible &&
			input !== null &&
			output !== null &&
			(binding.currency === "CNY" || binding.currency === "USD")
		) {
			amount = input / BigInt(100) + output / BigInt(1000)
			if (binding.currency === "CNY") cny = amount
			else if (exchange !== null && exchange > ZERO) cny = (amount * exchange) / SCALE
			else invalidRate = true
			if (cny !== null) {
				sum += cny
				count += 1
			}
		}
		result.bindings.push({
			binding,
			amount: amount === null ? null : decimal(amount),
			cny: cny === null ? null : decimal(cny),
		})
	}
	if (invalidRate) return { ...result, status: "invalid_rate" }
	if (count === 0) return result
	const average = sum / BigInt(count)
	result.amount = decimal(average)
	const denominator = units(base)
	if (denominator === null || denominator <= ZERO) return { ...result, status: "invalid_base" }
	const ratio = (average * SCALE) / denominator
	result.ratio = decimal(ratio)
	const display = Number(result.ratio)
	result.multiplier = Number.isFinite(display)
		? ratio > ZERO && ratio < SCALE / BigInt(100)
			? "<0.01x"
			: `${display.toFixed(2)}x`
		: null
	return { ...result, status: "available" }
}
/** 关系与完整候选路径共同标识一行，跨组或共享模型不共用展开状态。 */
export interface ModelPriceRow {
	key: string
	name: string
	model: PreviewModel
	depth: number
	children: ModelPriceRow[]
	blocked: boolean
}
/** 按当前路径检测环并限制展示总量，保留缺失项和重复候选的位置。 */
export function buildModelPriceGroups(snapshot: ModelPriceSnapshot) {
	let remaining = 5000
	/** 递归仅沿当前路径去重，共享节点仍可在不同分组展示。 */
	function visit(
		id: string,
		name: string,
		path: string[],
		ancestors: Set<string>,
		depth: number,
	): ModelPriceRow {
		const model: PreviewModel = snapshot.models[id] ?? {
			kind: "unavailable",
			model_id: id,
			name,
			reason: "missing",
		}
		const blocked = ancestors.has(id) || depth >= 32 || remaining-- <= 0
		const row: ModelPriceRow = {
			key: JSON.stringify(path),
			name: name || model.name || id,
			model,
			depth,
			children: [],
			blocked,
		}
		if (!blocked && model.kind === "dynamic") {
			const next = new Set(ancestors).add(id)
			for (const [position, child] of model.children.entries()) {
				if (remaining <= 0) break
				row.children.push(
					visit(
						child.model_id,
						snapshot.models[child.model_id]?.name ?? child.model_id,
						[...path, `${position}:${child.index}:${child.model_id}`],
						next,
						depth + 1,
					),
				)
			}
			if (row.children.length < model.children.length) row.blocked = true
		}
		return row
	}
	return snapshot.groups.map((group, groupIndex) => ({
		...group,
		rows: group.items.map((item, index) =>
			visit(
				item.model_id,
				item.display_name,
				[`${groupIndex}:${group.id}`, `${index}:${item.relation_id}:${item.model_id}`],
				new Set(),
				0,
			),
		),
	}))
}

/** 仅格式化展示，不改写价格或参与计算；极小正数用上界提示而非显示为零。 */
export function formatPreviewDecimal(value: string | null | undefined, precision?: number): string {
	if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return "—"
	const [rawInteger, rawFraction = ""] = value.split(".")
	const integer = rawInteger.replace(/^0+(?=\d)/, "")
	const fraction = rawFraction.replace(/0+$/, "")
	if (
		precision === undefined ||
		!Number.isInteger(precision) ||
		precision < 1 ||
		precision > 36 ||
		fraction.length <= precision
	)
		return integer + (fraction ? `.${fraction}` : "")
	const digits = integer + fraction.slice(0, precision)
	if (BigInt(digits) === BigInt(0)) return `<0.${"0".repeat(precision - 1)}1`
	const rounded = (BigInt(digits) + (Number(fraction[precision]) >= 5 ? BigInt(1) : BigInt(0)))
		.toString()
		.padStart(precision + 1, "0")
	const tail = rounded.slice(-precision).replace(/0+$/, "")
	return rounded.slice(0, -precision) + (tail ? `.${tail}` : "")
}
