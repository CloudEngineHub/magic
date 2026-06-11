import { describe, expect, it, vi } from "vitest"
import { ScheduledTask } from "@/types/scheduledTask"
import { buildSelfMediaPostAutoSyncTaskData } from "../services/selfMediaPostAutoSync"

const { mockT } = vi.hoisted(() => ({
	mockT: vi.fn((key: string, options?: Record<string, unknown>) => {
		const translations: Record<string, string> = {
			"detail.selfMedia.opsRefresh.prompt.untitled": "Self-media post",
			"detail.selfMedia.opsRefresh.prompt.opening":
				"Act as an IP operations specialist and fetch then write back post-publication real operations data for {{mention}}.",
			"detail.selfMedia.opsRefresh.prompt.metadata":
				"Platform: {{platform}}\nTitle: {{title}}\nPublished URL: {{publishedUrl}}",
			"detail.selfMedia.opsRefresh.prompt.instruction":
				"Read ops/source.json in the current post folder first. Visit the real article URL and update ops/metrics.json, ops/comments.json, ops/review.md, and ops/source.json status fields.",
			"detail.selfMedia.initPanel.platforms.rednote": "Rednote",
		}
		const template = translations[key] || String(options?.defaultValue || key)
		return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ""))
	}),
}))

vi.mock("i18next", () => ({
	default: {
		t: mockT,
	},
	t: mockT,
}))

vi.mock("@/apis", () => ({
	ScheduledTaskApi: {
		createScheduledTask: vi.fn(),
		updateScheduledTask: vi.fn(),
	},
}))

describe("selfMediaPostAutoSync", () => {
	it("builds a scheduled task that creates a new ip-manager topic with the resolved employee model", () => {
		const model = {
			id: "model-1",
			group_id: "group-1",
			model_id: "gpt-5",
			model_name: "GPT-5",
			provider_model_id: "gpt-5",
			model_description: "",
			model_icon: "",
			model_status: "normal",
			sort: 1,
		} as never

		const taskData = buildSelfMediaPostAutoSyncTaskData({
			workspaceId: "workspace-1",
			projectId: "project-1",
			platform: "rednote",
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			post: {
				meta: {
					id: "post-1",
					title: "AI Tools",
					author: "Magic Lab",
				},
				cards: [{ path: "cards/01.html", fileId: "card-1" }],
			},
			postDirectoryItem: {
				file_id: "post-dir",
				file_name: "post-1",
				relative_file_path: "posts/post-1/",
				is_directory: true,
			} as never,
			timeConfig: {
				type: ScheduledTask.ScheduleType.Weekly,
				day: "1",
				time: "10:30",
			},
			model,
		})

		expect(taskData).toEqual(
			expect.objectContaining({
				task_name: "[文章数据同步] AI Tools",
				workspace_id: "workspace-1",
				project_id: "project-1",
				topic_id: "",
				enabled: 1,
				message_type: "rich_text",
				time_config: {
					type: ScheduledTask.ScheduleType.Weekly,
					day: "1",
					time: "10:30",
				},
			}),
		)
		expect(taskData.message_content.extra?.super_agent).toEqual(
			expect.objectContaining({
				topic_pattern: "ip-manager",
				chat_mode: "normal",
				input_mode: "plan",
				enable_web_search: true,
				model,
				dynamic_params: { message_version: "v2" },
			}),
		)
		expect(taskData.message_content.extra?.super_agent).not.toHaveProperty("agent_code")
		expect(taskData.message_content.extra?.super_agent.mentions).toEqual([
			{
				type: "project_directory",
				data: expect.objectContaining({
					directory_id: "post-dir",
					directory_name: "post-1",
					directory_path: "posts/post-1/",
				}),
			},
		])
		expect(JSON.stringify(taskData.message_content.content)).toContain("ops/metrics.json")
		expect(JSON.stringify(taskData.message_content.content)).toContain(
			"https://www.xiaohongshu.com/explore/post-1",
		)
	})
})
