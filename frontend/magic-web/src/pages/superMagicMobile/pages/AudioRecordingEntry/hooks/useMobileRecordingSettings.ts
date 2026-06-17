import {
	useRecordingSettings,
	getCachedRecordingSettings,
	resetRecordingSettingsCacheForTests,
	seedRecordingSettingsCacheForTests,
} from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingSettings"

export {
	useRecordingSettings as useMobileRecordingSettings,
	getCachedRecordingSettings as getCachedMobileRecordingSettings,
	resetRecordingSettingsCacheForTests as resetMobileRecordingSettingsCacheForTests,
	seedRecordingSettingsCacheForTests as seedMobileRecordingSettingsCacheForTests,
}
