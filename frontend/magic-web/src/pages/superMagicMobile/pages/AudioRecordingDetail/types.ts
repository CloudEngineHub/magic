import type {
	MagicProjectConfig as CommonMagicProjectConfig,
	RecordingDetailFileRef as CommonRecordingDetailFileRef,
	RecordingDetailFileMap as CommonRecordingDetailFileMap,
	RecordingTranscriptSegment as CommonRecordingTranscriptSegment,
	RecordingTopicItem as CommonRecordingTopicItem,
	RecordingTopicSection as CommonRecordingTopicSection,
	LoadedRecordingTextFile as CommonLoadedRecordingTextFile,
	RecordingSummaryType as CommonRecordingSummaryType,
} from "@/pages/superMagic/pages/AudioRecordings/types/recording-detail"

export type MobileRecordingTopTab = "source" | "summary" | "ai"
export type MobileRecordingSourceTab = "transcript" | "notes"

export type MobileRecordingSummaryType = CommonRecordingSummaryType
export type MagicProjectConfig = CommonMagicProjectConfig
export type RecordingDetailFileRef = CommonRecordingDetailFileRef
export type RecordingDetailFileMap = CommonRecordingDetailFileMap
export type RecordingTranscriptSegment = CommonRecordingTranscriptSegment
export type RecordingTopicItem = CommonRecordingTopicItem
export type RecordingTopicSection = CommonRecordingTopicSection
export type LoadedRecordingTextFile = CommonLoadedRecordingTextFile
