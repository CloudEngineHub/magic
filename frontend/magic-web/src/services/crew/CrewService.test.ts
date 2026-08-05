import { beforeEach, describe, expect, it, vi } from "vitest"
import { CrewApi } from "@/apis"
import { CrewService } from "./CrewService"

vi.mock("@/apis", () => ({
	CrewApi: {
		checkAgentAccess: vi.fn(),
	},
}))

describe("CrewService.checkAgentAccess", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("maps an access-check response", async () => {
		vi.mocked(CrewApi.checkAgentAccess).mockResolvedValue({
			code: "SMA-access-mock",
			exists: true,
			can_use: false,
		})
		const service = new CrewService()

		await expect(service.checkAgentAccess("SMA-request-mock")).resolves.toEqual({
			code: "SMA-access-mock",
			exists: true,
			canUse: false,
		})
	})
})
