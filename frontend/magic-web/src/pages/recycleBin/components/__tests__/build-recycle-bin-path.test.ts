import { describe, expect, it } from "vitest"
import {
	buildRecycleBinPathLabel,
	mapRecycleBinItem,
	RESOURCE_TYPE,
	shouldRestoreMicroAppWithoutMove,
} from "@/pages/recycleBin/components/recycle-bin-domain"

const FALLBACK = {
	"common.unNamedWorkspace": "未命名工作区",
	"common.untitledProject": "未命名项目",
	"microAppsPage.title": "微应用",
	"mobile.recycleBin.pathScopes.workspaces": "工作空间",
	"mobile.recycleBin.pathScopes.microApps": "微应用",
} as const

/** Minimal i18n mock with literal keys for path builder tests. */
function createPathT() {
	return ((key: string) => FALLBACK[key as keyof typeof FALLBACK] ?? key) as never
}

describe("buildRecycleBinPathLabel", () => {
	const t = createPathT()

	it("shows workspaces scope only for deleted workspace", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.WORKSPACE,
				parentInfo: undefined,
				t,
			}),
		).toBe("工作空间")
	})

	it("shows scope and workspace name for deleted project", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.PROJECT,
				parentInfo: { workspace_name: "Growth" },
				t,
			}),
		).toBe("工作空间 / Growth")
	})

	it("uses default workspace name when parent_info is missing for project", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.PROJECT,
				parentInfo: undefined,
				t,
			}),
		).toBe("工作空间 / 未命名工作区")
	})

	it("shows scope, workspace, and project for deleted topic", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.TOPIC,
				parentInfo: {
					workspace_name: "Engineering",
					project_name: "Backend Refactor",
				},
				t,
			}),
		).toBe("工作空间 / Engineering / Backend Refactor")
	})

	it("fills missing workspace segment with default name for topic", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.TOPIC,
				parentInfo: { project_name: "Backend Refactor" },
				t,
			}),
		).toBe("工作空间 / 未命名工作区 / Backend Refactor")
	})

	it("fills both parent segments when parent_info names are empty for topic", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.TOPIC,
				parentInfo: { workspace_name: "", project_name: "  " },
				t,
			}),
		).toBe("工作空间 / 未命名工作区 / 未命名项目")
	})

	it("uses the micro app scope for deleted micro apps", () => {
		expect(
			buildRecycleBinPathLabel({
				resourceType: RESOURCE_TYPE.MICRO_APP,
				parentInfo: { workspace_name: "Ignored" },
				t,
			}),
		).toBe("微应用")
	})

	it("maps recycle-bin type 5 to a micro app item", () => {
		const item = mapRecycleBinItem(
			{
				id: "trash-1",
				resource_type: 5,
				resource_type_name: "micro_app",
				resource_id: "app-1",
				resource_name: "客户跟进助手",
				owner_id: "user-1",
				deleted_by: "user-1",
				deleted_at: "2026-08-04 12:00:00",
				expire_at: "2026-09-03 12:00:00",
				remaining_days: 30,
				parent_id: "",
			},
			t,
		)

		expect(item).toMatchObject({
			resourceId: "app-1",
			resourceType: RESOURCE_TYPE.MICRO_APP,
			category: "microApps",
			title: "客户跟进助手",
			path: "微应用",
		})
	})

	it("keeps micro app recovery on its hidden workspace flow", () => {
		expect(shouldRestoreMicroAppWithoutMove(RESOURCE_TYPE.MICRO_APP, ["app-1"])).toBe(true)
		expect(shouldRestoreMicroAppWithoutMove(RESOURCE_TYPE.PROJECT, ["project-1"])).toBe(false)
	})
})
