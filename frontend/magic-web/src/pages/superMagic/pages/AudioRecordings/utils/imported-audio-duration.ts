import { getAudioDuration } from "@/utils/audio"

const IMPORTED_AUDIO_DURATION_TIMEOUT_MS = 3_000

/**
 * Wraps the shared audio duration reader with import-specific timeout and validation rules.
 * Browser import should prefer a real duration, but must fall back to zero instead of blocking upload.
 */
export async function resolveImportedAudioDuration(file: File): Promise<number> {
	try {
		const duration = await Promise.race([
			getAudioDuration(file),
			createImportedAudioDurationTimeout(),
		])

		// Treat invalid or zero-like metadata as unavailable so the backend backfill path stays authoritative.
		if (!Number.isFinite(duration) || duration <= 0) {
			return 0
		}

		// Import-files expects whole seconds, so browser metadata must be normalized before submission.
		return Math.floor(duration)
	} catch {
		return 0
	}
}

/**
 * Ensures metadata probing cannot hold the import flow open indefinitely on problematic media files.
 */
function createImportedAudioDurationTimeout(): Promise<number> {
	return new Promise((resolve) => {
		globalThis.setTimeout(() => {
			resolve(0)
		}, IMPORTED_AUDIO_DURATION_TIMEOUT_MS)
	})
}
