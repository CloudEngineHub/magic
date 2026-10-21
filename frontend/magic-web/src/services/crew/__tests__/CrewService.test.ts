import { beforeEach, describe, expect, it, vi } from "vitest"
import { CrewApi } from "@/apis"
import { CrewService } from "../CrewService"

const trackMock = vi.hoisted(() => vi.fn())

vi.mock("@/services/analytics", () => ({
	analyticsService: { report: trackMock },
}))

vi.mock("@/apis", () => ({
	CrewApi: {
		checkAgentAccess: vi.fn(),
		createAgent: vi.fn(),
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

describe("CrewService creation-attempt analytics", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("reports the agent and backing project/topic attempts before creation", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "agent-9",
			code: "SMA-9",
		})
		const service = new CrewService()

		await service.createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never)

		expect(trackMock).toHaveBeenNthCalledWith(1, "agent_create_attempted")
		expect(trackMock).toHaveBeenNthCalledWith(2, "project_create_attempted", {
			sceneOverride: "crew",
		})
	})

	it("createDefaultAgent uses the same attempt path", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "agent-default",
			code: "SMA-default",
		})
		const service = new CrewService()

		await service.createDefaultAgent()

		expect(trackMock).toHaveBeenCalledWith("agent_create_attempted")
	})

	it("keeps the attempt when createAgent fails", async () => {
		vi.mocked(CrewApi.createAgent).mockRejectedValue(new Error("create-failed"))
		const service = new CrewService()

		await expect(
			service.createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never),
		).rejects.toThrow("create-failed")
		expect(trackMock).toHaveBeenCalledWith("agent_create_attempted")
	})
})
