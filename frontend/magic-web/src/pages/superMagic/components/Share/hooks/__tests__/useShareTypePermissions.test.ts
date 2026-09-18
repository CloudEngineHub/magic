import { describe, expect, it } from "vitest"
import { ShareType } from "../../types"
import { getPermittedShareTypes } from "../useShareTypePermissions"

describe("getPermittedShareTypes", () => {
	it("maps project permissions to their share types", () => {
		expect(
			getPermittedShareTypes(
				{
					"project.share_password": true,
					"project.share_public": false,
					"project.share_team": true,
				},
				"project",
			),
		).toEqual([ShareType.PasswordProtected, ShareType.Organization])
	})

	it("does not mix micro app and project permissions", () => {
		expect(
			getPermittedShareTypes(
				{
					"micro_app.share_public": true,
					"project.share_password": true,
				},
				"microApp",
			),
		).toEqual([ShareType.Public])
	})

	it("fails closed while permissions are unavailable", () => {
		expect(getPermittedShareTypes(undefined, "project")).toEqual([])
	})
})
