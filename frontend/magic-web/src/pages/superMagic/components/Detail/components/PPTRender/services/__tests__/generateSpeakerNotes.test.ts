import { beforeEach, describe, expect, it, vi } from "vitest"
import { generateSpeakerNotes, extractSpeakerNotesContext } from "../generateSpeakerNotes"
import { aiLLMService } from "@/services/ai"
vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModelListByMode: () => [{ model_id: "available-model" }],
		fetchDefaultModeModelList: vi.fn(),
	},
}))
vi.mock("@/services/ai", () => ({ aiLLMService: { chat: vi.fn() } }))
const input = () => ({
	action: "polish" as const,
	notes: "原稿",
	rawContent: "<main>业务进展</main>",
	signal: new AbortController().signal,
})
beforeEach(() => vi.mocked(aiLLMService.chat).mockReset())
describe("speaker notes generation", () => {
	it("sends a single request with bounded slide text and the unsaved draft", async () => {
		vi.mocked(aiLLMService.chat).mockResolvedValue({ content: "更新后的讲稿" })
		expect(await generateSpeakerNotes(input())).toBe("更新后的讲稿")
		expect(aiLLMService.chat).toHaveBeenCalledTimes(1)
		expect(vi.mocked(aiLLMService.chat).mock.calls[0][1]?.model).toBe("available-model")
		expect(JSON.parse(vi.mocked(aiLLMService.chat).mock.calls[0][0][0].content)).toEqual({
			slideText: "业务进展",
			notes: "原稿",
		})
	})
	it("excludes scripts, styles, hidden content and stored notes", () => {
		expect(
			extractSpeakerNotesContext(
				"<main>Visible</main><script>secret</script><style>style</style><template>notes</template><p hidden>hidden</p>",
			),
		).toBe("Visible")
	})
	it.each(["", "   ", "<script>alert(1)</script>", "x".repeat(20001)])(
		"rejects invalid responses without retry",
		async (content) => {
			vi.mocked(aiLLMService.chat).mockResolvedValue({ content })
			await expect(generateSpeakerNotes(input())).rejects.toThrow(
				"Invalid speaker notes response",
			)
			expect(aiLLMService.chat).toHaveBeenCalledTimes(1)
		},
	)
	it("does not request after cancellation", async () => {
		const controller = new AbortController()
		controller.abort()
		await expect(
			generateSpeakerNotes({ ...input(), signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" })
		expect(aiLLMService.chat).not.toHaveBeenCalled()
	})
})
