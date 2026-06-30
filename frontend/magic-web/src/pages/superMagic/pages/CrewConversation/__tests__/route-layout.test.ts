import { describe, expect, it } from "vitest"
import {
	getCrewConversationRouteOrganizationCode,
	shouldForceMobileCrewConversation,
} from "../route-layout"

describe("shouldForceMobileCrewConversation", () => {
	it.each(["?view=mobile", "?layout=mobile", "?mobile=1", "?mobile=true", "?view=Mobile"])(
		"forces mobile layout for %s",
		(search) => {
			expect(shouldForceMobileCrewConversation(search)).toBe(true)
		},
	)

	it.each(["", "?view=desktop", "?layout=desktop", "?mobile=0", "?mobile=false"])(
		"does not force mobile layout for %s",
		(search) => {
			expect(shouldForceMobileCrewConversation(search)).toBe(false)
		},
	)
})

describe("getCrewConversationRouteOrganizationCode", () => {
	it.each([
		"?organizationCode=magic-org-1",
		"?organization_code=magic-org-1",
		"?orgCode=magic-org-1",
		"?org_code=magic-org-1",
		"?magicOrganizationCode=magic-org-1",
		"?magic_organization_code=magic-org-1",
	])("reads magic organization code from %s", (search) => {
		expect(getCrewConversationRouteOrganizationCode(search)).toBe("magic-org-1")
	})

	it("trims empty values and preserves unrelated params", () => {
		expect(
			getCrewConversationRouteOrganizationCode(
				"?view=mobile&organizationCode=%20magic-org-1%20",
			),
		).toBe("magic-org-1")
	})

	it("does not read teamshare organization params", () => {
		expect(
			getCrewConversationRouteOrganizationCode("?teamshareOrganizationCode=teamshare-1"),
		).toBeNull()
	})
})
