import { useState, useEffect, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { Info, X } from "lucide-react"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import type { ElementRect } from "../types"
import { HTML_EDITOR_Z_INDEX } from "../../../constants/z-index"

// Page-session toggle: once dismissed, do not show again until full page refresh.
let isSmallSelectionHintDismissed = false

interface SmallSelectionHintProps {
	show: boolean
	rect: ElementRect
}

/**
 * Hint displayed when selection box is too small
 * Guides users to use toolbar actions, shortcuts, or zoom controls
 * Has a small delay to avoid showing immediately on selection
 */
export function SmallSelectionHint({ show, rect }: SmallSelectionHintProps) {
	const { t } = useTranslation("super")
	const [delayedShow, setDelayedShow] = useState(false)
	const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
	const [isDismissed, setIsDismissed] = useState(isSmallSelectionHintDismissed)

	useEffect(() => {
		if (typeof document !== "undefined") {
			setPortalTarget(document.body)
		}
	}, [])

	// Delay showing hint by 800ms to avoid flashing on quick selections
	useEffect(() => {
		if (show && !isDismissed) {
			const timer = setTimeout(() => {
				setDelayedShow(true)
			}, 800)
			return () => {
				clearTimeout(timer)
				setDelayedShow(false)
			}
		}
		setDelayedShow(false)
		return undefined
	}, [isDismissed, show])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			setDelayedShow(false)
		}
	}, [])

	if (!delayedShow || !portalTarget || isDismissed) return null

	// Place the hint above selection controls so it does not cover small handles.
	const hintTop = Math.max(8, rect.top - 90)
	const hintLeft = rect.left + rect.width / 2

	const handleDismiss = (event: MouseEvent<HTMLButtonElement>) => {
		// Keep the close click from selecting or dragging the underlying editor.
		event.preventDefault()
		event.stopPropagation()
		isSmallSelectionHintDismissed = true
		setIsDismissed(true)
		setDelayedShow(false)
	}

	return createPortal(
		<motion.div
			initial={{ opacity: 0, y: -4, scale: 0.95 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: -4, scale: 0.95 }}
			transition={{ duration: 0.15, ease: "easeOut" }}
			className="pointer-events-auto fixed flex items-start gap-1.5 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
			style={{
				top: `${hintTop}px`,
				left: `${hintLeft}px`,
				transform: "translateX(-50%)",
				zIndex: HTML_EDITOR_Z_INDEX.FULLSCREEN.FLOATING_HINT,
				maxWidth: "280px",
				minWidth: "200px",
			}}
		>
			<Info className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
			<div className="leading-tight">{t("stylePanel.smallSelectionHint")}</div>
			<button
				type="button"
				onClick={handleDismiss}
				className="-mr-1 -mt-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
				aria-label={t("common.close")}
			>
				<X className="h-3 w-3" />
			</button>
		</motion.div>,
		portalTarget,
	)
}
