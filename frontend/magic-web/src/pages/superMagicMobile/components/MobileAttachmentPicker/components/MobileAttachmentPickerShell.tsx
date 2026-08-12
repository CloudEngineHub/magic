import type { ReactNode, RefObject } from "react"
import { X } from "lucide-react"
import CommonPopup from "@/pages/superMagicMobile/components/CommonPopup"
import MobileBottomSearchBar from "@/pages/superMagicMobile/components/MobileBottomSearchBar"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"

interface MobileAttachmentPickerShellProps {
	open: boolean
	testId: string
	closeTestId: string
	searchTestIdPrefix: string
	title: string
	searchPlaceholder: string
	clearSearchLabel: string
	closeAriaLabel: string
	searchQuery: string
	showBreadcrumb: boolean
	breadcrumb: ReactNode
	children: ReactNode
	headerAction?: ReactNode
	scrollPortRef: RefObject<HTMLDivElement | null>
	contentDeps: unknown[]
	onClose: () => void
	onSearchQueryChange: (value: string) => void
}

/** Provides the shared mobile picker popup, header, scroll container, and docked search bar. */
export default function MobileAttachmentPickerShell({
	open,
	testId,
	closeTestId,
	searchTestIdPrefix,
	title,
	searchPlaceholder,
	clearSearchLabel,
	closeAriaLabel,
	searchQuery,
	showBreadcrumb,
	breadcrumb,
	children,
	headerAction,
	scrollPortRef,
	contentDeps,
	onClose,
	onSearchQueryChange,
}: MobileAttachmentPickerShellProps) {
	return (
		<CommonPopup
			title=""
			hideHeader
			showHeader={false}
			popupProps={{
				visible: open,
				onClose,
				onMaskClick: onClose,
				showCloseButton: false,
				bodyClassName:
					"flex h-[95dvh] max-h-[calc(100dvh-8px)] min-h-0 flex-col !overflow-hidden p-0",
				className: "rounded-t-[14px] border-0 bg-[#F7F7F6]",
				bodyStyle: {
					background: "#F7F7F6",
					borderRadius: "14px 14px 0 0",
					height: "95dvh",
					overflow: "hidden",
				},
			}}
			wrapperStyle={{ height: "100%", maxHeight: "100%", minHeight: 0 }}
		>
			<div className="flex h-full min-h-0 flex-col bg-[#F7F7F6]" data-testid={testId}>
				<div className="relative flex h-14 shrink-0 items-center justify-center px-16">
					<button
						type="button"
						className="absolute left-2.5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_8px_25px_rgba(0,0,0,0.10)] active:opacity-70"
						onClick={onClose}
						aria-label={closeAriaLabel}
						data-testid={closeTestId}
					>
						<X className="h-[22px] w-[22px] text-foreground" strokeWidth={2} />
					</button>
					{headerAction}
					<div className="truncate text-[18px] font-semibold leading-6 text-foreground">
						{title}
					</div>
				</div>
				{showBreadcrumb ? breadcrumb : null}
				<ScrollEdgeFadeContainer
					fadeColor="mobile-background"
					className="min-h-0 flex-1"
					scrollClassName="scrollbar-y-thin"
					scrollPortRef={scrollPortRef}
					contentDeps={contentDeps}
				>
					{children}
				</ScrollEdgeFadeContainer>
				<div className="relative z-10 shrink-0 bg-[#F7F7F6]">
					<MobileBottomSearchBar
						value={searchQuery}
						placeholder={searchPlaceholder}
						clearAriaLabel={clearSearchLabel}
						onValueChange={onSearchQueryChange}
						testIdPrefix={searchTestIdPrefix}
						className="bg-[#F7F7F6] pb-[max(var(--safe-area-inset-bottom),24px)] pt-2.5"
					/>
				</div>
			</div>
		</CommonPopup>
	)
}
