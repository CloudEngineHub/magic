import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { interfaceStore } from "@/stores/interface"
import {
	resolveRequiredProjectOrganizationCode,
	suppressProjectOrganizationAccessCheckForCurrentRoute,
} from "../projectOrganizationAccess"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getProjectAccessibility: vi.fn(),
	},
}))

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
})
