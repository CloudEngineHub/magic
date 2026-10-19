import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	buildModelPriceGroups,
	formatPreviewDecimal,
	calculateModelPrice,
	supportsPriceCalculation,
} from "../../../../model-billing-reference"
import { mockBinding, mockModel, mockSnapshot } from "../../fixtures/model-price-preview"

describe("系统模型售价预览", () => {
	it("按人民币金额平均混合币种，符合后端合成金样例", () => {
		const normal = calculateModelPrice(mockModel(), "0.015", "7")
		assert.equal(normal.amount, "0.03")
		assert.equal(normal.multiplier, "2.00x")
		const mixed = mockModel([mockBinding("3", "15"), mockBinding("0.4", "2", "USD")])
		assert.equal(calculateModelPrice(mixed, "0.015", "7").amount, "0.0435")
		assert.equal(calculateModelPrice(mixed, "0.015", "7").multiplier, "2.90x")
		assert.equal(
			calculateModelPrice(mockModel([mockBinding("2", "6", "USD")]), "0.015", "7").multiplier,
			"12.13x",
		)
		assert.equal(calculateModelPrice(mixed, "0.015", null).status, "invalid_rate")
		assert.equal(calculateModelPrice(mixed, "0.015", "0").amount, null)
	})
	it("部分缺价为零，非法价格剔除整个绑定，明确零价有效", () => {
		const missing = mockBinding()
		missing.input = {
			status: "missing_as_zero",
			effective_unit_price: "0",
			source: "missing",
			rule_prices: [],
		}
		assert.equal(calculateModelPrice(mockModel([missing]), "0.01", null).amount, "0.01")
		const invalid = mockBinding()
		invalid.input.status = "invalid"
		assert.equal(calculateModelPrice(mockModel([invalid]), "1", "7").status, "no_valid_price")
		assert.equal(
			calculateModelPrice(mockModel([mockBinding("0", "0")]), "1", null).multiplier,
			"0.00x",
		)
		invalid.eligible = false
		invalid.exclusion_reason = "provider_disabled"
		assert.equal(
			calculateModelPrice(mockModel([invalid, missing]), "0.01", "7").multiplier,
			"1.00x",
		)
		assert.equal(
			calculateModelPrice({ ...mockModel(), state: "disabled" }, "1", "7").status,
			"disabled",
		)
	})
	it("逐步截断36位、保留极小正数和27位基准，展示遵循 Number.toFixed", () => {
		const tier = mockBinding("0.333333333333333333333333333333333333", "0")
		tier.input.source = "tiered"
		tier.input.rule_prices = ["0", "1", "0"]
		assert.equal(
			calculateModelPrice(mockModel([tier]), "1", "7").amount,
			"0.003333333333333333333333333333333333",
		)
		assert.equal(
			calculateModelPrice(
				mockModel([mockBinding("0", "0.000000000001", "USD")]),
				"0.000000000000000000000000001",
				"0.000000000001",
			).multiplier,
			"1.00x",
		)
		const tiny = calculateModelPrice(mockModel([mockBinding("0", "0.000000000001")]), "1", null)
		assert.equal(tiny.amount, "0.000000000000001")
		assert.equal(tiny.multiplier, "<0.01x")
		assert.equal(
			calculateModelPrice(mockModel([mockBinding("100.5", "0")]), "1", null).multiplier,
			(1.005).toFixed(2) + "x",
		)
		assert.equal(calculateModelPrice(mockModel(), "0", "7").status, "invalid_base")
		assert.ok(
			calculateModelPrice(
				mockModel([mockBinding("999999999999", "0")]),
				"0.000000000000000000000000001",
				"7",
			).multiplier,
		)
	})
	it("拒绝未知协议，缺失模型保留位置，动态父项不计算且共享节点独立展开", () => {
		const snapshot = mockSnapshot()
		assert.equal(supportsPriceCalculation(snapshot), true)
		snapshot.calculation.version = "future"
		assert.equal(supportsPriceCalculation(snapshot), false)
		assert.equal(calculateModelPrice(mockModel(), "1", "7", false).status, "unsupported")
		snapshot.models.dynamic = {
			kind: "dynamic",
			model_id: "dynamic",
			name: "Mock dynamic",
			state: "available",
			children: [
				{ index: 0, model_id: "mock-model" },
				{ index: 1, model_id: "dynamic" },
				{ index: 2, model_id: "missing" },
			],
		}
		snapshot.groups[0].items.push({
			relation_id: "dynamic-relation",
			model_id: "dynamic",
			display_name: "Mock dynamic",
		})
		const rows = buildModelPriceGroups(snapshot)[0].rows
		assert.equal(rows[1].children[1].blocked, true)
		assert.equal(rows[1].children[2].model.kind, "unavailable")
		assert.notEqual(rows[0].key, rows[1].children[0].key)
		assert.equal(rows[1].model.kind, "dynamic")
	})
	it("缺省配置和空组保留顺序，深度保护不误伤重复候选", () => {
		const snapshot = mockSnapshot()
		snapshot.mode = null
		snapshot.groups = []
		assert.deepEqual(buildModelPriceGroups(snapshot), [])
		snapshot.groups = [{ id: "empty", name: "Empty", items: [] }]
		assert.equal(buildModelPriceGroups(snapshot)[0].rows.length, 0)
		for (let i = 0; i < 40; i++)
			snapshot.models[String(i)] = {
				kind: "dynamic",
				model_id: String(i),
				name: String(i),
				state: "available",
				children: [{ index: 0, model_id: String(i + 1) }],
			}
		snapshot.groups[0].items.push({ relation_id: "chain", model_id: "0", display_name: "0" })
		let row = buildModelPriceGroups(snapshot)[0].rows[0]
		while (row.children.length) row = row.children[0]
		assert.equal(row.depth, 32)
		assert.equal(row.blocked, true)
	})
})

/** 格式化不损失试算数据，主表限制展示长度，详情仍可核对全部有效位。 */
it("trims padded decimals without mutating prices or hiding tiny positives", () => {
	assert.equal(formatPreviewDecimal("0.750000000000000000000000000000000000"), "0.75")
	assert.equal(formatPreviewDecimal("0002.000000000000"), "2")
	assert.equal(formatPreviewDecimal("0.0761362875", 6), "0.076136")
	assert.equal(formatPreviewDecimal("9.9999999", 6), "10")
	assert.equal(formatPreviewDecimal("0.000000000000000000000000000000000001", 6), "<0.000001")
	assert.equal(formatPreviewDecimal("0.0000000", 6), "0")
	assert.equal(formatPreviewDecimal(null), "—")
	assert.equal(formatPreviewDecimal("1.2500", 0), "1.25")
})
