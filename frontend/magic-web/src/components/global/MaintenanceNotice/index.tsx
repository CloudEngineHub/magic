import { useEffect, useRef, useState, type CSSProperties } from "react"
import { observer } from "mobx-react-lite"
import { globalConfigStore } from "@/stores/globalConfig"
import { shouldShowGlobalMaintenanceNotice } from "@/constants/maintenance"

function MaintenanceNotice() {
	const { maintenanceConfig } = globalConfigStore
	const noticeRef = useRef<HTMLDivElement>(null)
	const textRef = useRef<HTMLSpanElement>(null)
	const [shouldScroll, setShouldScroll] = useState(false)
	const [scrollDuration, setScrollDuration] = useState(18)
	const description = maintenanceConfig.maintenance_description

	useEffect(() => {
		const notice = noticeRef.current
		const text = textRef.current

		if (!notice || !text) return

		const updateScrollState = () => {
			const styles = window.getComputedStyle(notice)
			const horizontalPadding =
				Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
			const availableWidth = notice.clientWidth - horizontalPadding
			const textWidth = text.scrollWidth

			setShouldScroll(textWidth > availableWidth)
			setScrollDuration(Math.max(12, Math.ceil(textWidth / 60)))
		}

		updateScrollState()

		const resizeObserver = new ResizeObserver(updateScrollState)
		resizeObserver.observe(notice)
		resizeObserver.observe(text)

		return () => {
			resizeObserver.disconnect()
		}
	}, [description])

	if (!shouldShowGlobalMaintenanceNotice(maintenanceConfig)) {
		return null
	}

	return (
		<div
			ref={noticeRef}
			className="relative w-full shrink-0 overflow-hidden whitespace-nowrap bg-primary px-4 py-2 text-center text-sm font-medium leading-5 text-primary-foreground"
		>
			{shouldScroll ? (
				<div
					className="inline-flex w-max min-w-full animate-maintenance-notice-marquee will-change-transform"
					style={
						{
							"--maintenance-notice-duration": `${scrollDuration}s`,
						} as CSSProperties
					}
					aria-label={description}
				>
					<span className="shrink-0 whitespace-nowrap pe-12">{description}</span>
					<span className="shrink-0 whitespace-nowrap pe-12" aria-hidden="true">
						{description}
					</span>
				</div>
			) : (
				<span className="block overflow-hidden text-ellipsis">{description}</span>
			)}
			<span
				ref={textRef}
				className="pointer-events-none invisible absolute left-4 top-2 whitespace-nowrap"
				aria-hidden="true"
			>
				{description}
			</span>
		</div>
	)
}

export default observer(MaintenanceNotice)
