import { describe, expect, it, vi } from "vitest"
import { AGENT_MESSAGE_TYPES } from "../../types"
import { IframeAgentService, type IframeAgentConfig } from "../IframeAgentService"

function createService(overrides?: Partial<IframeAgentConfig>) {
	const postToIframe = vi.fn()
	const cfg: IframeAgentConfig = {
		postToIframe,
		getAgentList: vi.fn(() => []),
		createTopicAndSend: vi.fn(async () => ({ topicId: "topic-1" })),
		sendMessage: vi.fn(async () => undefined),
		enableWriteOperations: true,
		...overrides,
	}
	const service = new IframeAgentService(cfg)
	return { service, postToIframe, cfg }
}

describe("IframeAgentService", () => {
	it("rejects createTopicAndSend without permission and does not create topic", async () => {
		const authorizePermission = vi.fn().mockResolvedValue(false)
		const { service, postToIframe, cfg } = createService({ authorizePermission })

		await service.handleMessage(AGENT_MESSAGE_TYPES.CREATE_TOPIC_AND_SEND_REQUEST, {
			type: AGENT_MESSAGE_TYPES.CREATE_TOPIC_AND_SEND_REQUEST,
			requestId: "req-create-denied",
			message: "Analyze this",
			model: "auto",
		})

		expect(authorizePermission).toHaveBeenCalledWith("project.message.write")
		expect(cfg.createTopicAndSend).not.toHaveBeenCalled()
		expect(postToIframe).toHaveBeenCalledWith(
			expect.objectContaining({
				type: AGENT_MESSAGE_TYPES.CREATE_TOPIC_AND_SEND_RESPONSE,
				requestId: "req-create-denied",
				success: false,
			}),
		)
	})

	it("rejects sendMessage without permission and does not send", async () => {
		const authorizePermission = vi.fn().mockResolvedValue(false)
		const { service, postToIframe, cfg } = createService({ authorizePermission })

		await service.handleMessage(AGENT_MESSAGE_TYPES.SEND_MESSAGE_REQUEST, {
			type: AGENT_MESSAGE_TYPES.SEND_MESSAGE_REQUEST,
			requestId: "req-send-denied",
			message: "Continue",
			model: "auto",
		})

		expect(authorizePermission).toHaveBeenCalledWith("project.message.write")
		expect(cfg.sendMessage).not.toHaveBeenCalled()
		expect(postToIframe).toHaveBeenCalledWith(
			expect.objectContaining({
				type: AGENT_MESSAGE_TYPES.SEND_MESSAGE_RESPONSE,
				requestId: "req-send-denied",
				success: false,
			}),
		)
	})
})
