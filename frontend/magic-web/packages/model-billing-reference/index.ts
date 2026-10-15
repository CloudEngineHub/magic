/** 两个管理端共用的配置契约；默认值和最终参考金额由后端提供。 */
export interface ModelBillingMultiplierSettings {
	enabled: boolean
	base_price_cny: string | null
	input_price_cny?: string | null
	output_price_cny?: string | null
	usd_to_cny_rate: string | null
}

const DECIMAL_SCALE = 12
// 使用构造函数兼容既有构建目标，运行环境至少为支持 BigInt 的 Chrome 100。
const ZERO = BigInt(0)
const TWO = BigInt(2)
const TEN = BigInt(10)
const HUNDRED = BigInt(100)

/** 按接口精度读取非负单价，不把空值、非法值当作零。 */
function readDecimal(value: string | null | undefined): bigint | null {
	if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,12})?$/.test(value)) return null
	const [integer, fraction = ""] = value.split(".")
	return BigInt(integer + fraction.padEnd(DECIMAL_SCALE, "0"))
}

/** 将定点金额还原为文本，预览不通过浮点数改写提交值。 */
function decimalText(value: bigint, scale: number): string {
	const digits = value.toString().padStart(scale + 1, "0")
	const fraction = digits.slice(-scale).replace(/0+$/, "")
	return digits.slice(0, -scale) + (fraction ? `.${fraction}` : "")
}

/** 固定输入一万、输出一千 token，结果使用十五位定点精度。 */
function referenceUnits(input: string | null | undefined, output: string | null | undefined) {
	const inputUnits = readDecimal(input)
	const outputUnits = readDecimal(output)
	return inputUnits === null || outputUnits === null ? null : inputUnits * TEN + outputUnits
}

/** 仅用于草稿预览；缺少任一单价时不反推历史金额或填充业务默认值。 */
export function previewReferenceAmount(value: ModelBillingMultiplierSettings): string | null {
	const amount = referenceUnits(value.input_price_cny, value.output_price_cny)
	return amount !== null && amount > ZERO ? decimalText(amount, 15) : null
}

/** 读取后端参考金额或编辑中的完整单价，两个模式分别遵循各自的数据来源。 */
export function getReferenceAmount(value: ModelBillingMultiplierSettings, editing: boolean) {
	const hasPrices = value.input_price_cny != null || value.output_price_cny != null
	return editing && hasPrices ? previewReferenceAmount(value) : value.base_price_cny
}

/** 配置错误对应实际输入字段，历史仅存金额的配置允许继续保存。 */
export function validateMultiplierSettings(value: ModelBillingMultiplierSettings) {
	const fields: ("input_price_cny" | "output_price_cny" | "usd_to_cny_rate")[] = []
	const hasPrices = value.input_price_cny != null || value.output_price_cny != null
	if (hasPrices || (value.enabled && !((readDecimal(value.base_price_cny) ?? ZERO) > ZERO))) {
		if (readDecimal(value.input_price_cny) === null) fields.push("input_price_cny")
		if (readDecimal(value.output_price_cny) === null) fields.push("output_price_cny")
		if (referenceUnits(value.input_price_cny, value.output_price_cny) === ZERO)
			fields.push("output_price_cny")
	}
	const rate = readDecimal(value.usd_to_cny_rate)
	if ((value.enabled || value.usd_to_cny_rate != null) && (rate === null || rate === ZERO))
		fields.push("usd_to_cny_rate")
	return fields
}

/** 静态价格快照供管理员比较，不读取或修改平台实际供应商配置。 */
export interface ReferenceModelPrice {
	id: string
	name: string
	input: string
	output: string
	source: string
	basis: "fixed" | "tiers" | "peak" | "internationalTiers"
}

/** 价格于 2026-10-15 从各官方页面核对；阶梯等权均价与时段优惠分开处理。 */
export const referenceModelPrices: readonly ReferenceModelPrice[] = [
	{
		id: "claude",
		name: "Claude Sonnet 5.5",
		input: "2",
		output: "10",
		source: "https://www.anthropic.com/claude-sonnet-5-5",
		basis: "fixed",
	},
	{
		id: "gpt",
		name: "GPT-5.4",
		input: "3.75",
		output: "18.75",
		source: "https://developers.openai.com/api/docs/models/gpt-5.4",
		basis: "tiers",
	},
	{
		id: "gemini",
		name: "Gemini 3.1 Pro Preview",
		input: "3",
		output: "15",
		source: "https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-pro-preview",
		basis: "tiers",
	},
	{
		id: "deepseek",
		name: "DeepSeek V4.1 Flash",
		input: "0.30",
		output: "1.20",
		source: "https://api-docs.deepseek.com/quick_start/pricing/",
		basis: "peak",
	},
	{
		id: "qwen",
		name: "Qwen3.6-Plus",
		input: "1.25",
		output: "4.50",
		source: "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
		basis: "internationalTiers",
	},
]

/** 美元快照按展示汇率换算人民币；缺少汇率或有效基准时隐藏对应结果。 */
export function previewModelPrice(
	model: ReferenceModelPrice,
	rate: string | null,
	base: string | null,
) {
	const rateUnits = readDecimal(rate)
	const usdUnits = referenceUnits(model.input, model.output)
	if (rateUnits === null || rateUnits === ZERO || usdUnits === null)
		return { amount: null, multiplier: null }
	const cnyUnits = usdUnits * rateUnits
	const baseValid = typeof base === "string" && /^\d{1,15}(?:\.\d{1,27})?$/.test(base)
	const [baseInteger, baseFraction = ""] = baseValid ? base.split(".") : ["0"]
	const denominator = BigInt(baseInteger + baseFraction.padEnd(27, "0"))
	let multiplier: string | null = null
	if (denominator > ZERO) {
		if (cnyUnits > ZERO && cnyUnits * HUNDRED < denominator) multiplier = "<0.01x"
		else {
			const cents = (cnyUnits * HUNDRED + denominator / TWO) / denominator
			multiplier = `${cents / HUNDRED}.${(cents % HUNDRED).toString().padStart(2, "0")}x`
		}
	}
	return { amount: decimalText(cnyUnits, 27), multiplier }
}
