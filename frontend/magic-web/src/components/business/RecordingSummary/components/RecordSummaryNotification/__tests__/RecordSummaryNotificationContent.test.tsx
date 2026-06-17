import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import RecordSummaryNotificationContent from "../RecordSummaryNotificationContent"

vi.mock("@/services/audioRecordings", () => ({
	isAudioProjectMode: (projectMode?: string | null) => projectMode === "audio",
	resolveRecordSummaryResultHref: (params: {
		projectId?: string | null
		projectMode?: string | null
	}) => {
		return params.projectMode === "audio"
			? `/global/recordings/${params.projectId || ""}`
			: "/global/super/workspace/project/topic"
	},
}))

vi.mock("@/routes/history", () => ({
	history: {
		createHref: ({ params }: { params?: { projectId?: string } }) =>
			`/global/recordings/${params?.projectId || ""}`,
	},
}))

vi.mock("@/pages/superMagic/utils/project", () => ({
	genProjectTopicUrl: () => "/global/super/workspace/project/topic",
}))

describe("RecordSummaryNotificationContent", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("uses the new recordings detail href for audio projects", () => {
		render(
			<RecordSummaryNotificationContent
				title="Summary ready"
				description="Done"
				onViewClick={() => undefined}
				onDismiss={() => undefined}
				viewText="View summary"
				ignoreText="Ignore"
				success
				projectId="project-mobile-001"
				projectMode="audio"
				workspaceId="workspace-001"
				topicId="topic-001"
			/>,
		)

		expect(screen.getByRole("link", { name: "View summary" })).toHaveAttribute(
			"href",
			"/global/recordings/project-mobile-001",
		)
	})

	it("uses the legacy topic href for non-audio projects", () => {
		render(
			<RecordSummaryNotificationContent
				title="Summary ready"
				description="Done"
				onViewClick={() => undefined}
				onDismiss={() => undefined}
				viewText="View summary"
				ignoreText="Ignore"
				success
				projectId="project-legacy-001"
				projectMode="summary"
				workspaceId="workspace-001"
				topicId="topic-001"
			/>,
		)

		expect(screen.getByRole("link", { name: "View summary" })).toHaveAttribute(
			"href",
			"/global/super/workspace/project/topic",
		)
	})
})
