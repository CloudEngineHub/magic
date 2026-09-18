import { beforeEach, describe, expect, it, vi } from "vitest"
import { takePendingEntityCreation } from "@/services/analytics"
import { trackProjectCreated } from "@/pages/superMagic/services/trackCreatedEntities"
import { reportPendingCrewCreatedEntities } from "./report-crew-created-entities"

vi.mock("@/services/analytics", () => ({
	takePendingEntityCreation: vi.fn(),
}))

vi.mock("@/pages/superMagic/services/trackCreatedEntities", () => ({
	trackProjectCreated: vi.fn(),
}))

const project = {
	id: "project-1",
	workspace_id: "workspace-1",
	current_topic_id: "topic-initial",
}
const topics = [
	{ id: "topic-other", project_id: "project-1", workspace_id: "workspace-1" },
	{ id: "topic-initial", project_id: "project-1", workspace_id: "workspace-1" },
]

describe("reportPendingCrewCreatedEntities", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("reports the Crew project and initial topic once after the edit route resolves ids", async () => {
		vi.mocked(takePendingEntityCreation).mockResolvedValue(true)

		const reported = await reportPendingCrewCreatedEntities({
			crewCode: "SMA-new",
			project: project as never,
			topics: topics as never,
		})

		expect(reported).toBe(true)
		expect(trackProjectCreated).toHaveBeenCalledWith(
			{ project, topic: topics[1] },
			"workspace-1",
			"crew",
		)
		expect(takePendingEntityCreation).toHaveBeenCalledWith({
			scene: "crew",
			resourceCode: "SMA-new",
		})
	})

	it("does not report when an existing Crew is opened", async () => {
		vi.mocked(takePendingEntityCreation).mockResolvedValue(false)

		const reported = await reportPendingCrewCreatedEntities({
			crewCode: "SMA-existing",
			project: project as never,
			topics: topics as never,
		})

		expect(reported).toBe(false)
		expect(trackProjectCreated).not.toHaveBeenCalled()
	})

	it("reports a Crew special project whose workspace id is null", async () => {
		vi.mocked(takePendingEntityCreation).mockResolvedValue(true)
		const projectWithoutWorkspace = { ...project, workspace_id: null }
		const topicWithoutWorkspace = { ...topics[1], workspace_id: null }

		const reported = await reportPendingCrewCreatedEntities({
			crewCode: "SMA-special",
			project: projectWithoutWorkspace as never,
			topics: [topicWithoutWorkspace] as never,
		})

		expect(reported).toBe(true)
		expect(trackProjectCreated).toHaveBeenCalledWith(
			{ project: projectWithoutWorkspace, topic: topicWithoutWorkspace },
			null,
			"crew",
		)
	})

	it("keeps the pending marker when the initial topic has not loaded", async () => {
		const reported = await reportPendingCrewCreatedEntities({
			crewCode: "SMA-new",
			project: project as never,
			topics: [],
		})

		expect(reported).toBe(false)
		expect(trackProjectCreated).not.toHaveBeenCalled()
		expect(takePendingEntityCreation).not.toHaveBeenCalled()
	})
})
