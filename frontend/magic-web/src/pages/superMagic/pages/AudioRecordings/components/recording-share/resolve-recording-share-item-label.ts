import i18next from "i18next"
import type { RecordingShareGroupedItem } from "../../utils/build-recording-share-selection"
import { getAttachmentFileName } from "../../utils/recording-detail-files"
import { resolveSummaryTypeLabel } from "../recording-detail/resolve-summary-type-label"

/**
 * Resolves share picker row labels via literal i18n keys so locale tooling can statically discover every entry.
 */
export function resolveRecordingShareItemLabel(item: RecordingShareGroupedItem) {
	if (item.groupKey === "audio") return i18next.t("share.items.audio", { ns: "audioRecordings" })
	if (item.groupKey === "transcript")
		return i18next.t("share.items.transcript", { ns: "audioRecordings" })
	if (item.groupKey === "notes") return i18next.t("share.items.notes", { ns: "audioRecordings" })
	if (item.summaryType) return resolveSummaryTypeLabel(item.summaryType)
	return getAttachmentFileName(item.file)
}

/** Returns the grouped summary parent row label for the share picker. */
export function resolveRecordingShareSummaryRootLabel() {
	return i18next.t("share.items.summaryRoot", { ns: "audioRecordings" })
}
