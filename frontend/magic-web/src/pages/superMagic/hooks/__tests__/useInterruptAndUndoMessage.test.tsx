import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useInterruptAndUndoMessage } from "../useInterruptAndUndoMessage"

const mockState = vi.hoisted(() => ({
	pubsubHandlers: new Map<string, (...args: unknown[]) => unknown>(),
	undoMessageMock: vi.fn(),
	setHiddenRevokedOptimisticMessageIdsMock: vi.fn(),
	setActiveRevokedAnchorMock: vi.fn(),
	getOptimisticStatusMock: vi.fn(),
	getMessageNodeMock: vi.fn(() => ({ status: "finished" })),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/hooks/useSendInterruptMessage", () => ({
	useSendInterruptMessage: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		undoMessage: mockState.undoMessageMock,
	},
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: mockState.getMessageNodeMock,
	},
}))

vi.mock("@/pages/superMagic/stores/optimisticMessageStore", () => ({
	optimisticMessageStore: {
		getStatus: mockState.getOptimisticStatusMock,
		setHiddenRevokedOptimisticMessageIds: mockState.setHiddenRevokedOptimisticMessageIdsMock,
		setActiveRevokedAnchor: mockState.setActiveRevokedAnchorMock,
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { success: vi.fn() },
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn((event: string, callback: (...args: unknown[]) => unknown) => {
			mockState.pubsubHandlers.set(event, callback)
		}),
		unsubscribe: vi.fn((event: string, callback?: (...args: unknown[]) => unknown) => {
			if (!callback || mockState.pubsubHandlers.get(event) === callback) {
				mockState.pubsubHandlers.delete(event)
			}
		}),
		publish: vi.fn(),
	},
	PubSubEvents: {
		Interrupt_And_Undo_Message: "Interrupt_And_Undo_Message",
		Send_Interrupt_Message: "Send_Interrupt_Message",
		Show_Revoked_Messages: "Show_Revoked_Messages",
		Refresh_Topic_Messages: "Refresh_Topic_Messages",
	},
}))

const selectedTopic = {
	id: "topic-id",
	chat_topic_id: "chat-topic-id",
	topic_name: "Topic",
} as Topic

describe("useInterruptAndUndoMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockState.pubsubHandlers.clear()
		mockState.undoMessageMock.mockResolvedValue(undefined)
		mockState.getOptimisticStatusMock.mockReturnValue(undefined)
		mockState.getMessageNodeMock.mockReturnValue({ status: "finished" })
	})

	it("[REV-12] undo 成功后必须记录被选中 User 的撤回锚点。", async () => {
		const messages = [
			{ app_message_id: "a-user", seq_id: "100", role: "user" },
			{ app_message_id: "a-assistant", seq_id: "101", role: "assistant" },
			{ app_message_id: "b-user", seq_id: "200", role: "user" },
			{ app_message_id: "b-assistant", seq_id: "201", role: "assistant" },
		]

		renderHook(() =>
			useInterruptAndUndoMessage({
				selectedTopic,
				messages,
				userInfo: { user_id: "user-id" },
			}),
		)

		const handleUndo = mockState.pubsubHandlers.get("Interrupt_And_Undo_Message")
		expect(handleUndo).toBeDefined()

		await act(async () => {
			await handleUndo?.("topic-id", "200")
		})

		expect(mockState.undoMessageMock).toHaveBeenCalledWith({
			topic_id: "topic-id",
			message_id: "200",
		})
		expect(mockState.setActiveRevokedAnchorMock).toHaveBeenCalledWith({
			chat_topic_id: "chat-topic-id",
			seq_id: "200",
		})
	})
})
