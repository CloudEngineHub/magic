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

	queryWithTransfer(transfer: Transferable[]): Promise<{ rows: number[] }> {
		return this.request("MAGIC_TEST_QUERY_REQUEST", {}, 1_000, undefined, transfer)
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

	it("forwards a transfer list when sending binary request payloads", async () => {
		const buffer = new ArrayBuffer(4)
		const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation((message) => {
			const request = message as { type: string; requestId: string }
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: request.type.replace(/_REQUEST$/, "_RESPONSE"),
						requestId: request.requestId,
						success: true,
						content: { rows: [1] },
					},
				}),
			)
		})

		await expect(new TestBridgeApi().queryWithTransfer([buffer])).resolves.toEqual({
			rows: [1],
		})
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ type: "MAGIC_TEST_QUERY_REQUEST" }),
			window.location.origin,
			[buffer],
		)
	})
})
