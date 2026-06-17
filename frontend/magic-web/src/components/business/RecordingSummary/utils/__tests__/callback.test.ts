import { beforeEach, describe, expect, it, vi } from "vitest"

import { onSummarizeSuccessDefaultCallback } from "../callback"

const { pushMock, waitingTipMock, recordErrorMock } = vi.hoisted(() => ({
	pushMock: vi.fn(),
	waitingTipMock: vi.fn(),
	recordErrorMock: vi.fn(),
}))

const { isAudioProjectModeMock } = vi.hoisted(() => ({
	isAudioProjectModeMock: vi.fn(),
}))

vi.mock("@/routes/history", () => ({
	history: {
		push: pushMock,
	},
}))

vi.mock("@/components/business/RecordingSummary/components/WaitingTipModal", () => ({
	__esModule: true,
	default: waitingTipMock,
}))

vi.mock("@/components/business/RecordingSummary/components/RecordErrorModal", () => ({
	__esModule: true,
	default: recordErrorMock,
}))

vi.mock("@/services/audioRecordings", () => ({
	isAudioProjectMode: isAudioProjectModeMock,
}))

describe("onSummarizeSuccessDefaultCallback", () => {
	beforeEach(() => {
		pushMock.mockReset()
		waitingTipMock.mockReset()
		recordErrorMock.mockReset()
		isAudioProjectModeMock.mockReset()
	})

	it("navigates to the new recordings detail route for audio projects", () => {
		isAudioProjectModeMock.mockReturnValue(true)

		onSummarizeSuccessDefaultCallback({
			success: true,
			task_key: "task-001",
			project_id: "project-mobile-001",
			chat_topic_id: "chat-topic-001",
			conversation_id: "conversation-001",
			topic_id: "topic-001",
			project_name: "Mobile imported project",
			workspace_name: "Workspace A",
			model_id: "model-001",
			workspace_id: "workspace-001",
			project_mode: "audio",
		})

		expect(pushMock).toHaveBeenCalledWith({
			name: "AudioRecordingDetail",
			params: { projectId: "project-mobile-001" },
			state: { projectName: "Mobile imported project" },
		})
		expect(waitingTipMock).not.toHaveBeenCalled()
	})

	it("keeps the legacy waiting-tip flow for non-audio projects", () => {
		isAudioProjectModeMock.mockReturnValue(false)

		onSummarizeSuccessDefaultCallback({
			success: true,
			task_key: "task-002",
			project_id: "project-legacy-001",
			chat_topic_id: "chat-topic-002",
			conversation_id: "conversation-002",
			topic_id: "topic-002",
			project_name: "Legacy project",
			workspace_name: "Workspace B",
			model_id: "model-002",
			workspace_id: "workspace-002",
			project_mode: "summary",
		})

		expect(waitingTipMock).toHaveBeenCalledWith({
			projectName: "Legacy project",
			workspaceName: "Workspace B",
		})
		expect(pushMock).not.toHaveBeenCalled()
	})
})
