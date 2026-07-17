import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { RecordingDetailCapabilities } from "../types/recording-detail-capabilities"
import type { MagicProjectConfig } from "../types/recording-detail"

interface ShareAttachmentSnapshot {
	tree?: AttachmentItem[]
	list?: AttachmentItem[]
}

export interface ShareRecordingDisplayConfig extends Partial<MagicProjectConfig> {
	metadata?: MagicProjectConfig["metadata"]
	files?: Record<string, string>
}

interface BuildShareRecordingMagicProjectConfigInput {
	magicProjectConfig?: MagicProjectConfig | null
	audioDisplayConfig?: ShareRecordingDisplayConfig | null
}

/** Keeps the share route check explicit so audio-only branching never depends on truthy string coercion. */
export function isAudioProjectMode(projectMode: unknown): boolean {
	return projectMode === "audio"
}

/** Prevents the audio share shell from mounting before the share route has both audio mode and share files. */
export function shouldRenderAudioRecordingShareShell(input: {
	projectMode: unknown
	attachments?: ShareAttachmentSnapshot | null
}): boolean {
	const { projectMode, attachments } = input
	if (!isAudioProjectMode(projectMode)) return false

	return Boolean(attachments?.tree?.length || attachments?.list?.length)
}

/** Derives a read-only capability matrix and only opens export when the share permission allows downloads. */
export function buildShareRecordingCapabilities(
	allowDownloadProjectFile: boolean,
): RecordingDetailCapabilities {
	return {
		viewMode: "share",
		canRename: false,
		canDelete: false,
		canMoveGroup: false,
		canGenerateSummary: false,
		canManageShare: false,
		canCopyToProject: false,
		canExport: allowDownloadProjectFile,
		canEditSpeakers: false,
		visibleTabKeys: [
			"summary",
			"topics",
			"highlights",
			"insights",
			"mindmap",
			"metrics",
			"followup",
			"power_dynamics",
			"intent",
			"notes",
		],
	}
}

/** Prefers parsed magic.project.js metadata and falls back to directory display_config metadata when the file is absent. */
export function buildShareRecordingMagicProjectConfig(
	input: BuildShareRecordingMagicProjectConfigInput,
): MagicProjectConfig | null {
	const { magicProjectConfig, audioDisplayConfig } = input
	if (magicProjectConfig) return magicProjectConfig
	if (!audioDisplayConfig) return null

	return {
		version: audioDisplayConfig.version,
		type: audioDisplayConfig.type,
		name: audioDisplayConfig.name,
		files: audioDisplayConfig.files,
		metadata: audioDisplayConfig.metadata,
	}
}
