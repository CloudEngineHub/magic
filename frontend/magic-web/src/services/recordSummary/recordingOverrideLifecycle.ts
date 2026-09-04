export interface ForceOverrideFinalizationSteps {
	stopRecordingServices: () => void | Promise<void>
	flushSessionUploads: () => void | Promise<void>
	summarizeSession: () => void | Promise<void>
	completeSession: () => void | Promise<void>
}

/**
 * A recording session is not completed until its final audio upload, batch-save,
 * and summary operations have settled successfully.
 */
export async function runForceOverrideFinalization(
	steps: ForceOverrideFinalizationSteps,
): Promise<void> {
	await steps.stopRecordingServices()
	await steps.flushSessionUploads()
	await steps.summarizeSession()
	await steps.completeSession()
}
