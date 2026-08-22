import { beforeEach, describe, expect, it, vi } from "vitest"
import { SkillsApi } from "@/apis"
import { SkillsService } from "../SkillsService"

vi.mock("@/apis", () => ({
	SkillsApi: {
		getSkillMarketCategories: vi.fn(),
		getStoreSkills: vi.fn(),
		getCreatedSkills: vi.fn(),
		getSkillLastVersions: vi.fn(),
		getSkillDetail: vi.fn(),
	},
}))

const service = new SkillsService()

describe("SkillsService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("uses the resolved name for skill-market categories", async () => {
		vi.mocked(SkillsApi.getSkillMarketCategories).mockResolvedValue({
			list: [
				{
					id: "category-1",
					parent_id: "0",
					name: "Resolved category",
					logo: null,
					sort_order: 1,
					status: 1,
					skill_count: 2,
				},
			],
		})

		const result = await service.getSkillMarketCategories()

		expect(result).toEqual([
			{
				id: "category-1",
				name: "Resolved category",
				logo: undefined,
				sortOrder: 1,
				skillCount: 2,
			},
		])
	})

	it("uses resolved fields for market skill lists", async () => {
		vi.mocked(SkillsApi.getStoreSkills).mockResolvedValue({
			list: [
				{
					id: "store-1",
					code: "skill-code",
					package_name: "skill-package",
					name: "Resolved name",
					description: "Resolved description",
					source: "Resolved source",
					logo: "logo.png",
					publisher_type: "OFFICIAL",
					publisher: {},
					publish_status: "PUBLISHED",
					is_added: false,
					need_upgrade: false,
					created_at: "2026-08-22T09:00:00Z",
					updated_at: "2026-08-22T10:00:00Z",
				},
			],
			page: 1,
			page_size: 20,
		})

		const result = await service.getStoreSkills()

		expect(result.list[0]).toMatchObject({
			name: "Resolved name",
			description: "Resolved description",
			source: "Resolved source",
		})
	})

	it("uses resolved fields for user skill lists instead of legacy i18n values", async () => {
		vi.mocked(SkillsApi.getCreatedSkills).mockResolvedValue({
			list: [
				{
					id: "skill-1",
					code: "skill-code",
					name: "Resolved name",
					description: "Resolved description",
					source: "Resolved source",
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
					updated_at: "2026-08-22T10:00:00Z",
					created_at: "2026-08-22T09:00:00Z",
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
			source: "Resolved source",
		})
		expect(result.list[0]?.nameI18n).toEqual({
			default: "Legacy name",
			en_US: "Legacy name",
			zh_CN: "旧名称",
		})
	})

	it("keeps edit payload compatibility after legacy i18n fields are removed", async () => {
		vi.mocked(SkillsApi.getCreatedSkills).mockResolvedValue({
			list: [
				{
					id: "skill-1",
					code: "skill-code",
					name: "Resolved name",
					description: "Resolved description",
					source: "Resolved source",
					logo: "logo.png",
					source_type: "LOCAL_UPLOAD",
					is_enabled: 1,
					pinned_at: null,
					updated_at: "2026-08-22T10:00:00Z",
					created_at: "2026-08-22T09:00:00Z",
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

	it("uses resolved fields for latest published skills", async () => {
		vi.mocked(SkillsApi.getSkillLastVersions).mockResolvedValue({
			list: [
				{
					id: "skill-1",
					code: "skill-code",
					package_name: "skill-package",
					version: "1.0.0",
					name: "Resolved name",
					description: "Resolved description",
					source: "Resolved source",
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
					published_at: "2026-08-22T10:00:00Z",
					project_id: null,
					created_at: "2026-08-22T09:00:00Z",
					updated_at: "2026-08-22T10:00:00Z",
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
			source: "Resolved source",
		})
	})

	it("uses resolved fields for user skill details", async () => {
		vi.mocked(SkillsApi.getSkillDetail).mockResolvedValue({
			id: "skill-1",
			code: "skill-code",
			version_id: 1,
			version_code: "1.0.0",
			source_type: "LOCAL_UPLOAD",
			is_enabled: 1,
			pinned_at: null,
			name: "Resolved name",
			description: "Resolved description",
			source: "Resolved source",
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
			source_i18n: {
				default: "Legacy source",
				en_US: "Legacy source",
				zh_CN: "旧来源",
			},
			logo: "logo.png",
			package_name: "skill-package",
			package_description: "Package description",
			file_key: "skill.zip",
			file_url: "",
			skill_file_url: "skill.zip",
			source_id: null,
			source_meta: null,
			created_at: "2026-08-22T09:00:00Z",
			updated_at: "2026-08-22T10:00:00Z",
			project_id: null,
		})

		const result = await service.getUserSkillDetailView("skill-code")

		expect(result).toMatchObject({
			name: "Resolved name",
			description: "Resolved description",
			sourceLabel: "Resolved source",
		})
	})
})
