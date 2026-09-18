import { track } from "@/services/analytics"

export type RecordingAnalyticsSource = "pc" | "h5"
export type RecordingAnalyticsAudioSource = "recorded" | "imported"

export function resolveRecordingAnalyticsSource(isMobile: boolean): RecordingAnalyticsSource {
	return isMobile ? "h5" : "pc"
}

export function createAiRecordingStartedReporter(
	getSource: () => RecordingAnalyticsSource,
): (options: {
	projectId: string
	audioSource: RecordingAnalyticsAudioSource
	transcriptionEnabled: boolean
}) => void {
	const reportedProjectIds = new Set<string>()

	return function reportAiRecordingStartedOnce(options: {
		projectId: string
		audioSource: RecordingAnalyticsAudioSource
		transcriptionEnabled: boolean
	}): void {
		const projectId = options.projectId.trim()
		if (!projectId) return
		if (reportedProjectIds.has(projectId)) return

		reportedProjectIds.add(projectId)

		try {
			track("ai_recording_started", {
				project_id: projectId,
				source: getSource(),
				audio_source: options.audioSource,
				transcription_enabled: options.transcriptionEnabled,
			})
		} catch (error) {
			console.warn("ai_recording_started observer failed:", error)
		}
	}
}
