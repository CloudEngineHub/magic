import { Application, createEncoder } from "libopus-wasm"
import { AudioEncodingError } from "../types/RecorderErrors"
import type {
	AudioChunkData,
	EncodedAudioChunk,
	OpusPacket,
	RecordingEncodingFormat,
} from "../types/RecorderTypes"
import type { AudioEncoder } from "./AudioEncoder"
import { calculateOpusEndTrim48k, OGG_OPUS_MIME_TYPE, OggOpusMuxer } from "./OggOpusMuxer"
import { normalizePcm } from "../utils/PcmNormalizer"

const TARGET_SAMPLE_RATE = 16000
const TARGET_CHANNELS = 1
const FRAME_SAMPLES = 320
const FRAME_DURATION_US = 20_000
const DEFAULT_TARGET_BITRATE = 32_000

/** Encode normalized PCM with libopus-wasm and wrap its packets in Ogg. */
export class WasmOpusEncoder implements AudioEncoder {
	private preSkip48k = 0
	private opusHead: Uint8Array | null = null

	constructor(private readonly targetBitrate: number = DEFAULT_TARGET_BITRATE) {}

	/** Load the bundled WASM module and run one real packet smoke encode. */
	async initialize(): Promise<void> {
		if (this.opusHead) return

		let encoder: Awaited<ReturnType<typeof createEncoder>> | null = null
		try {
			encoder = await createEncoder({
				application: Application.Audio,
				channels: TARGET_CHANNELS,
				sampleRate: TARGET_SAMPLE_RATE,
				bitrate: this.targetBitrate,
				frameSize: FRAME_SAMPLES,
				vbr: false,
			})
			this.preSkip48k = encoder.getLookahead() * 3
			this.opusHead = createOpusHead(this.preSkip48k)
			const smokePacket = encoder.encode(new Int16Array(FRAME_SAMPLES))
			if (smokePacket.byteLength === 0)
				throw new Error("WASM smoke encode returned an empty packet")
		} catch (error) {
			await this.close()
			throw new AudioEncodingError("Failed to initialize WASM Opus encoder", error as Error)
		} finally {
			encoder?.free()
		}
	}

	/** Encode one PCM chunk into a complete independent Ogg/Opus file. */
	async encode(chunkData: AudioChunkData): Promise<EncodedAudioChunk> {
		if (!this.opusHead) {
			throw new AudioEncodingError("WASM Opus encoder is not initialized", new Error())
		}

		let encoder: Awaited<ReturnType<typeof createEncoder>> | null = null
		try {
			encoder = await createEncoder({
				application: Application.Audio,
				channels: TARGET_CHANNELS,
				sampleRate: TARGET_SAMPLE_RATE,
				bitrate: this.targetBitrate,
				frameSize: FRAME_SAMPLES,
				vbr: false,
			})
			const activeEncoder = encoder
			if (!activeEncoder) throw new Error("WASM Opus encoder failed to initialize")
			const normalizedPcm = normalizePcm(
				chunkData.pcmData,
				chunkData.sampleRate,
				TARGET_SAMPLE_RATE,
			)
			const endTrim48k = calculateOpusEndTrim48k(normalizedPcm.length, FRAME_SAMPLES)
			const muxer = new OggOpusMuxer({
				inputSampleRate: TARGET_SAMPLE_RATE,
				channels: TARGET_CHANNELS,
				preSkip48k: this.preSkip48k,
				endTrim48k,
				opusHead: this.opusHead,
			})

			const frameCount = Math.max(1, Math.ceil(normalizedPcm.length / FRAME_SAMPLES))
			for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
				const frame = new Int16Array(FRAME_SAMPLES)
				frame.set(
					normalizedPcm.subarray(
						frameIndex * FRAME_SAMPLES,
						(frameIndex + 1) * FRAME_SAMPLES,
					),
				)
				const packet = activeEncoder.encode(frame)
				const opusPacket: OpusPacket = {
					data: packet,
					timestampUs: frameIndex * FRAME_DURATION_US,
					durationUs: FRAME_DURATION_US,
				}
				muxer.addPacket(opusPacket)
			}

			const data = muxer.finalize()
			return { data, mimeType: OGG_OPUS_MIME_TYPE, size: data.byteLength }
		} catch (error) {
			throw new AudioEncodingError(
				"Failed to encode audio to Ogg Opus with WASM",
				error as Error,
			)
		} finally {
			encoder?.free()
		}
	}

	/** The libopus wrapper completes each frame synchronously. */
	flush(): Promise<void> {
		return Promise.resolve()
	}

	/** Release WASM memory after the session ends or startup fails. */
	async close(): Promise<void> {
		this.opusHead = null
	}

	/** Return the MIME type used by the upload contract. */
	getMimeType(): string {
		return OGG_OPUS_MIME_TYPE
	}

	/** Return the stable format identifier stored with each chunk. */
	getFormat(): RecordingEncodingFormat {
		return "ogg-opus"
	}
}

/** Build the minimal mono OpusHead matching the libopus encoder delay. */
function createOpusHead(preSkip48k: number): Uint8Array {
	const header = new Uint8Array(19)
	new TextEncoder().encodeInto("OpusHead", header)
	const view = new DataView(header.buffer)
	view.setUint8(8, 1)
	view.setUint8(9, TARGET_CHANNELS)
	view.setUint16(10, preSkip48k, true)
	view.setUint32(12, TARGET_SAMPLE_RATE, true)
	view.setInt16(16, 0, true)
	view.setUint8(18, 0)
	return header
}
