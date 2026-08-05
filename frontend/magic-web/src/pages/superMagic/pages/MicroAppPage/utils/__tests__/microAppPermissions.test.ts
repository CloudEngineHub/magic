import { describe, expect, it } from "vitest"

import { canEditMicroAppMetadata, canPublishMicroApp } from "../microAppPermissions"

describe("canEditMicroAppMetadata", () => {
	it.each(["owner", "manage", "editor"] as const)("allows the %s role", (user_role) => {
		expect(canEditMicroAppMetadata({ id: "project-1", user_role })).toBe(true)
	})

	it("allows a project without explicit role metadata", () => {
		expect(canEditMicroAppMetadata({ id: "project-1" })).toBe(true)
	})

	it("keeps viewers read-only", () => {
		expect(canEditMicroAppMetadata({ id: "project-1", user_role: "viewer" })).toBe(false)
	})

	it("requires a resolved project", () => {
		expect(canEditMicroAppMetadata(null)).toBe(false)
	})
})

describe("canPublishMicroApp", () => {
	it.each(["owner", "manage"] as const)("allows the %s role", (user_role) => {
		expect(canPublishMicroApp({ id: "project-1", user_role })).toBe(true)
	})

	it("allows a project without explicit role metadata", () => {
		expect(canPublishMicroApp({ id: "project-1" })).toBe(true)
	})

	it.each(["editor", "viewer", "collaborator"] as const)("rejects the %s role", (user_role) => {
		expect(canPublishMicroApp({ id: "project-1", user_role })).toBe(false)
	})

	it("requires a resolved project", () => {
		expect(canPublishMicroApp(null)).toBe(false)
	})
})
