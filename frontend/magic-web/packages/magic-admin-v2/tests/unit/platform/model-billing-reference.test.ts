import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	getReferenceAmount,
	previewModelPrice,
	previewReferenceAmount,
	validateMultiplierSettings,
} from "../../../../model-billing-reference"
import type {
	ModelBillingMultiplierSettings,
	ReferenceModelPrice,
} from "../../../../model-billing-reference"

/** 全部使用模拟单价，不查询真实模型或计费接口。 */
describe("管理端参考倍率预览", () => {
	const config: ModelBillingMultiplierSettings = {
		enabled: true,
		currency: "CNY" as const,
		base_price_cny: "0.8",
		input_price: "2",
		output_price: "3",
		usd_to_cny_rate: "5",
	}
	const model: ReferenceModelPrice = {
		id: "mock",
		name: "Mock model",
		input: "1",
		output: "2",
		source: "https://example.com/pricing",
		basis: "fixed",
	}
	it("编辑按单价预览，查看使用后端金额，且不改写提交配置", () => {
		const original = JSON.stringify(config)
		assert.equal(previewReferenceAmount(config), "0.023")
		assert.equal(getReferenceAmount(config, true), "0.023")
		assert.equal(getReferenceAmount(config, false), "0.8")
		assert.equal(JSON.stringify(config), original)
		assert.equal(
			getReferenceAmount(
				{ ...config, input_price: undefined, output_price: undefined },
				true,
			),
			"0.8",
		)
	})
	it("保持十二位单价精度，零值、缺项、非法输入不会伪造金额", () => {
		assert.equal(
			previewReferenceAmount({
				...config,
				input_price: "0",
				output_price: "0.000000000001",
			}),
			"0.000000000000001",
		)
		for (const input of [null, "", "-1", "1e3", "NaN", "Infinity", "0.0000000000001"]) {
			assert.equal(previewReferenceAmount({ ...config, input_price: input }), null)
		}
		assert.equal(
			previewReferenceAmount({ ...config, input_price: "0", output_price: "0" }),
			null,
		)
		assert.equal(getReferenceAmount({ ...config, input_price: null }, true), null)
	})
	it("倍率随基准和汇率变化，模型单价保持不变", () => {
		assert.deepEqual(previewModelPrice(model, "5", "0.03"), {
			amount: "0.06",
			multiplier: "2.00x",
		})
		assert.deepEqual(previewModelPrice(model, "5", "0.06"), {
			amount: "0.06",
			multiplier: "1.00x",
		})
		assert.deepEqual(previewModelPrice(model, "10", "0.06"), {
			amount: "0.12",
			multiplier: "2.00x",
		})
		assert.equal(previewModelPrice(model, "5", "20").multiplier, "<0.01x")
		assert.equal(previewModelPrice(model, "5", "0").multiplier, null)
		assert.deepEqual(previewModelPrice(model, null, "0.06"), { amount: null, multiplier: null })
		assert.deepEqual(previewModelPrice(model, "0", "0.06"), { amount: null, multiplier: null })
		assert.equal(previewModelPrice(model, "5", null).amount, "0.06")
		assert.equal(
			previewModelPrice({ ...model, input: "0", output: "0" }, "5", "1").multiplier,
			"0.00x",
		)
	})
	it("允许一项零价，不允许两项同时为零或只有一项单价", () => {
		assert.deepEqual(validateMultiplierSettings({ ...config, input_price: "0" }), [])
		assert.deepEqual(
			validateMultiplierSettings({ ...config, input_price: "0", output_price: "0" }),
			["output_price"],
		)
		assert.deepEqual(validateMultiplierSettings({ ...config, output_price: null }), [
			"output_price",
		])
		assert.deepEqual(validateMultiplierSettings({ ...config, usd_to_cny_rate: "0" }), [
			"usd_to_cny_rate",
		])
	})
	it("美元基准按汇率精确换算，切换币种不改写单价", () => {
		const usd = { ...config, currency: "USD" as const }
		assert.equal(previewReferenceAmount(usd), "0.115")
		assert.equal(usd.input_price, "2")
		assert.equal(previewReferenceAmount({ ...usd, usd_to_cny_rate: null }), null)
		assert.equal(
			previewReferenceAmount({
				...usd,
				input_price: "0",
				output_price: "0.000000000001",
				usd_to_cny_rate: "0.000000000001",
			}),
			"0.000000000000000000000000001",
		)
		const same = { ...model, input: "2", output: "3" }
		assert.equal(previewModelPrice(same, "5", previewReferenceAmount(usd)).multiplier, "1.00x")
		assert.equal(
			previewModelPrice(same, "7", previewReferenceAmount({ ...usd, usd_to_cny_rate: "7" }))
				.multiplier,
			"1.00x",
		)
		assert.deepEqual(validateMultiplierSettings({ ...config, currency: null }), ["currency"])
	})
})
