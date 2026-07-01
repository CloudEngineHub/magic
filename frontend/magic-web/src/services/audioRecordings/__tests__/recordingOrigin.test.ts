import { beforeEach, describe, expect, it, vi } from "vitest"

const {
	createHrefMock,
	pushMock,
	genProjectTopicUrlMock,
	openInNewTabMock,
	changeBottomTabMock,
	deviceMocks,
} = vi.hoisted(() => ({
	createHrefMock: vi.fn(),
	pushMock: vi.fn(),
	genProjectTopicUrlMock: vi.fn(),
	openInNewTabMock: vi.fn(),
	changeBottomTabMock: vi.fn(),
	deviceMocks: {
		isMagicApp: false,
	},
}))

vi.mock("@/routes/history", () => ({
	history: {
		createHref: createHrefMock,
		push: pushMock,
	},
}))

vi.mock("@/pages/superMagic/utils/project", () => ({
	genProjectTopicUrl: genProjectTopicUrlMock,
	openInNewTab: openInNewTabMock,
}))

vi.mock("@/utils/devices", () => ({
	get isMagicApp() {
		return deviceMocks.isMagicApp
	},
}))

vi.mock("@/platform/native", () => ({
	getNativePort: () => ({
		navigation: {
			changeBottomTab: changeBottomTabMock,
		},
	}),
}))

import {
	navigateToRecordSummaryResult,
	resolveRecordSummaryResultHref,
	shouldSuppressRecordSummaryNotification,
} from "../recordingOrigin"

describe("recordingOrigin", () => {
	beforeEach(() => {
		createHrefMock.mockReset()
		pushMock.mockReset()
		genProjectTopicUrlMock.mockReset()
		openInNewTabMock.mockReset()
		changeBottomTabMock.mockReset()
		deviceMocks.isMagicApp = false
		createHrefMock.mockReturnValue("/global/recordings/project-mobile-001")
		genProjectTopicUrlMock.mockReturnValue("/global/super/project/topic")
	})

	describe("resolveRecordSummaryResultHref", () => {
		it("returns the new recordings detail href for audio projects", () => {
			const href = resolveRecordSummaryResultHref({
				projectId: "project-mobile-001",
				projectMode: "audio",
			})

			expect(createHrefMock).toHaveBeenCalledWith({
				name: "AudioRecordingDetail",
				params: { projectId: "project-mobile-001" },
			})
			expect(href).toBe("/global/recordings/project-mobile-001")
		})

		it("returns the legacy topic href for non-audio projects", () => {
			const href = resolveRecordSummaryResultHref({
				projectId: "project-legacy-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "summary",
			})

			expect(genProjectTopicUrlMock).toHaveBeenCalledWith(
				"workspace-001",
				"project-legacy-001",
				"topic-001",
			)
			expect(href).toBe("/global/super/project/topic")
		})

		it("falls back to the legacy topic href when project_mode is missing", () => {
			resolveRecordSummaryResultHref({
				projectId: "project-legacy-002",
				workspaceId: "workspace-002",
				topicId: "topic-002",
			})

			expect(genProjectTopicUrlMock).toHaveBeenCalledWith(
				"workspace-002",
				"project-legacy-002",
				"topic-002",
			)
		})
	})

	describe("navigateToRecordSummaryResult", () => {
		it("navigates in-place to the audio detail page", () => {
			navigateToRecordSummaryResult({
				projectId: "project-mobile-001",
				projectMode: "audio",
				projectName: "Imported audio",
				openInNewTab: false,
			})

			expect(pushMock).toHaveBeenCalledWith({
				name: "AudioRecordingDetail",
				params: { projectId: "project-mobile-001" },
				state: { projectName: "Imported audio" },
			})
			expect(openInNewTabMock).not.toHaveBeenCalled()
		})

		it("opens the native recording tab for audio projects inside Magic App", () => {
			deviceMocks.isMagicApp = true

			navigateToRecordSummaryResult({
				projectId: "project-mobile-001",
				projectMode: "audio",
				projectName: "Mock imported audio",
				openInNewTab: false,
			})

			expect(changeBottomTabMock).toHaveBeenCalledWith({
				tab: "ai_recording",
				bottomTabHeight: 0,
			})
			expect(pushMock).not.toHaveBeenCalled()
			expect(openInNewTabMock).not.toHaveBeenCalled()
		})

		it("opens the native recording tab inside Magic App even when project id is missing", () => {
			deviceMocks.isMagicApp = true

			navigateToRecordSummaryResult({
				projectMode: "audio",
				projectName: "Mock imported audio without id",
				openInNewTab: false,
			})

			expect(changeBottomTabMock).toHaveBeenCalledWith({
				tab: "ai_recording",
				bottomTabHeight: 0,
			})
			expect(pushMock).not.toHaveBeenCalled()
		})

		it("opens legacy expert-mode results in a new tab by default", () => {
			navigateToRecordSummaryResult({
				projectId: "project-legacy-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "summary",
			})

			expect(openInNewTabMock).toHaveBeenCalledWith("/global/super/project/topic")
			expect(pushMock).not.toHaveBeenCalled()
		})

		it("navigates legacy expert-mode results in the same tab when requested", () => {
			navigateToRecordSummaryResult({
				projectId: "project-legacy-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "summary",
				openInNewTab: false,
			})

			expect(pushMock).toHaveBeenCalledWith({
				name: "SuperWorkspaceProjectTopicState",
				params: {
					projectId: "project-legacy-001",
					topicId: "topic-001",
				},
			})
			expect(openInNewTabMock).not.toHaveBeenCalled()
		})
	})

	describe("shouldSuppressRecordSummaryNotification", () => {
		it("suppresses audio notifications when already on the matching detail page", () => {
			const shouldSuppress = shouldSuppressRecordSummaryNotification({
				projectId: "project-mobile-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "audio",
				pathname: "/global/recordings/project-mobile-001",
			})

			expect(shouldSuppress).toBe(true)
		})

		it("does not suppress audio notifications on a different detail page", () => {
			const shouldSuppress = shouldSuppressRecordSummaryNotification({
				projectId: "project-mobile-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "audio",
				pathname: "/global/recordings/project-mobile-002",
			})

			expect(shouldSuppress).toBe(false)
		})

		it("suppresses legacy notifications when workspace state matches the target topic", () => {
			const shouldSuppress = shouldSuppressRecordSummaryNotification({
				projectId: "project-legacy-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "summary",
				workspaceState: {
					projectId: "project-legacy-001",
					workspaceId: "workspace-001",
					topicId: "topic-001",
				},
			})

			expect(shouldSuppress).toBe(true)
		})

		it("does not suppress legacy notifications when workspace state differs", () => {
			const shouldSuppress = shouldSuppressRecordSummaryNotification({
				projectId: "project-legacy-001",
				workspaceId: "workspace-001",
				topicId: "topic-001",
				projectMode: "summary",
				workspaceState: {
					projectId: "project-legacy-002",
					workspaceId: "workspace-001",
					topicId: "topic-001",
				},
			})

			expect(shouldSuppress).toBe(false)
		})
	})
})
