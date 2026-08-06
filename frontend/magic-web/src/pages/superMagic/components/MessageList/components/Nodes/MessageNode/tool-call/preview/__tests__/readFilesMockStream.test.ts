import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type { SuperMagicChunkMessage } from "@/types/chat/intermediate_message"
import mockStream from "@/pages/superMagic/stores/mock_v2.json"
import { getToolRemarkPreviewStrategy } from "../registry"

const CORRELATION_ID = "3c93bb53-a127-4de2-96f5-85c78ef2e87a"
const FILE_PATH_CLOSING_CHUNK_INDEX = 52

describe("read_files remark preview / mock_v2 stream", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("exposes complete canonical arguments when mock_v2 closes the file path", () => {
		const chunks = mockStream.filter(
			(message) =>
				message.type === "super_magic_chunk" &&
				message.super_magic_chunk?.correlation_id === CORRELATION_ID &&
				message.super_magic_chunk.i <= FILE_PATH_CLOSING_CHUNK_INDEX,
		) as unknown as SuperMagicChunkMessage[]
		const topicId = String(chunks[0]?.topic_id || "")
		const store = new SuperMagicStore()
		const parser = getToolRemarkPreviewStrategy("read_files")?.createParser()

		store.setActiveTopicId(topicId)
		chunks.forEach((chunk) => {
			store.receiveChunk(chunk, { persist: false })
		})

		const canonicalArguments =
			store.getStreamState(topicId, CORRELATION_ID)?.tool_calls[0]?.function.arguments || ""
		expect(canonicalArguments).toContain('"file_path": "中国未来发展规划.md"')
		expect(parser?.parse(canonicalArguments)).toEqual({
			status: "resolved",
			value: "中国未来发展规划.md",
		})
	})
})
