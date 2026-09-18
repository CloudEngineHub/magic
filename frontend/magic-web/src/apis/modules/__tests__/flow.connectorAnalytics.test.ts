import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ServiceHttpClient } from "@/infrastructure/network/http/clients"
import { generateFlowApi } from "../flow"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock("@/services/analytics", () => ({ track }))

describe("FlowApi.saveMcp connector_created analytics", () => {
	beforeEach(() => {
		track.mockReset()
	})

	it("tracks a successful connector creation exactly once with the server id", async () => {
		const post = vi.fn().mockResolvedValue({ id: "connector-server-id" })
		const api = generateFlowApi({ post } as unknown as ServiceHttpClient)

		await api.saveMcp({ name: "New connector", type: "external_http" })

		expect(track).toHaveBeenCalledTimes(1)
		expect(track).toHaveBeenCalledWith("connector_created", {
			connector_id: "connector-server-id",
			connector_type: "external_http",
		})
	})

	it("does not track edits of an existing connector", async () => {
		const post = vi.fn().mockResolvedValue({ id: "connector-existing" })
		const api = generateFlowApi({ post } as unknown as ServiceHttpClient)

		await api.saveMcp({
			id: "connector-existing",
			name: "Edited connector",
			type: "external_sse",
		})

		expect(track).not.toHaveBeenCalled()
	})

	it("does not track a failed creation", async () => {
		const post = vi.fn().mockRejectedValue(new Error("request failed"))
		const api = generateFlowApi({ post } as unknown as ServiceHttpClient)

		await expect(api.saveMcp({ type: "external_stdio" })).rejects.toThrow("request failed")
		expect(track).not.toHaveBeenCalled()
	})

	it("does not track when the successful response has no connector id", async () => {
		const post = vi.fn().mockResolvedValue({ id: "  " })
		const api = generateFlowApi({ post } as unknown as ServiceHttpClient)

		await api.saveMcp({ type: "sse" })

		expect(track).not.toHaveBeenCalled()
	})
})
