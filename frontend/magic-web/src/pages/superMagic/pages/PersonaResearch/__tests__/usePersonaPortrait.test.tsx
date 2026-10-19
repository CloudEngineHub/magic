import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { usePersonaPortrait } from "../hooks/usePersonaPortrait"

const mocks = vi.hoisted(() => ({
	files: [] as AttachmentItem[],
	local: null as null | { personaById: () => undefined; attachmentList: AttachmentItem[] },
	api: { identityKey: "session:1", getFileContentById: vi.fn() },
}))
vi.mock("../context", () => ({ useOptionalPersonaResearchStore: () => mocks.local }))
vi.mock("@/pages/superMagic/components/MessageList/context", () => ({
	useMessageListProjectFilesStore: () => ({ workspaceFilesList: mocks.files }),
}))
vi.mock("@/pages/superMagic/fileAccess/fileApi", () => ({ useFileApi: () => mocks.api }))
vi.mock("@/pages/superMagic/services/sharedMediaResourceScope", () => ({
	useSharedMediaResourceScope: () => "org:test|user:test",
}))

const id = "p_one_a123"
const portrait = `personas/portraits/${id}/01234567890123456789.webp`
const persona = (file = portrait) =>
	JSON.stringify({
		schema_version: 1,
		id,
		name: "Same name",
		tier: "generated",
		portrait: { file, updated_at: "2026-10-20T01:00:00+08:00" },
	})
let scope = 0

describe("current persona avatar identity", () => {
	beforeEach(() => {
		mocks.local = null
		mocks.api.identityKey = `session:${++scope}`
		mocks.api.getFileContentById.mockReset().mockResolvedValue(persona())
		mocks.files = [
			{ file_id: "profile", relative_file_path: `personas/${id}.json`, updated_at: "v1" },
			{ file_id: "photo", relative_file_path: portrait, updated_at: "v1" },
		]
	})

	it("historical tool cards coalesce reads of the current profile and resolve the same file", async () => {
		const { result: first } = renderHook(() => usePersonaPortrait(id))
		const { result: second } = renderHook(() => usePersonaPortrait(id))
		await waitFor(() => expect(first.current.image?.file_id).toBe("photo"))
		await waitFor(() => expect(second.current.image?.file_id).toBe("photo"))
		expect(mocks.api.getFileContentById).toHaveBeenCalledTimes(1)
	})

	it("does not resolve an image omitted from the authorized share attachments", async () => {
		mocks.api.identityKey = `share:${scope}`
		mocks.files = mocks.files.slice(0, 1)
		const { result } = renderHook(() => usePersonaPortrait(id))
		await waitFor(() => expect(result.current.persona?.id).toBe(id))
		expect(result.current.image).toBeUndefined()
	})

	it("rejects another persona's image path even when it is in the attachment list", async () => {
		mocks.api.getFileContentById.mockResolvedValue(
			persona("personas/portraits/p_other_a123/photo.webp"),
		)
		const { result } = renderHook(() => usePersonaPortrait(id))
		await waitFor(() => expect(result.current.persona?.id).toBe(id))
		expect(result.current.image).toBeUndefined()
	})

	it("ignores a stale profile request after switching access identity", async () => {
		let finish: (value: string) => void = () => undefined
		mocks.api.getFileContentById.mockImplementationOnce(
			() => new Promise<string>((resolve) => (finish = resolve)),
		)
		const { result, rerender } = renderHook(() => usePersonaPortrait(id))
		mocks.api = { ...mocks.api, identityKey: `share:new-${scope}` }
		mocks.api.getFileContentById.mockResolvedValue("{}")
		rerender()
		finish(persona())
		await waitFor(() => expect(mocks.api.getFileContentById).toHaveBeenCalledTimes(2))
		expect(result.current.image).toBeUndefined()
	})
})
