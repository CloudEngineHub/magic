/** 两个管理端共用的配置契约；默认值和最终参考金额由后端提供。 */
export interface ModelBillingMultiplierSettings {
	enabled: boolean
	base_price_cny: string | null
	currency?: "CNY" | "USD" | null
	input_price?: string | null
	output_price?: string | null
	input_price_cny?: string | null
	output_price_cny?: string | null
	usd_to_cny_rate: string | null
}

const DECIMAL_SCALE = 12
// 使用构造函数兼容既有构建目标，运行环境至少为支持 BigInt 的 Chrome 100。
const ZERO = BigInt(0)
const TEN = BigInt(10)

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
	const amount = referenceUnits(value.input_price, value.output_price)
	if (amount === null || amount <= ZERO) return null
	if (value.currency === "CNY") return decimalText(amount, 15)
	const rate = readDecimal(value.usd_to_cny_rate)
	return value.currency === "USD" && rate !== null && rate > ZERO
		? decimalText(amount * rate, 27)
		: null
}

/** 读取后端参考金额或编辑中的完整单价，两个模式分别遵循各自的数据来源。 */
export function getReferenceAmount(value: ModelBillingMultiplierSettings, editing: boolean) {
	const hasPrices = value.input_price != null || value.output_price != null
	return editing && hasPrices ? previewReferenceAmount(value) : value.base_price_cny
}

/** 配置错误对应实际输入字段，历史仅存金额的配置允许继续保存。 */
export function validateMultiplierSettings(value: ModelBillingMultiplierSettings) {
	const fields: ("input_price" | "output_price" | "usd_to_cny_rate" | "currency")[] = []
	const hasPrices = value.input_price != null || value.output_price != null
	if ((hasPrices || value.enabled) && value.currency !== "CNY" && value.currency !== "USD")
		fields.push("currency")
	if (
		hasPrices ||
		(value.enabled && !((readReferenceAmount(value.base_price_cny) ?? ZERO) > ZERO))
	) {
		if (readDecimal(value.input_price) === null) fields.push("input_price")
		if (readDecimal(value.output_price) === null) fields.push("output_price")
		if (referenceUnits(value.input_price, value.output_price) === ZERO)
			fields.push("output_price")
	}
	const rate = readDecimal(value.usd_to_cny_rate)
	if ((value.enabled || value.usd_to_cny_rate != null) && (rate === null || rate === ZERO))
		fields.push("usd_to_cny_rate")
	return fields
}

/** 参考金额含固定用量和换汇精度，统一转为二十七位定点数。 */
function readReferenceAmount(value: string | null): bigint | null {
	if (typeof value !== "string" || !/^\d{1,24}(?:\.\d{1,27})?$/.test(value)) return null
	const [integer, fraction = ""] = value.split(".")
	return BigInt(integer + fraction.padEnd(27, "0"))
}

export * from "./system-model-price-preview"
