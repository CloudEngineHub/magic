import { beforeEach, describe, expect, it, vi } from "vitest"
import { trackProjectCreated } from "@/pages/superMagic/services/trackCreatedEntities"
import { takePendingEntityCreation } from "@/services/analytics"
import { reportPendingSkillCreatedEntities } from "./report-skill-created-entities"

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

describe("reportPendingSkillCreatedEntities", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("reports the Skill project and initial topic once after ids resolve", async () => {
		vi.mocked(takePendingEntityCreation).mockResolvedValue(true)

		const reported = await reportPendingSkillCreatedEntities({
			skillCode: "SKILL-new",
			project: project as never,
			topics: topics as never,
		})

		expect(reported).toBe(true)
		expect(trackProjectCreated).toHaveBeenCalledWith(
			{ project, topic: topics[1] },
			"workspace-1",
			"skill",
		)
		expect(takePendingEntityCreation).toHaveBeenCalledWith({
			scene: "skill",
			resourceCode: "SKILL-new",
		})
	})

	it("does not report when an existing Skill is opened", async () => {
		vi.mocked(takePendingEntityCreation).mockResolvedValue(false)

		const reported = await reportPendingSkillCreatedEntities({
			skillCode: "SKILL-existing",
			project: project as never,
			topics: topics as never,
		})

		expect(reported).toBe(false)
		expect(trackProjectCreated).not.toHaveBeenCalled()
	})

	it("reports a Skill special project whose workspace id is null", async () => {
		vi.mocked(takePendingEntityCreation).mockResolvedValue(true)
		const projectWithoutWorkspace = { ...project, workspace_id: null }
		const topicWithoutWorkspace = { ...topics[1], workspace_id: null }

		const reported = await reportPendingSkillCreatedEntities({
			skillCode: "SKILL-special",
			project: projectWithoutWorkspace as never,
			topics: [topicWithoutWorkspace] as never,
		})

		expect(reported).toBe(true)
		expect(trackProjectCreated).toHaveBeenCalledWith(
			{ project: projectWithoutWorkspace, topic: topicWithoutWorkspace },
			null,
			"skill",
		)
	})

	it("keeps the pending marker until an initial topic is available", async () => {
		const reported = await reportPendingSkillCreatedEntities({
			skillCode: "SKILL-new",
			project: project as never,
			topics: [],
		})

		expect(reported).toBe(false)
		expect(trackProjectCreated).not.toHaveBeenCalled()
		expect(takePendingEntityCreation).not.toHaveBeenCalled()
	})
})
