import { describe, expect, it } from "vitest"
import { calculateOggCrc } from "../../MediaRecorderService/encoders/OggOpusMuxer"
import { WasmOpusEncoder } from "../../MediaRecorderService/encoders/WasmOpusEncoder"
import { mergeOggOpusChunks } from "../OggOpusChainMerger"

interface ParsedPage {
	headerType: number
	serialNumber: number
	payload: Uint8Array
}

/** Read merged Blob bytes in the jsdom runtime used by this package. */
function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
	if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer()
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as ArrayBuffer)
		reader.onerror = () => reject(reader.error)
		reader.readAsArrayBuffer(blob)
	})
}

/** Parse every Ogg page so the test can verify the exported chained stream. */
function parsePages(file: ArrayBuffer): ParsedPage[] {
	const bytes = new Uint8Array(file)
	const pages: ParsedPage[] = []
	let offset = 0
	while (offset < bytes.byteLength) {
		const segmentCount = bytes[offset + 26]
		let payloadLength = 0
		for (let index = 0; index < segmentCount; index++) {
			payloadLength += bytes[offset + 27 + index]
		}
		const pageLength = 27 + segmentCount + payloadLength
		const page = bytes.slice(offset, offset + pageLength)
		const storedCrc = new DataView(page.buffer).getUint32(22, true)
		new DataView(page.buffer).setUint32(22, 0, true)
		expect(calculateOggCrc(page)).toBe(storedCrc)
		pages.push({
			headerType: page[5],
			serialNumber: new DataView(page.buffer).getUint32(14, true),
			payload: page.subarray(27 + segmentCount),
		})
		offset += pageLength
	}
	return pages
}

describe("mergeOggOpusChunks", () => {
	it("re-encodes independent chunks as one continuous Ogg Opus file", async () => {
		const encoder = new WasmOpusEncoder()
		await encoder.initialize()
		const first = await encoder.encode({
			pcmData: new Int16Array(640),
			sampleRate: 16000,
			bitRate: 16,
			duration: 0.04,
		})
		const second = await encoder.encode({
			pcmData: new Int16Array(640),
			sampleRate: 16000,
			bitRate: 16,
			duration: 0.04,
		})

		const merged = await mergeOggOpusChunks([
			new Blob([first.data], { type: first.mimeType }),
			new Blob([second.data], { type: second.mimeType }),
		])
		expect(merged?.type).toBe("audio/ogg; codecs=opus")
		if (!merged) throw new Error("Expected a merged Ogg Opus export")

		const pages = parsePages(await readBlobAsArrayBuffer(merged))
		expect(pages.filter((page) => (page.headerType & 0x02) !== 0)).toHaveLength(1)
		expect(pages.filter((page) => (page.headerType & 0x04) !== 0)).toHaveLength(1)
		expect(new Set(pages.map((page) => page.serialNumber)).size).toBe(1)
		expect(
			pages.filter(
				(page) => String.fromCharCode(...page.payload.subarray(0, 8)) === "OpusHead",
			),
		).toHaveLength(1)
		await encoder.close()
	})
})
