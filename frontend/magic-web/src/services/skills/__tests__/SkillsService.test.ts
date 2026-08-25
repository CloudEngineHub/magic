import { beforeEach, describe, expect, it, vi } from "vitest"
import { SkillsApi } from "@/apis"
import { SkillsService } from "../SkillsService"

vi.mock("@/apis", () => ({
	SkillsApi: {
		getStoreSkills: vi.fn(),
		getUserSkills: vi.fn(),
		getSkillLastVersions: vi.fn(),
	},
}))

const service = new SkillsService()

describe("SkillsService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("uses resolved fields for store skill lists", async () => {
		vi.mocked(SkillsApi.getStoreSkills).mockResolvedValue({
			list: [
				{
					id: "market-1",
					skill_code: "skill-code",
					name: "Resolved name",
					description: "Resolved description",
					name_i18n: {
						default: "Legacy name",
						en_US: "Legacy name",
						zh_CN: "旧名称",
					},
					description_i18n: {
						default: "Legacy description",
						en_US: "Legacy description",
						zh_CN: "旧描述",
					},
					logo: "logo.png",
					publisher_type: "OFFICIAL",
					publisher: { name: "Magic", avatar: "" },
					publish_status: "PUBLISHED",
					is_added: false,
					need_upgrade: false,
					created_at: "2026-08-25T09:00:00Z",
					updated_at: "2026-08-25T10:00:00Z",
				},
			],
			page: 1,
			page_size: 20,
			total: 1,
		})

		const result = await service.getStoreSkills()

		expect(result.list[0]).toMatchObject({
			name: "Resolved name",
			description: "Resolved description",
		})
	})

	it("uses resolved fields for user skill lists instead of legacy i18n values", async () => {
		vi.mocked(SkillsApi.getUserSkills).mockResolvedValue({
			list: [
				{
					id: "skill-1",
					code: "skill-code",
					name: "Resolved name",
					description: "Resolved description",
					name_i18n: {
						default: "Legacy name",
						en_US: "Legacy name",
						zh_CN: "旧名称",
					},
					description_i18n: {
						default: "Legacy description",
						en_US: "Legacy description",
						zh_CN: "旧描述",
					},
					logo: "logo.png",
					source_type: "LOCAL_UPLOAD",
					is_enabled: 1,
					pinned_at: null,
					updated_at: "2026-08-25T10:00:00Z",
					created_at: "2026-08-25T09:00:00Z",
				},
			],
			page: 1,
			page_size: 20,
			total: 1,
		})

		const result = await service.getCreatedSkills()

		expect(result.list[0]).toMatchObject({
			name: "Resolved name",
			description: "Resolved description",
		})
		expect(result.list[0]?.nameI18n).toEqual({
			default: "Legacy name",
			en_US: "Legacy name",
			zh_CN: "旧名称",
		})
	})

	it("keeps edit payload compatibility when legacy i18n fields are absent", async () => {
		vi.mocked(SkillsApi.getUserSkills).mockResolvedValue({
			list: [
				{
					id: "skill-1",
					code: "skill-code",
					name: "Resolved name",
					description: "Resolved description",
					logo: "logo.png",
					source_type: "LOCAL_UPLOAD",
					is_enabled: 1,
					pinned_at: null,
					updated_at: "2026-08-25T10:00:00Z",
					created_at: "2026-08-25T09:00:00Z",
				},
			],
			page: 1,
			page_size: 20,
			total: 1,
		})

		const result = await service.getCreatedSkills()

		expect(result.list[0]?.nameI18n).toEqual({
			default: "Resolved name",
			en_US: "Resolved name",
			zh_CN: "Resolved name",
		})
		expect(result.list[0]?.descriptionI18n).toEqual({
			default: "Resolved description",
			en_US: "Resolved description",
			zh_CN: "Resolved description",
		})
	})

	it("uses resolved fields for latest published skill lists", async () => {
		vi.mocked(SkillsApi.getSkillLastVersions).mockResolvedValue({
			list: [
				{
					id: "version-1",
					code: "skill-code",
					version: "1.0.0",
					name: "Resolved name",
					description: "Resolved description",
					name_i18n: {
						default: "Legacy name",
						en_US: "Legacy name",
						zh_CN: "旧名称",
					},
					description_i18n: {
						default: "Legacy description",
						en_US: "Legacy description",
						zh_CN: "旧描述",
					},
					logo: "logo.png",
					file_key: null,
					file_url: null,
					source_type: "LOCAL_UPLOAD",
					publish_status: "PUBLISHED",
					review_status: "APPROVED",
					publish_target_type: "PRIVATE",
					published_at: "2026-08-25T10:00:00Z",
					project_id: null,
					created_at: "2026-08-25T09:00:00Z",
					updated_at: "2026-08-25T10:00:00Z",
				},
			],
			page: 1,
			page_size: 20,
			total: 1,
		})

		const result = await service.getLatestPublishedSkills()

		expect(result.list[0]).toMatchObject({
			name: "Resolved name",
			description: "Resolved description",
		})
	})
})
