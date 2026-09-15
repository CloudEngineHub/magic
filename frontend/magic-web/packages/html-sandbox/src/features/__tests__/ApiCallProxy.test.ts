import { describe, expect, it, vi } from "vitest"
import { RuntimeLoggerHub } from "../../runtime/RuntimeLogger"
import { ApiCallProxy } from "../ApiCallProxy"

describe("ApiCallProxy", () => {
	it("captures a successful API response separately from request details", () => {
		const hub = new RuntimeLoggerHub()
		const proxy = new ApiCallProxy(hub)
		const listener = vi.fn()
		proxy.onEntry(listener)
		proxy.enable()

		const logger = hub.createLogger("MagicDatabaseApi")
		logger.info("request:start", {
			type: "MAGIC_DB_QUERY_ROWS_REQUEST",
			requestId: "request-1",
			timeout: 30_000,
		})
		logger.info("request:success", {
			type: "MAGIC_DB_QUERY_ROWS_REQUEST",
			requestId: "request-1",
			result: { rows: [{ id: 1, name: "First row" }], total: 1 },
		})

		const [entry] = proxy.getEntries()
		expect(entry.status).toBe("success")
		expect(entry.details).toEqual({
			type: "MAGIC_DB_QUERY_ROWS_REQUEST",
			requestId: "request-1",
			timeout: 30_000,
		})
		expect(entry.result).toEqual({ rows: [{ id: 1, name: "First row" }], total: 1 })
		expect(entry.resultTruncated).toBeUndefined()
		expect(listener).toHaveBeenCalledTimes(2)
	})

	it("bounds large and circular responses before forwarding them", () => {
		const hub = new RuntimeLoggerHub()
		const proxy = new ApiCallProxy(hub)
		proxy.enable()

		const circular: Record<string, unknown> = {
			rows: Array.from({ length: 150 }, (_, index) => ({ id: index })),
		}
		circular.self = circular

		const logger = hub.createLogger("MagicDatabaseApi")
		logger.info("request:success", {
			type: "MAGIC_DB_QUERY_ROWS_REQUEST",
			requestId: "request-2",
			result: circular,
		})

		const [entry] = proxy.getEntries()
		const result = entry.result as { rows: unknown[]; self: string }
		expect(entry.resultTruncated).toBe(true)
		expect(result.rows).toHaveLength(101)
		expect(result.rows[100]).toBe("[Truncated: 50 more items]")
		expect(result.self).toBe("[Circular]")
	})

	it("keeps the API record usable when a response cannot be serialized", () => {
		const hub = new RuntimeLoggerHub()
		const proxy = new ApiCallProxy(hub)
		proxy.enable()

		hub.createLogger("MagicTestApi").info("request:success", {
			requestId: "request-3",
			result: new Date("invalid"),
		})

		const [entry] = proxy.getEntries()
		expect(entry.status).toBe("success")
		expect(entry.result).toMatch(/^\[Unserializable:/)
		expect(entry.resultTruncated).toBe(true)
	})
})
