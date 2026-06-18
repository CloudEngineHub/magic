import i18next from "i18next"
import { Bluetooth, Monitor, Smartphone, Upload, type LucideIcon } from "lucide-react"
import type {
	AudioProjectListItem,
	AudioProjectSortBy,
	AudioProjectSortOrder,
	AudioRecordingSummaryFilter,
	QueryAudioProjectsParams,
} from "@/types/audioProject"
import { formatTime } from "@/utils/string"
import { ALL_RECORDING_GROUP_ID } from "@/services/audioRecordings"
/** Maps UI summary filter to API current_phase values (coarse server-side filter) */
export function resolveSummaryPhaseFilter(
	filter: AudioRecordingSummaryFilter,
): string[] | undefined {
	if (filter === "not_summarized") return ["merging"]
	if (filter === "summarized") return ["summarizing"]
	return undefined
}

/** Applies client-side card_status filter to align tabs with PC-visible states */
export function applyClientSummaryFilter(
	items: AudioProjectListItem[],
	filter: AudioRecordingSummaryFilter,
): AudioProjectListItem[] {
	if (filter === "not_summarized") {
		return items.filter((item) => item.card_status === "not_summarized")
	}
	if (filter === "summarized") {
		return items.filter((item) => item.card_status === "summarized")
	}
	return items
}

/** Builds request payload from store filter state */
export function buildAudioProjectsQueryParams(options: {
	page: number
	pageSize: number
	keyword: string
	summaryFilter: AudioRecordingSummaryFilter
	createdAtStart?: number
	createdAtEnd?: number
	sortBy: AudioProjectSortBy
	sortOrder: AudioProjectSortOrder
	projectIds?: string[]
	workspaceId?: string
}): QueryAudioProjectsParams {
	const params: QueryAudioProjectsParams = {
		page: options.page,
		page_size: options.pageSize,
		is_hidden: 0,
		workspace_id: ALL_RECORDING_GROUP_ID,
		sort_by: options.sortBy,
		sort_order: options.sortOrder,
	}

	const keyword = options.keyword.trim()
	if (keyword) params.keyword = keyword

	const currentPhase = resolveSummaryPhaseFilter(options.summaryFilter)
	if (currentPhase) params.current_phase = currentPhase

	if (options.createdAtStart != null) params.created_at_start = options.createdAtStart
	if (options.createdAtEnd != null) params.created_at_end = options.createdAtEnd
	if (options.projectIds?.length) params.project_ids = options.projectIds
	if (options.workspaceId != null) params.workspace_id = options.workspaceId

	return params
}

/** Formats recording duration in seconds to mm:ss or h:mm:ss */
export function formatRecordingDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "00:00"

	const totalSeconds = Math.floor(seconds)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const remainingSeconds = totalSeconds % 60

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
	}

	return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
}

/** Treat missing summarizing duration as pending instead of a literal zero-length recording. */
export function isRecordingDurationPending(
	item: Pick<AudioProjectListItem, "card_status" | "duration">,
): boolean {
	return (
		item.card_status === "summarizing" &&
		(!Number.isFinite(item.duration) || item.duration <= 0)
	)
}

/** Whether the card should navigate to the summarized HTML detail page */
export function isAudioProjectDetailReady(item: AudioProjectListItem): boolean {
	return item.card_status === "summarized"
}

/** Whether the detail summary tab should render completed summary content */
export function isAudioProjectSummaryReady(
	item: Pick<AudioProjectListItem, "card_status" | "current_phase" | "phase_status">,
): boolean {
	if (item.card_status === "summarized") return true
	return item.current_phase === "summarizing" && item.phase_status === "completed"
}

/** Whether the detail summary tab is in the summarizing placeholder state and should poll */
export function isAudioProjectSummarizing(
	item: Pick<AudioProjectListItem, "card_status" | "current_phase" | "phase_status">,
): boolean {
	if (item.card_status === "summarizing") return true
	if (item.current_phase !== "summarizing") return false
	// Match resolveCardStatus: phase present without a terminal status is still in progress.
	if (item.phase_status === "completed" || item.phase_status === "failed") return false
	return true
}

/** Whether the card can open raw audio playback while summary is pending or in progress */
export function canPreviewRawAudioRecording(item: AudioProjectListItem): boolean {
	const hasAudioFileId = Boolean(item.audio_file_id?.trim())
	if (!hasAudioFileId) return false
	return item.card_status === "not_summarized" || item.card_status === "summarizing"
}

/** Whether the card can open detail: summarized HTML, raw audio preview, or summarizing placeholder */
export function isAudioProjectPreviewReady(item: AudioProjectListItem): boolean {
	if (item.card_status === "summarized") return true
	// Summarizing items should open detail (placeholder + polling) even before audio_file_id hydrates.
	if (item.card_status === "summarizing") return true
	return canPreviewRawAudioRecording(item)
}

/** Parses API created_at / create_timestamp (unix seconds) into a numeric timestamp */
export function parseAudioProjectTimestamp(timestamp: string | number): number | null {
	const parsed = typeof timestamp === "number" ? timestamp : Number(timestamp)
	if (!Number.isFinite(parsed) || parsed <= 0) return null
	return parsed
}

/** Formats recording created time for card metadata (today → HH:mm, else localized date) */
export function formatRecordingCreatedTime(timestamp: string | number): string {
	const seconds = parseAudioProjectTimestamp(timestamp)
	if (seconds == null) return String(timestamp)
	return formatTime(seconds)
}

/** Builds the localized fallback title from created_at when project_name is missing */
export function formatRecordingDefaultName(timestamp: string | number): string {
	const seconds = parseAudioProjectTimestamp(timestamp)
	if (seconds == null) return ""

	const datetime = formatTime(seconds, "YYYY/MM/DD HH:mm")
	return i18next.t("defaultName", { ns: "audioRecordings", datetime })
}

/** Resolves the user-visible recording title shared by list cards and detail header */
export function resolveRecordingDisplayName(
	projectName: string | null | undefined,
	createdAt: string | number,
): string {
	const trimmedName = projectName?.trim()
	if (trimmedName) return trimmedName
	return formatRecordingDefaultName(createdAt)
}

/** Resolves source label from normalized fields:
 * - audio_source === 'imported': always show sourceImported
 * - source === 'device': prefer device_id (device name) or sourceDevice fallback
 * - source === 'app': prefer device_id name or sourceRecorded fallback
 * - source === 'pc': fixed sourcePc label (device_id ignored — not user-meaningful)
 * - source === 'h5' or legacy: fixed sourceRecorded label
 *
 * Consumed by both H5 MobileRecordingCard and PC AudioRecordingCard.
 */
export function resolveRecordingSourceLabel(
	item: AudioProjectListItem,
	labels: {
		sourceRecorded: string
		sourceImported: string
		sourceDevice: string
		sourcePc: string
	},
): string {
	if (item.audio_source === "imported") return labels.sourceImported

	const deviceName = item.device_id?.trim()

	if (item.source === "device") {
		// External Bluetooth/recording device — prefer backend device name
		return deviceName || labels.sourceDevice
	}

	if (item.source === "app") {
		// Recorded via mobile app — show device name if available, else generic label
		return deviceName || labels.sourceRecorded
	}

	// PC web recordings use a fixed label; the generic "Web" device_id is not user-meaningful
	if (item.source === "pc") return labels.sourcePc

	// h5 and legacy fallback: fixed label, ignore device_id
	return labels.sourceRecorded
}

/**
 * Picks the source icon based on extra.source + audio_source:
 * - imported audio_source → Upload (regardless of source field)
 * - 'device' → Bluetooth (external recorder)
 * - 'pc' → Monitor (desktop web)
 * - 'app', 'h5', or fallback → Smartphone
 *
 * Shared by both H5 MobileRecordingCard and PC AudioRecordingCard so the
 * icon mapping stays single-sourced across platforms.
 */
export function resolveRecordingSourceIcon(item: AudioProjectListItem): LucideIcon {
	if (item.audio_source === "imported") return Upload
	if (item.source === "device") return Bluetooth
	if (item.source === "pc") return Monitor
	return Smartphone
}

/** Converts Date to unix timestamp (seconds) at start of local day */
export function toStartOfDayTimestamp(date: Date): number {
	const normalized = new Date(date)
	normalized.setHours(0, 0, 0, 0)
	return Math.floor(normalized.getTime() / 1000)
}

/** Converts Date to unix timestamp (seconds) at end of local day */
export function toEndOfDayTimestamp(date: Date): number {
	const normalized = new Date(date)
	normalized.setHours(23, 59, 59, 999)
	return Math.floor(normalized.getTime() / 1000)
}
