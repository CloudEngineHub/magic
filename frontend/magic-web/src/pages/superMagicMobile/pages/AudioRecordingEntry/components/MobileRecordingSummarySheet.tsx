import { Check, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import type { AudioRecordingSummaryFilter } from "@/types/audioProject"

interface MobileRecordingSummarySheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	summaryFilter: AudioRecordingSummaryFilter
	onChange: (value: AudioRecordingSummaryFilter) => void
}

const SUMMARY_OPTIONS: AudioRecordingSummaryFilter[] = ["all", "not_summarized", "summarized"]

/** Single-select row with trailing check indicator */
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

/**
 * Primary filter popup for summary status (all / not summarized / summarized).
 * Mirrors prototype group sheet interaction but maps to PC summaryFilter semantics.
 */
export function MobileRecordingSummarySheet({
	open,
	onOpenChange,
	summaryFilter,
	onChange,
}: MobileRecordingSummarySheetProps) {
	const { t } = useTranslation(["super", "audioRecordings"])

	function handleClose() {
		onOpenChange(false)
	}

	function resolveSummaryLabel(value: AudioRecordingSummaryFilter) {
		if (value === "not_summarized") return t("audioRecordings:filters.summaryNotDone")
		if (value === "summarized") return t("audioRecordings:filters.summaryDone")
		return t("audioRecordings:filters.summaryAll")
	}

	return (
		<MagicPopup
			visible={open}
			onOpenChange={onOpenChange}
			onClose={handleClose}
			position="bottom"
			title={t("super:mobile.recordingEntry.summarySheet.title")}
			headerVariant="actionHeader"
			headerTitle={t("super:mobile.recordingEntry.summarySheet.title")}
			headerLeadingAction={{
				icon: <X />,
				ariaLabel: t("super:mobile.recordingEntry.summarySheet.closeAria"),
				onClick: handleClose,
				testId: "mobile-recording-summary-sheet-close",
			}}
			className="max-h-[78vh] gap-0 rounded-t-[14px] border-0 bg-muted p-0"
			bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
			style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
			data-testid="mobile-recording-summary-sheet"
		>
			<ScrollEdgeFadeContainer
				fadeColor="muted"
				className="min-h-0 flex-1"
				scrollClassName="no-scrollbar flex flex-col gap-2.5 px-[10px] pb-5 pt-2"
				contentDeps={[summaryFilter]}
			>
				<div className="flex flex-col gap-2" data-testid="mobile-recording-summary-section">
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
									onSelect={() => {
										onChange(option)
										onOpenChange(false)
									}}
									dataTestId={`mobile-recording-summary-${option}`}
								/>
							</div>
						))}
					</div>
				</div>
			</ScrollEdgeFadeContainer>
		</MagicPopup>
	)
}
