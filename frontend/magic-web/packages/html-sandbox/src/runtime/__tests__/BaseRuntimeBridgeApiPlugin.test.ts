import { afterEach, describe, expect, it, vi } from "vitest"
import { BaseRuntimeBridgeApiPlugin } from "../api/BaseRuntimeBridgeApiPlugin"
import { runtimeLoggerHub, type RuntimeLogRecord } from "../RuntimeLogger"

class TestBridgeApi extends BaseRuntimeBridgeApiPlugin {
	constructor() {
		super("TestBridgeApi")
	}

	install(): void {
		// Test helper does not install a window API.
	}

	query(): Promise<{ rows: number[] }> {
		return this.request("MAGIC_TEST_QUERY_REQUEST", {}, 1_000)
	}
}

describe("BaseRuntimeBridgeApiPlugin", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("includes the extracted response in the success runtime log", async () => {
		const records: RuntimeLogRecord[] = []
		const unsubscribe = runtimeLoggerHub.subscribe((record) => records.push(record))
		const response = { rows: [1, 2, 3] }

		vi.spyOn(window.parent, "postMessage").mockImplementation((message) => {
			const request = message as { type: string; requestId: string }
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: request.type.replace(/_REQUEST$/, "_RESPONSE"),
						requestId: request.requestId,
						success: true,
						content: response,
					},
				}),
			)
		})

		await expect(new TestBridgeApi().query()).resolves.toEqual(response)
		unsubscribe()

		expect(records.at(-1)).toMatchObject({
			source: "TestBridgeApi",
			event: "request:success",
			details: { result: response },
		})
	})
})
