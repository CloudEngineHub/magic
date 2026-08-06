import { describe, expect, it } from "vitest"
import { CollaboratorPermissionEnum } from "../../types/collaboration"
import {
	canEditProject,
	canManageCollaborators,
	canManageProject,
	isReadOnlyProject,
} from "../permission"

describe("project permission capabilities", () => {
	it.each([
		CollaboratorPermissionEnum.OWNER,
		CollaboratorPermissionEnum.MANAGE,
		CollaboratorPermissionEnum.EDITABLE,
	])("allows %s to edit project content", (role) => {
		expect(canEditProject(role)).toBe(true)
		expect(isReadOnlyProject(role)).toBe(false)
	})

	it("keeps viewer read-only", () => {
		expect(isReadOnlyProject(CollaboratorPermissionEnum.READONLY)).toBe(true)
		expect(canEditProject(CollaboratorPermissionEnum.READONLY)).toBe(false)
		expect(canManageProject(CollaboratorPermissionEnum.READONLY)).toBe(false)
		expect(canManageCollaborators(CollaboratorPermissionEnum.READONLY)).toBe(false)
	})

	it.each([CollaboratorPermissionEnum.OWNER, CollaboratorPermissionEnum.MANAGE])(
		"allows %s to manage collaborators",
		(role) => {
			expect(canManageCollaborators(role)).toBe(true)
		},
	)

	it("does not allow editor to manage collaborators", () => {
		expect(canManageCollaborators(CollaboratorPermissionEnum.EDITABLE)).toBe(false)
	})
})
