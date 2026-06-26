import { beforeEach, describe, expect, it } from "vitest"
import {
	SESSION_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
	SessionStorageHtmlPermissionGrantStore,
	type HtmlPermissionGrant,
} from "../HtmlPermissionGrantStore"

function grant(overrides: Partial<HtmlPermissionGrant> = {}): HtmlPermissionGrant {
	return {
		mode: "manifest",
		userKey: "user-1",
		projectId: "project-1",
		appRootDir: "app/",
		entryPath: "app/index.html",
		appFingerprint: "abc123",
		scope: "llm.use",
		grantedAt: 1000,
		expiresAt: 2000,
		...overrides,
	}
}

describe("SessionStorageHtmlPermissionGrantStore", () => {
	beforeEach(() => {
		sessionStorage.clear()
	})

	it("saves, lists, and replaces grants for the same identity and scope", () => {
		const store = new SessionStorageHtmlPermissionGrantStore()

		store.save(grant({ expiresAt: 2000 }))
		store.save(grant({ expiresAt: 3000 }))

		expect(store.list()).toEqual([grant({ expiresAt: 3000 })])
	})

	it("removes grants by partial match", () => {
		const store = new SessionStorageHtmlPermissionGrantStore()
		store.save(grant({ scope: "llm.use" }))
		store.save(grant({ scope: "project.message.write" }))

		store.remove({ scope: "llm.use" })

		expect(store.list()).toEqual([grant({ scope: "project.message.write" })])
	})

	it("prunes expired grants", () => {
		const store = new SessionStorageHtmlPermissionGrantStore()
		store.save(grant({ scope: "llm.use", expiresAt: 1500 }))
		store.save(grant({ scope: "project.message.write", expiresAt: 2500 }))

		store.prune(2000)

		expect(store.list()).toEqual([grant({ scope: "project.message.write", expiresAt: 2500 })])
	})

	it("returns an empty list when stored json is corrupted", () => {
		sessionStorage.setItem(SESSION_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY, "{bad json")

		const store = new SessionStorageHtmlPermissionGrantStore()

		expect(store.list()).toEqual([])
	})
})
