import { describe, expect, it } from "vitest"
import { hasManageableHtmlPermissionDeclarations } from "../htmlPermissionDeclarations"

describe("hasManageableHtmlPermissionDeclarations", () => {
	it("returns false without app.json permissions", () => {
		expect(hasManageableHtmlPermissionDeclarations(null)).toBe(false)
		expect(hasManageableHtmlPermissionDeclarations({})).toBe(false)
		expect(hasManageableHtmlPermissionDeclarations({ permissions: { scopes: [] } })).toBe(false)
	})

	it("returns false for malformed or display-only declarations", () => {
		expect(
			hasManageableHtmlPermissionDeclarations({
				permissions: { scopes: "llm.use" as never },
			}),
		).toBe(false)
		expect(
			hasManageableHtmlPermissionDeclarations({
				permissions: { userInfo: { scopes: ["user.profile.display"] } },
			}),
		).toBe(false)
	})

	it("returns true for supported permission declarations", () => {
		expect(
			hasManageableHtmlPermissionDeclarations({
				permissions: { scopes: ["llm.use"] },
			}),
		).toBe(true)
		expect(
			hasManageableHtmlPermissionDeclarations({
				permissions: { userInfo: { scopes: ["user.profile.identity"] } },
			}),
		).toBe(true)
		expect(
			hasManageableHtmlPermissionDeclarations({
				permissions: { scopes: ["llm.use", "future.scope"] as never },
			}),
		).toBe(true)
	})

	it("returns false when the app only declares unregistered permissions", () => {
		expect(
			hasManageableHtmlPermissionDeclarations({
				permissions: { scopes: ["future.scope"] as never },
			}),
		).toBe(false)
	})
})
