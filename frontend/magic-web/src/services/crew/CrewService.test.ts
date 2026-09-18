import { beforeEach, describe, expect, it, vi } from "vitest"
import { CrewApi } from "@/apis"
import { CrewService } from "./CrewService"

const trackMock = vi.hoisted(() => vi.fn())
const markPendingMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock("@/services/analytics", () => ({
	track: trackMock,
	markPendingEntityCreation: markPendingMock,
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

describe("CrewService.agent_created analytics", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("reports agent_id from the create response", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "agent-9",
			code: "SMA-9",
		})
		const service = new CrewService()

		await service.createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never)

		expect(trackMock).toHaveBeenCalledTimes(1)
		expect(trackMock).toHaveBeenCalledWith("agent_created", { agent_id: "agent-9" })
		expect(markPendingMock).toHaveBeenCalledWith({ scene: "crew", resourceCode: "SMA-9" })
	})

	it("persists the pending entity marker after creation", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "agent-pending",
			code: "SMA-pending",
		})
		await new CrewService().createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never)

		expect(markPendingMock).toHaveBeenCalledWith({
			scene: "crew",
			resourceCode: "SMA-pending",
		})
	})

	it("createDefaultAgent reports once through createAgent", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "agent-default",
			code: "SMA-default",
		})
		const service = new CrewService()

		await service.createDefaultAgent()

		expect(trackMock).toHaveBeenCalledTimes(1)
		expect(trackMock).toHaveBeenCalledWith("agent_created", { agent_id: "agent-default" })
	})

	it("does not report when the create response has no id", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "",
			code: "SMA-empty",
		})
		const service = new CrewService()

		await service.createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never)

		expect(trackMock).not.toHaveBeenCalled()
	})

	it("does not report when the create response id is blank", async () => {
		vi.mocked(CrewApi.createAgent).mockResolvedValue({
			id: "   ",
			code: "SMA-blank",
		})
		const service = new CrewService()

		await service.createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never)

		expect(trackMock).not.toHaveBeenCalled()
	})

	it("does not report when createAgent fails", async () => {
		vi.mocked(CrewApi.createAgent).mockRejectedValue(new Error("create-failed"))
		const service = new CrewService()

		await expect(
			service.createAgent({ name_i18n: { zh_CN: "", en_US: "" } } as never),
		).rejects.toThrow("create-failed")
		expect(trackMock).not.toHaveBeenCalled()
	})
})
