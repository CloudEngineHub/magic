import { describe, expect, it } from "vitest"
import promptExampleData from "../microAppPromptExamples.json"

describe("microAppPromptExamples", () => {
	it("keeps 60 unique examples with Chinese and English text", () => {
		expect(promptExampleData.examples).toHaveLength(60)
		expect(new Set(promptExampleData.examples.map((example) => example.id)).size).toBe(60)
		expect(
			promptExampleData.examples.every(
				(example) => example.text.zh_CN.trim() && example.text.en_US.trim(),
			),
		).toBe(true)
	})
})
