export const UPLOAD_PROGRESS_UPDATE_INTERVAL_MS = 200

export function normalizeUploadProgress(progress: unknown): number | undefined {
	if (typeof progress !== "number" || !Number.isFinite(progress)) return undefined
	return Math.min(100, Math.max(0, progress))
}

export function toDisplayUploadProgress(progress: unknown): number | undefined {
	const normalizedProgress = normalizeUploadProgress(progress)
	return normalizedProgress === undefined ? undefined : Math.round(normalizedProgress)
}
