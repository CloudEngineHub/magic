import { beforeEach, describe, expect, it, vi } from "vitest"

import { onSummarizeSuccessDefaultCallback } from "../callback"

const {
	navigateToRecordSummaryResultMock,
	waitingTipMock,
	recordErrorMock,
	requestShellRefreshMock,
	recordSummaryStoreMock,
} = vi.hoisted(() => ({
	navigateToRecordSummaryResultMock: vi.fn(),
	waitingTipMock: vi.fn(),
	recordErrorMock: vi.fn(),
	requestShellRefreshMock: vi.fn(),
	recordSummaryStoreMock: {
		businessData: {
			project: null as { project_mode?: string | null } | null,
		},
	},
}))

const { isAudioProjectModeMock } = vi.hoisted(() => ({
	isAudioProjectModeMock: vi.fn(),
}))

vi.mock("@/services/audioRecordings", () => ({
	isAudioProjectMode: isAudioProjectModeMock,
	navigateToRecordSummaryResult: navigateToRecordSummaryResultMock,
}))

vi.mock(
	"@/pages/superMagic/pages/AudioRecordings/utils/request-audio-recordings-shell-refresh",
	() => ({
		requestAudioRecordingsShellRefresh: requestShellRefreshMock,
	}),
)

vi.mock("@/stores/recordingSummary", () => ({
	default: recordSummaryStoreMock,
}))

vi.mock("@/components/business/RecordingSummary/components/WaitingTipModal", () => ({
	__esModule: true,
	default: waitingTipMock,
}))

vi.mock("@/components/business/RecordingSummary/components/RecordErrorModal", () => ({
	__esModule: true,
	default: recordErrorMock,
}))

describe("onSummarizeSuccessDefaultCallback", () => {
	beforeEach(() => {
		navigateToRecordSummaryResultMock.mockReset()
		waitingTipMock.mockReset()
		recordErrorMock.mockReset()
		requestShellRefreshMock.mockReset()
		isAudioProjectModeMock.mockReset()
		recordSummaryStoreMock.businessData.project = null
	})

	it("shows the audio-recordings waiting tip and refreshes the list shell", () => {
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

		expect(requestShellRefreshMock).toHaveBeenCalledTimes(1)
		expect(waitingTipMock).toHaveBeenCalledWith({
			presentation: "audioRecordings",
		})
		expect(navigateToRecordSummaryResultMock).not.toHaveBeenCalled()
	})

	it("falls back to store project mode for audio-recordings sessions", () => {
		isAudioProjectModeMock.mockReturnValue(true)
		recordSummaryStoreMock.businessData.project = { project_mode: "audio" }

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
		})

		expect(requestShellRefreshMock).toHaveBeenCalledTimes(1)
		expect(waitingTipMock).toHaveBeenCalledWith({
			presentation: "audioRecordings",
		})
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
			presentation: "default",
		})
		expect(requestShellRefreshMock).not.toHaveBeenCalled()
		expect(navigateToRecordSummaryResultMock).not.toHaveBeenCalled()
	})
})
