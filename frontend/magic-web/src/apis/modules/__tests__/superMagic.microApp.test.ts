import { describe, expect, it, vi } from "vitest"
import type { HttpClient } from "@/apis/core/HttpClient"
import { generateSuperMagicApi } from "../superMagic"

type MicroAppHttpClientMock = Pick<HttpClient, "get" | "post" | "put" | "delete">

describe("SuperMagic micro app API", () => {
	it("uses the workspace and list query endpoints", async () => {
		const client: MicroAppHttpClientMock = {
			get: vi.fn().mockResolvedValue({}),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
		}
		const api = generateSuperMagicApi(client as HttpClient)

		await api.getMicroAppWorkspace()
		await api.getMicroApps({
			page: 2,
			page_size: 50,
			keyword: "客户跟进",
			scope: "collaborated",
		})

		expect(client.get).toHaveBeenNthCalledWith(
			1,
			"/api/v1/super-agent/workspaces/app/micro-app",
		)
		expect(client.get).toHaveBeenNthCalledWith(
			2,
			"/api/v1/super-agent/micro-apps/queries?page=2&page_size=50&keyword=%E5%AE%A2%E6%88%B7%E8%B7%9F%E8%BF%9B&scope=collaborated",
			{ parseJsonLargeIntAsString: true },
		)
	})

	it("creates, edits, deletes, and publishes with app fields and string-safe parsing", async () => {
		const client: MicroAppHttpClientMock = {
			get: vi.fn(),
			post: vi.fn().mockResolvedValue({ app_id: "933138305533177857" }),
			put: vi.fn().mockResolvedValue({ app_id: "933138305533177857" }),
			delete: vi.fn(),
		}
		const api = generateSuperMagicApi(client as HttpClient)

		await api.createMicroAppProject({
			workspace_id: "workspace-1",
			dynamic_params: { agent_mode: "micro-app", message_version: "v2" },
		})
		await api.updateMicroApp("933138305533177857", {
			app_name: "客户跟进助手",
			cover_file_key: null,
		})
		await api.deleteMicroApp("933138305533177857")
		await api.publishMicroAppProject("933138305533177857", {
			app_name: "客户跟进助手",
			share_type: 4,
			cover_file_key: "micro-app/covers/customer.png",
			extra: { pure_mode: true },
		})

		expect(client.post).toHaveBeenNthCalledWith(
			1,
			"/api/v1/super-agent/micro-app-projects",
			{
				workspace_id: "workspace-1",
				project_name: "",
				dynamic_params: { agent_mode: "micro-app", message_version: "v2" },
			},
			{ parseJsonLargeIntAsString: true },
		)
		expect(client.put).toHaveBeenCalledWith(
			"/api/v1/super-agent/micro-apps/933138305533177857",
			{ app_name: "客户跟进助手", cover_file_key: null },
			{ parseJsonLargeIntAsString: true },
		)
		expect(client.delete).toHaveBeenCalledWith(
			"/api/v1/super-agent/micro-apps/933138305533177857",
			undefined,
			{ parseJsonLargeIntAsString: true },
		)
		expect(client.post).toHaveBeenNthCalledWith(
			2,
			"/api/v1/super-agent/micro-app-projects/933138305533177857/publish",
			{
				app_name: "客户跟进助手",
				share_type: 4,
				cover_file_key: "micro-app/covers/customer.png",
				extra: { pure_mode: true },
			},
			{ parseJsonLargeIntAsString: true },
		)
	})
})
