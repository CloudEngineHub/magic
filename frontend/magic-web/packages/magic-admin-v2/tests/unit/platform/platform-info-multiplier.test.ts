import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	createDefaultPlatformInfoDetails,
	createEmptyPlatformInfoFormState,
	toChangedPlatformInfoParams,
	toPlatformInfoFormState,
} from "@magic-admin-v2/features/platform-info/api"
import { createPlatformInfoSchema } from "@magic-admin-v2/features/platform-info/utils"

/** 接口配置全部为模拟值，表单不参与任何价格或倍率计算。 */
describe("模型参考倍率配置", () => {
	it("直接回显后端金额，并且只提交已修改的配置组", () => {
		const config = {
			enabled: true,
			base_price_cny: "0.123456789012",
			usd_to_cny_rate: "7.123456789012",
		}
		const values = toPlatformInfoFormState({
			...createDefaultPlatformInfoDetails(),
			model_billing_multiplier: config,
		})
		assert.deepEqual(values.model_billing_multiplier, config)
		assert.deepEqual(
			toChangedPlatformInfoParams(values, { model_billing_multiplier: { enabled: true } }),
			{ model_billing_multiplier: config },
		)
		assert.equal(
			"model_billing_multiplier" in
				toChangedPlatformInfoParams(values, { global_system_prompt: true }),
			false,
		)
	})
	it("关闭允许未填写，启用必须同时具有正数基准价和汇率", () => {
		const schema = createPlatformInfoSchema((key) => key, "modelMultiplier")
		const values = createEmptyPlatformInfoFormState()
		assert.equal(schema.safeParse(values).success, true)
		for (const amount of [null, "", "0", "-1", "NaN", "Infinity", "1e3", "0.0000000000001"]) {
			assert.equal(
				schema.safeParse({
					...values,
					model_billing_multiplier: {
						enabled: true,
						base_price_cny: amount,
						usd_to_cny_rate: "7",
					},
				}).success,
				false,
			)
		}
		assert.equal(
			schema.safeParse({
				...values,
				model_billing_multiplier: {
					enabled: true,
					base_price_cny: "0.1",
					usd_to_cny_rate: null,
				},
			}).success,
			false,
		)
		assert.equal(
			schema.safeParse({
				...values,
				model_billing_multiplier: {
					enabled: true,
					base_price_cny: "0.1",
					usd_to_cny_rate: "7",
				},
			}).success,
			true,
		)
	})
})
