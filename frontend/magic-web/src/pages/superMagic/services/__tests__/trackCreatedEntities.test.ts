import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CreatedProject, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import {
	trackProjectCreated,
	resolveCreationScene,
	trackTopicCreated,
	trackWorkspaceCreated,
} from "../trackCreatedEntities"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock("@/services/analytics", () => ({ track }))

describe("created entity analytics", () => {
	beforeEach(() => track.mockReset())

	it("reports a workspace with its stable id", () => {
		trackWorkspaceCreated({ id: " workspace-1 " } as Workspace)
		expect(track).toHaveBeenCalledWith("workspace_created", { workspace_id: "workspace-1" })
	})

	it("reports a workspace project and its initial topic with scene-specific events", () => {
		trackProjectCreated(
			{
				project: { id: "project-1", workspace_id: "workspace-1" },
				topic: { id: "topic-1", project_id: "project-1" },
			} as CreatedProject,
			"fallback-workspace",
		)

		expect(track).toHaveBeenNthCalledWith(1, "workspace_project_created", {
			project_id: "project-1",
			workspace_id: "workspace-1",
		})
		expect(track).toHaveBeenNthCalledWith(2, "workspace_topic_created", {
			topic_id: "topic-1",
			project_id: "project-1",
			workspace_id: "workspace-1",
		})
	})

	it("uses caller context and scene when a topic response omits ownership fields", () => {
		trackTopicCreated(
			{ id: "topic-1" },
			{ projectId: "project-1", workspaceId: "workspace-1", scene: "micro_app" },
		)
		expect(track).toHaveBeenCalledWith("micro_app_topic_created", {
			topic_id: "topic-1",
			project_id: "project-1",
			workspace_id: "workspace-1",
		})
	})

	it("maps every specialized project mode to its product creation scene", () => {
		expect(resolveCreationScene("chat")).toBe("chat")
		expect(resolveCreationScene("audio")).toBe("ai_recording")
		expect(resolveCreationScene("crew-creator")).toBe("crew")
		expect(resolveCreationScene("custom_agent")).toBe("crew")
		expect(resolveCreationScene("SMA-employee-code")).toBe("crew")
		expect(resolveCreationScene("magiclaw")).toBe("magic_claw")
		expect(resolveCreationScene("micro-app")).toBe("micro_app")
		expect(resolveCreationScene("skill-creator")).toBe("skill")
		expect(resolveCreationScene("general")).toBe("workspace")
	})

	it("uses an explicit scene for dedicated creation APIs", () => {
		trackProjectCreated(
			{
				project: { id: "project-1", workspace_id: "workspace-1" },
				topic: { id: "topic-1", project_id: "project-1" },
			} as CreatedProject,
			"workspace-1",
			"ai_recording",
		)

		expect(track).toHaveBeenNthCalledWith(1, "ai_recording_project_created", {
			project_id: "project-1",
			workspace_id: "workspace-1",
		})
		expect(track).toHaveBeenNthCalledWith(2, "ai_recording_topic_created", {
			topic_id: "topic-1",
			project_id: "project-1",
			workspace_id: "workspace-1",
		})
	})

	it("uses the initial topic workspace when a dedicated API omits it on the project", () => {
		trackProjectCreated(
			{
				project: { id: "recording-project", workspace_id: "" },
				topic: {
					id: "recording-topic",
					project_id: "recording-project",
					workspace_id: "recording-workspace",
				},
			} as CreatedProject,
			undefined,
			"ai_recording",
		)

		expect(track).toHaveBeenNthCalledWith(1, "ai_recording_project_created", {
			project_id: "recording-project",
			workspace_id: "recording-workspace",
		})
		expect(track).toHaveBeenNthCalledWith(2, "ai_recording_topic_created", {
			topic_id: "recording-topic",
			project_id: "recording-project",
			workspace_id: "recording-workspace",
		})
	})

	it("reports an ungrouped recording even when neither entity has a workspace", () => {
		trackProjectCreated(
			{
				project: { id: "ungrouped-recording-project", workspace_id: "" },
				topic: {
					id: "ungrouped-recording-topic",
					project_id: "ungrouped-recording-project",
					workspace_id: "",
				},
			} as CreatedProject,
			undefined,
			"ai_recording",
		)

		expect(track).toHaveBeenNthCalledWith(1, "ai_recording_project_created", {
			project_id: "ungrouped-recording-project",
		})
		expect(track).toHaveBeenNthCalledWith(2, "ai_recording_topic_created", {
			topic_id: "ungrouped-recording-topic",
			project_id: "ungrouped-recording-project",
		})
	})

	it("reports Crew-owned entities even when their special project has no workspace", () => {
		trackProjectCreated(
			{
				project: { id: "crew-project", workspace_id: null },
				topic: {
					id: "crew-topic",
					project_id: "crew-project",
					workspace_id: null,
				},
			} as unknown as CreatedProject,
			undefined,
			"crew",
		)

		expect(track).toHaveBeenNthCalledWith(1, "crew_project_created", {
			project_id: "crew-project",
		})
		expect(track).toHaveBeenNthCalledWith(2, "crew_topic_created", {
			topic_id: "crew-topic",
			project_id: "crew-project",
		})
	})

	it("reports Magic Claw entities even when their special project has no workspace", () => {
		trackProjectCreated(
			{
				project: { id: "claw-project", workspace_id: null },
				topic: {
					id: "claw-topic",
					project_id: "claw-project",
					workspace_id: null,
				},
			} as unknown as CreatedProject,
			undefined,
			"magic_claw",
		)

		expect(track).toHaveBeenNthCalledWith(1, "magic_claw_project_created", {
			project_id: "claw-project",
		})
		expect(track).toHaveBeenNthCalledWith(2, "magic_claw_topic_created", {
			topic_id: "claw-topic",
			project_id: "claw-project",
		})
	})

	it("reports Skill-owned entities even when their special project has no workspace", () => {
		trackProjectCreated(
			{
				project: { id: "skill-project", workspace_id: null },
				topic: {
					id: "skill-topic",
					project_id: "skill-project",
					workspace_id: null,
				},
			} as unknown as CreatedProject,
			undefined,
			"skill",
		)

		expect(track).toHaveBeenNthCalledWith(1, "skill_project_created", {
			project_id: "skill-project",
		})
		expect(track).toHaveBeenNthCalledWith(2, "skill_topic_created", {
			topic_id: "skill-topic",
			project_id: "skill-project",
		})
	})

	it.each([
		"workspace",
		"chat",
		"ai_recording",
		"crew",
		"magic_claw",
		"micro_app",
		"skill",
	] as const)("replaces generic create events with the %s event pair", (scene) => {
		trackProjectCreated(
			{
				project: { id: "project-1", workspace_id: "workspace-1" },
				topic: { id: "topic-1", project_id: "project-1" },
			} as CreatedProject,
			"workspace-1",
			scene,
		)

		expect(track.mock.calls.map(([event]) => event)).toEqual([
			`${scene}_project_created`,
			`${scene}_topic_created`,
		])
		expect(track).not.toHaveBeenCalledWith("project_created", expect.anything())
		expect(track).not.toHaveBeenCalledWith("topic_created", expect.anything())
	})

	it("does not report incomplete identities", () => {
		trackWorkspaceCreated({ id: " " } as Workspace)
		trackProjectCreated({ project: { id: "project-1" }, topic: null } as never)
		trackTopicCreated({ id: "topic-1" }, { projectId: "project-1" })
		expect(track).not.toHaveBeenCalled()
	})
})
