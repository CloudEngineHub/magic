import type { FileShareUiConfig } from "../types"
import { AUDIO_PROJECT_MODE } from "@/services/audioRecordings/audioProjectMode"

/**
 * Returns the canonical recording-share UI policy so every entry point uses the same affordances.
 */
export function createRecordingShareUiConfig(): FileShareUiConfig {
	return {
		projectMode: AUDIO_PROJECT_MODE,
		hideShareProjectToggle: true,
		hideShowFileListSetting: true,
		forceViewFileList: false,
		showSelectAll: false,
		lockShareProject: true,
		useRecordingShareCreateTitle: true,
	}
}
