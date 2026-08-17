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
})
