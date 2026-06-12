import { useTranslation } from "react-i18next"
import { toast } from "sonner"

/**
 * Prototype-aligned dual-ring FAB — visual placeholder only.
 * Recording flow wiring lands in a follow-up phase.
 */
export function MobileRecordingFab() {
	const { t } = useTranslation("super")

	function handleClick() {
		toast.info(t("mobile.recordingEntry.fabComingSoon"))
	}

	return (
		<div
			className="pointer-events-none fixed bottom-[14px] left-1/2 z-20 -translate-x-1/2"
			data-testid="mobile-recording-fab"
		>
			<button
				type="button"
				onClick={handleClick}
				className="pointer-events-auto flex size-[68px] items-center justify-center rounded-full bg-card"
				style={{
					boxShadow: "0px 4px 14px rgba(0,0,0,0.18), 0px 0px 0px 1px rgba(0,0,0,0.04)",
				}}
				aria-label={t("mobile.recordingEntry.fabAria")}
				data-testid="mobile-recording-fab-button"
			>
				<span className="flex size-14 items-center justify-center rounded-full bg-icon-recording" />
			</button>
		</div>
	)
}
