import { useTranslation } from "react-i18next"

interface MobileRecordingFabProps {
	hidden?: boolean
	onClick: () => void
}

/**
 * Prototype-aligned dual-ring FAB that starts the shared recording session from
 * the mobile recordings list without leaving the unified `/recordings` entry.
 */
export function MobileRecordingFab({ hidden = false, onClick }: MobileRecordingFabProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="pointer-events-none fixed bottom-[14px] left-1/2 z-20 -translate-x-1/2 transition-opacity duration-200"
			style={{ opacity: hidden ? 0 : 1 }}
			data-testid="mobile-recording-fab"
		>
			<button
				type="button"
				onClick={onClick}
				disabled={hidden}
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
