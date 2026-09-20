import { beforeEach, describe, expect, it } from "vitest"
import { SidebarStore } from "../SidebarStore"

describe("Sidebar navigation preferences", () => {
	beforeEach(() => localStorage.clear())

	it("restores chats for the same identity and isolates other organizations", () => {
		const store = new SidebarStore()
		store.setNavigationIdentity("user", "organization-a")
		store.selectNavigationSection("chats")
		expect(store.recentProjectsExpanded).toBe(false)
		expect(store.workspacesExpanded).toBe(false)
		store.setNavigationIdentity("user", "organization-b")
		expect(store.expandedNavigationSection).toBe("workspaces")
		store.setNavigationIdentity("user", "organization-a")
		expect(store.expandedNavigationSection).toBe("chats")
	})

	it.each(["recent", "workspaces"] as const)(
		"keeps the existing %s preference compatible",
		(section) => {
			const store = new SidebarStore()
			store.setNavigationIdentity("user", "organization")
			store.selectNavigationSection(section)
			store.selectNavigationSection("chats")
			store.selectNavigationSection(section)
			expect(store.expandedNavigationSection).toBe(section)
		},
	)
})
