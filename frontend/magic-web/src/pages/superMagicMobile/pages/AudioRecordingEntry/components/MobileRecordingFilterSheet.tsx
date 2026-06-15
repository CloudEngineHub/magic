import { Check, RotateCcw, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import type { AudioRecordingSummaryFilter } from "@/types/audioProject"
import {
	MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	type MobileAudioRecordingsDatePreset,
	type MobileAudioRecordingsFilterState,
	type MobileAudioRecordingsSortOption,
} from "../types"

interface MobileRecordingFilterSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	filter: MobileAudioRecordingsFilterState
	summaryFilter: AudioRecordingSummaryFilter
	onChange: (nextFilter: MobileAudioRecordingsFilterState) => void
	onSummaryFilterChange: (nextFilter: AudioRecordingSummaryFilter) => void
}

/** Single-select row with trailing check indicator (recycle-bin filter pattern) */
function SelectRow(props: {
	label: string
	selected: boolean
	onSelect: () => void
	dataTestId: string
}) {
	const { label, selected, onSelect, dataTestId } = props

	return (
		<button
			type="button"
			onClick={onSelect}
			className="flex h-12 w-full items-center gap-3 bg-transparent px-[14px] transition-opacity active:opacity-60"
			data-testid={dataTestId}
		>
			<span className="flex-1 text-left text-[16px] leading-5 text-foreground">{label}</span>
			{selected ? <Check className="size-5 shrink-0 text-primary" strokeWidth={2.5} /> : null}
		</button>
	)
}

/** Prototype date presets — custom range is intentionally omitted on mobile */
const DATE_PRESETS: MobileAudioRecordingsDatePreset[] = ["all", "today", "week", "month"]
const SORT_OPTIONS: MobileAudioRecordingsSortOption[] = ["updated_at_desc", "created_at_desc"]
const SUMMARY_OPTIONS: AudioRecordingSummaryFilter[] = ["all", "not_summarized", "summarized"]

/** Returns whether secondary filters differ from the mobile default preset */
function hasActiveFilters(
	filter: MobileAudioRecordingsFilterState,
	summaryFilter: AudioRecordingSummaryFilter,
) {
	return (
		filter.datePreset !== MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT.datePreset ||
		filter.sortOption !== MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT.sortOption ||
		summaryFilter !== "all"
	)
}

/**
 * Secondary filter popup: sort + created date presets aligned with prototype.
 * Uses MagicPopup to stay consistent with mobile recycle-bin / workspace filter sheets.
 */
export function MobileRecordingFilterSheet({
	open,
	onOpenChange,
	filter,
	summaryFilter,
	onChange,
	onSummaryFilterChange,
}: MobileRecordingFilterSheetProps) {
	const { t } = useTranslation(["super", "audioRecordings"])

	function handleClose() {
		onOpenChange(false)
	}

	function handleReset() {
		onChange(MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT)
		onSummaryFilterChange("all")
	}

	function handleSortChange(nextSort: MobileAudioRecordingsSortOption) {
		onChange({ ...filter, sortOption: nextSort })
	}

	function handleDateChange(nextDate: MobileAudioRecordingsDatePreset) {
		onChange({ ...filter, datePreset: nextDate })
	}

	function handleSummaryChange(nextSummaryFilter: AudioRecordingSummaryFilter) {
		onSummaryFilterChange(nextSummaryFilter)
	}

	/** Maps each supported mobile date preset to a literal translation key for static locale analysis. */
	function resolveDateLabel(preset: MobileAudioRecordingsDatePreset) {
		if (preset === "all") return t("super:mobile.recordingEntry.filterSheet.dateRange.all")
		if (preset === "today") return t("super:mobile.recordingEntry.filterSheet.dateRange.today")
		if (preset === "week") return t("super:mobile.recordingEntry.filterSheet.dateRange.week")
		return t("super:mobile.recordingEntry.filterSheet.dateRange.month")
	}

	function resolveSortLabel(option: MobileAudioRecordingsSortOption) {
		if (option === "updated_at_desc") return t("audioRecordings:filters.sortByUpdatedDesc")
		return t("audioRecordings:filters.sortByCreatedDesc")
	}

	function resolveSummaryLabel(option: AudioRecordingSummaryFilter) {
		if (option === "not_summarized") {
			return t("audioRecordings:filters.summaryNotDone")
		}
		if (option === "summarized") {
			return t("audioRecordings:filters.summaryDone")
		}
		return t("audioRecordings:filters.summaryAll")
	}

	return (
		<MagicPopup
			visible={open}
			onOpenChange={onOpenChange}
			onClose={handleClose}
			position="bottom"
			title={t("super:mobile.recordingEntry.filterSheet.title")}
			headerVariant="actionHeader"
			headerTitle={t("super:mobile.recordingEntry.filterSheet.title")}
			headerLeadingAction={{
				icon: <X />,
				ariaLabel: t("super:mobile.recordingEntry.filterSheet.closeAria"),
				onClick: handleClose,
				testId: "mobile-recording-filter-sheet-close",
			}}
			headerTrailingAction={
				hasActiveFilters(filter, summaryFilter)
					? {
							icon: <RotateCcw />,
							ariaLabel: t("super:mobile.recordingEntry.filterSheet.resetAria"),
							onClick: handleReset,
							testId: "mobile-recording-filter-sheet-reset",
						}
					: undefined
			}
			className="max-h-[78vh] gap-0 rounded-t-[14px] border-0 bg-muted p-0"
			bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
			style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
			data-testid="mobile-recording-filter-sheet"
		>
			<ScrollEdgeFadeContainer
				fadeColor="muted"
				className="min-h-0 flex-1"
				scrollClassName="no-scrollbar flex flex-col gap-2.5 px-[10px] pb-5 pt-2"
				contentDeps={[filter.sortOption, filter.datePreset, summaryFilter]}
			>
				<div
					className="flex flex-col gap-2"
					data-testid="mobile-recording-filter-summary-section"
				>
					<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
						{t("audioRecordings:filters.summaryStatus")}
					</p>
					<div className="w-full overflow-hidden rounded-lg bg-card">
						{SUMMARY_OPTIONS.map((option, index) => (
							<div key={option}>
								{index > 0 ? <div className="h-px w-full bg-border" /> : null}
								<SelectRow
									label={resolveSummaryLabel(option)}
									selected={summaryFilter === option}
									onSelect={() => handleSummaryChange(option)}
									dataTestId={`mobile-recording-filter-summary-${option}`}
								/>
							</div>
						))}
					</div>
				</div>

				<div
					className="flex flex-col gap-2"
					data-testid="mobile-recording-filter-sort-section"
				>
					<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
						{t("audioRecordings:filters.sort")}
					</p>
					<div className="w-full overflow-hidden rounded-lg bg-card">
						{SORT_OPTIONS.map((option, index) => (
							<div key={option}>
								{index > 0 ? <div className="h-px w-full bg-border" /> : null}
								<SelectRow
									label={resolveSortLabel(option)}
									selected={filter.sortOption === option}
									onSelect={() => handleSortChange(option)}
									dataTestId={`mobile-recording-filter-sort-${option}`}
								/>
							</div>
						))}
					</div>
				</div>

				<div
					className="flex flex-col gap-2"
					data-testid="mobile-recording-filter-date-section"
				>
					<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
						{t("super:mobile.recordingEntry.filterSheet.dateRange.label")}
					</p>
					<div className="w-full overflow-hidden rounded-lg bg-card">
						{DATE_PRESETS.map((preset, index) => (
							<div key={preset}>
								{index > 0 ? <div className="h-px w-full bg-border" /> : null}
								<SelectRow
									label={resolveDateLabel(preset)}
									selected={filter.datePreset === preset}
									onSelect={() => handleDateChange(preset)}
									dataTestId={`mobile-recording-filter-date-${preset}`}
								/>
							</div>
						))}
					</div>
				</div>
			</ScrollEdgeFadeContainer>
		</MagicPopup>
	)
}
