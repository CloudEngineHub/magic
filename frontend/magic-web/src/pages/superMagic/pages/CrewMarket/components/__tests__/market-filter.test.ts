import { describe, expect, it } from "vitest"
import {
	ALL_MARKET_FILTER_ID,
	ORGANIZATION_MARKET_FILTER_ID,
	resolveActiveMarketFilterId,
	resolveMarketFilterParams,
} from "../market-filter"

describe("market filter mapping", () => {
	it("maps the combined view to the all chip and no market type", () => {
		expect(resolveActiveMarketFilterId(undefined, undefined)).toBe(ALL_MARKET_FILTER_ID)
		expect(resolveMarketFilterParams(ALL_MARKET_FILTER_ID)).toEqual({
			market_type: undefined,
			category_id: undefined,
		})
	})

	it("maps organization shared to the fixed organization chip", () => {
		expect(resolveActiveMarketFilterId("ORGANIZATION", undefined)).toBe(
			ORGANIZATION_MARKET_FILTER_ID,
		)
		expect(resolveMarketFilterParams(ORGANIZATION_MARKET_FILTER_ID)).toEqual({
			market_type: "ORGANIZATION",
			category_id: undefined,
		})
	})

	it("maps a category chip to the public market", () => {
		expect(resolveActiveMarketFilterId("MARKET", "cat-1")).toBe("cat-1")
		expect(resolveMarketFilterParams("cat-1")).toEqual({
			market_type: "MARKET",
			category_id: "cat-1",
		})
	})
})
