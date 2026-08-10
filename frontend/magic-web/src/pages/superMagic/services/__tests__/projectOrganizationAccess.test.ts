import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { interfaceStore } from "@/stores/interface"
import type { User } from "@/types/user"
import {
	findProjectOrganizationTarget,
	resolveRequiredProjectOrganizationCode,
	suppressProjectOrganizationAccessCheckForCurrentRoute,
} from "../projectOrganizationAccess"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getProjectAccessibility: vi.fn(),
	},
}))

function createAccount(magicId: string, organizations: User.MagicOrganization[]): User.UserAccount {
	return {
		magic_id: magicId,
		organizations,
		access_token: "",
		avatar: "",
		deployCode: "",
		magic_user_id: "",
		nickname: magicId,
		organizationCode: "",
		teamshareOrganizations: [],
	}
}

function createOrganization(code: string): User.MagicOrganization {
	return {
		magic_organization_code: code,
		magic_user_id: `${code}-user`,
		organization_name: code,
		organization_logo: [],
		is_admin: false,
		is_application_admin: false,
		is_complete_info: true,
		state_code: "",
		identifications: [],
		creator_id: "",
		is_personal_organization: false,
		active_count: 0,
	}
}

describe("resolveRequiredProjectOrganizationCode", () => {
	beforeEach(() => {
		vi.mocked(SuperMagicApi.getProjectAccessibility).mockReset()
		sessionStorage.clear()
		interfaceStore.setIsSwitchingOrganization(false)
		window.history.replaceState(null, "", "/global/super/project-1/topic-1")
	})

	it("returns the target organization when the accessible project belongs elsewhere", async () => {
		vi.mocked(SuperMagicApi.getProjectAccessibility).mockResolvedValue({
			project_id: 123,
			required_magic_organization_code: "TARGET",
		})

		await expect(
			resolveRequiredProjectOrganizationCode({
				projectId: "123",
				currentOrganizationCode: "CURRENT",
				requestOptions: { skipAppInitWait: true },
			}),
		).resolves.toBe("TARGET")

		expect(SuperMagicApi.getProjectAccessibility).toHaveBeenCalledWith("123", {
			skipAppInitWait: true,
		})
	})

	it("preserves normal project initialization when no organization switch is required", async () => {
		vi.mocked(SuperMagicApi.getProjectAccessibility)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				project_id: 123,
				required_magic_organization_code: "CURRENT",
			})
			.mockRejectedValueOnce(new Error("unavailable"))

		const params = {
			projectId: "123",
			currentOrganizationCode: "CURRENT",
		}

		await expect(resolveRequiredProjectOrganizationCode(params)).resolves.toBeNull()
		await expect(resolveRequiredProjectOrganizationCode(params)).resolves.toBeNull()
		await expect(resolveRequiredProjectOrganizationCode(params)).resolves.toBeNull()
	})

	it("does not run accessibility detection during an organization-switch reload", async () => {
		interfaceStore.setIsSwitchingOrganization(true)
		suppressProjectOrganizationAccessCheckForCurrentRoute()

		await expect(
			resolveRequiredProjectOrganizationCode({
				projectId: "project-1",
				currentOrganizationCode: "CURRENT",
			}),
		).resolves.toBeNull()

		expect(SuperMagicApi.getProjectAccessibility).not.toHaveBeenCalled()
	})

	it("still detects accessibility when the same URL is opened directly", async () => {
		vi.mocked(SuperMagicApi.getProjectAccessibility).mockResolvedValue({
			project_id: "project-1",
			required_magic_organization_code: "TARGET",
		})
		suppressProjectOrganizationAccessCheckForCurrentRoute()

		await expect(
			resolveRequiredProjectOrganizationCode({
				projectId: "project-1",
				currentOrganizationCode: "CURRENT",
			}),
		).resolves.toBe("TARGET")

		expect(SuperMagicApi.getProjectAccessibility).toHaveBeenCalledOnce()
	})

	it("resolves the target organization from the current account", () => {
		const accountA = createAccount("account-a", [createOrganization("org-a")])
		const accountB = createAccount("account-b", [createOrganization("org-a")])

		expect(
			findProjectOrganizationTarget([accountA, accountB], "org-a", "account-b")?.account
				.magic_id,
		).toBe("account-b")
	})

	it("does not fall back to another account", () => {
		const accountA = createAccount("account-a", [createOrganization("org-a")])
		const accountB = createAccount("account-b", [createOrganization("org-b")])

		expect(findProjectOrganizationTarget([accountA, accountB], "org-a", "account-b")).toBeNull()
	})
})
