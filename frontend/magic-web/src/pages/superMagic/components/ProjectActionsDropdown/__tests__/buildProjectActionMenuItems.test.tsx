import { describe, expect, it, vi } from "vitest"
import { ProjectActionMenuKey } from "../types"

const appEnv = vi.hoisted(() => ({
	isMagicApp: false,
}))

vi.mock("@/utils/devices", () => ({
	get isMagicApp() {
		return appEnv.isMagicApp
	},
}))

vi.mock("@/utils/env", () => ({
	env: () => "",
	isCommercial: () => false,
}))

import { buildProjectActionMenuItems } from "../buildProjectActionMenuItems"

const mockProject = {
	id: "project-mock",
	project_name: "Mock Project",
	user_role: "owner",
	is_pinned: false,
	is_bind_workspace: false,
	bind_workspace_id: "0",
} as never

const translate = ((key: string) => key) as never

describe("buildProjectActionMenuItems", () => {
	it("keeps project new-window action visible in browser desktop mode", () => {
		appEnv.isMagicApp = false

		const items = buildProjectActionMenuItems({
			item: mockProject,
			t: translate,
			inCollaborationPanel: false,
			onOpenInNewWindow: vi.fn(),
		})

		expect(items.some((item) => item?.key === ProjectActionMenuKey.OpenInNewWindow)).toBe(true)
	})

	it("hides project new-window action in Magic App desktop mode", () => {
		appEnv.isMagicApp = true

		const items = buildProjectActionMenuItems({
			item: mockProject,
			t: translate,
			inCollaborationPanel: false,
			onOpenInNewWindow: vi.fn(),
		})

		expect(items.some((item) => item?.key === ProjectActionMenuKey.OpenInNewWindow)).toBe(false)
	})
})
