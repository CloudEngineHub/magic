import { describe, expect, it, vi } from "vitest"
import type { HttpClient } from "@/apis/core/HttpClient"
import { generateSkillsApi } from "../skills"

describe("generateSkillsApi", () => {
	it("includes empty skill-market categories by default", async () => {
		const get = vi.fn().mockResolvedValue({ list: [] })
		const api = generateSkillsApi({ get } as unknown as HttpClient)

		await api.getSkillMarketCategories()

		expect(get).toHaveBeenCalledWith("/api/v1/skill-market/categories?include_empty=true")
	})

	it("uses the admin endpoint for official Skill parsing", async () => {
		const post = vi.fn().mockResolvedValue({})
		const api = generateSkillsApi({ post } as unknown as HttpClient)

		await api.parseOfficialSkillFile({ file_key: "org/skills/demo.zip" })

		expect(post).toHaveBeenCalledWith("/api/v1/admin/official-skills/import/parse/file", {
			file_key: "org/skills/demo.zip",
		})
	})

	it("supports token and file-key official Skill import modes", async () => {
		const post = vi.fn().mockResolvedValue({})
		const api = generateSkillsApi({ post } as unknown as HttpClient)
		const fields = {
			version: "1.0.0",
			name_i18n: { default: "Demo", en_US: "Demo", zh_CN: "演示" },
			description_i18n: { default: "Description", en_US: "Description", zh_CN: "描述" },
		}

		await api.importOfficialSkill({ import_token: "token", ...fields })
		await api.importOfficialSkill({ file_key: "org/skills/demo.zip", ...fields })

		expect(post).toHaveBeenNthCalledWith(1, "/api/v1/admin/official-skills/import", {
			import_token: "token",
			...fields,
		})
		expect(post).toHaveBeenNthCalledWith(2, "/api/v1/admin/official-skills/import", {
			file_key: "org/skills/demo.zip",
			...fields,
		})
	})
})
