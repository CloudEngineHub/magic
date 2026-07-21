import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import slidesTemplateFireIcon from "@/assets/resources/icons/fire.webp"
import slidesTemplateSparklesIcon from "@/assets/resources/icons/sparkles.webp"
import { AnimatedNumberText } from "@/pages/superMagic/components/AnimatedNumberText"
import { formatNumber } from "@/utils/format"

type BadgeView = "today" | "total"
type BadgeContentWidths = Record<BadgeView, number>

interface BadgeLayoutMetrics {
	availableWidth: number
	iconWidth: number
	gap: number
}

interface SlidesTemplateCountBadgeProps {
	count: number
	todayAdded?: number
	testId?: string
}

interface BadgeContentProps {
	view: BadgeView
	count: number
	todayAdded: number
	prefix: string
	suffix: string
	compactLabel: string
	measure?: boolean
	compact?: boolean
}

const COUNT_MARKER = "__SLIDES_TEMPLATE_COUNT__"
export const SLIDES_TEMPLATE_BADGE_ROTATION_INTERVAL = 3000
const BADGE_TRANSITION_DURATION = 0.28
const BADGE_WIDTH_TRANSITION_DURATION = 0.3
const MIN_TRUNCATED_BADGE_WIDTH = 48

const contentVariants: Variants = {
	enter: (direction: number) => ({
		y: direction * 10,
		opacity: 0,
		filter: "blur(1px)",
	}),
	center: {
		y: 0,
		opacity: 1,
		filter: "blur(0px)",
	},
	exit: (direction: number) => ({
		y: direction * -10,
		opacity: 0,
		filter: "blur(1px)",
	}),
}

export function isValidTemplateCountTodayGrowth(value: number | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
}

export function getSlidesTemplateBadgeTargetWidth({
	availableWidth,
	iconWidth,
	contentWidth,
	gap,
	compact,
}: {
	availableWidth: number
	iconWidth: number
	contentWidth: number
	gap: number
	compact: boolean
}) {
	if (!compact) return contentWidth

	const maxBadgeWidth = availableWidth - iconWidth - gap * 2
	return Math.min(contentWidth, Math.max(MIN_TRUNCATED_BADGE_WIDTH, maxBadgeWidth))
}

export function shouldUseCompactSlidesTemplateBadge({
	availableWidth,
	iconWidth,
	titleWidth,
	contentWidth,
	gap,
}: {
	availableWidth: number
	iconWidth: number
	titleWidth: number
	contentWidth: number
	gap: number
}) {
	return iconWidth + titleWidth + contentWidth + gap * 2 > availableWidth + 1
}

function splitCountLabel(label: string) {
	const markerIndex = label.indexOf(COUNT_MARKER)
	if (markerIndex < 0) return { prefix: label.trim(), suffix: "" }

	return {
		prefix: label.slice(0, markerIndex).trim(),
		suffix: label.slice(markerIndex + COUNT_MARKER.length).trim(),
	}
}

function BadgeContent({
	view,
	count,
	todayAdded,
	prefix,
	suffix,
	compactLabel,
	measure = false,
	compact = false,
}: BadgeContentProps) {
	const value = view === "today" ? todayAdded : count
	const icon = view === "today" ? slidesTemplateSparklesIcon : slidesTemplateFireIcon

	return (
		<>
			<img
				src={icon}
				alt=""
				aria-hidden="true"
				draggable={false}
				className="h-4 w-4 shrink-0 object-contain"
			/>
			{compact ? (
				<span
					className={
						measure
							? "whitespace-nowrap leading-none"
							: "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-none"
					}
					data-slides-template-badge-text
					data-slides-template-badge-compact={!measure ? "true" : undefined}
				>
					{compactLabel}
				</span>
			) : (
				<span
					className="inline-flex items-center gap-1 whitespace-nowrap leading-none"
					data-slides-template-badge-text
				>
					{prefix ? <span>{prefix}</span> : null}
					{measure ? (
						<span className="tabular-nums">{formatNumber(value)}</span>
					) : (
						<AnimatedNumberText value={value} className="leading-none" />
					)}
					{suffix ? <span>{suffix}</span> : null}
				</span>
			)}
		</>
	)
}

/** 在今日新增与模板总数间轮播，侧栏空间不足时只保留数量和单位。 */
export function SlidesTemplateCountBadge({
	count,
	todayAdded,
	testId,
}: SlidesTemplateCountBadgeProps) {
	const { t } = useTranslation("sidebar")
	const hasTodayAdded = isValidTemplateCountTodayGrowth(todayAdded)
	const prefersReducedMotion = Boolean(useReducedMotion())
	const badgeRef = useRef<HTMLSpanElement>(null)
	const todayMeasureRef = useRef<HTMLSpanElement>(null)
	const totalMeasureRef = useRef<HTMLSpanElement>(null)
	const todayCompactMeasureRef = useRef<HTMLSpanElement>(null)
	const totalCompactMeasureRef = useRef<HTMLSpanElement>(null)
	const hadTodayAddedRef = useRef(hasTodayAdded)
	const [view, setView] = useState<BadgeView>(hasTodayAdded ? "today" : "total")
	const [contentWidths, setContentWidths] = useState<BadgeContentWidths>()
	const [compactContentWidths, setCompactContentWidths] = useState<BadgeContentWidths>()
	const [compact, setCompact] = useState(false)
	const [layoutMetrics, setLayoutMetrics] = useState<BadgeLayoutMetrics>()

	const todayLabel = splitCountLabel(
		t("slidesTemplates.todayAddedCount", { value: COUNT_MARKER }),
	)
	const totalLabel = splitCountLabel(
		t("slidesTemplates.templateTotalCount", { value: COUNT_MARKER }),
	)
	const todayCompactLabel = t("slidesTemplates.compactCount", {
		value: formatNumber(todayAdded ?? 0),
	})
	const totalCompactLabel = t("slidesTemplates.compactCount", {
		value: formatNumber(count),
	})

	useEffect(() => {
		const hadTodayAdded = hadTodayAddedRef.current
		hadTodayAddedRef.current = hasTodayAdded

		if (!hasTodayAdded) {
			setView("total")
		} else if (!hadTodayAdded) {
			setView("today")
		}
	}, [hasTodayAdded])

	useEffect(() => {
		if (!hasTodayAdded) return

		// 统计值变化会重置计时，避免数字递增动画与标签切换同时发生。
		const timer = window.setTimeout(() => {
			setView((current) => (current === "today" ? "total" : "today"))
		}, SLIDES_TEMPLATE_BADGE_ROTATION_INTERVAL)

		return () => window.clearTimeout(timer)
	}, [count, hasTodayAdded, todayAdded, view])

	useLayoutEffect(() => {
		const badge = badgeRef.current
		const todayMeasure = todayMeasureRef.current
		const totalMeasure = totalMeasureRef.current
		const todayCompactMeasure = todayCompactMeasureRef.current
		const totalCompactMeasure = totalCompactMeasureRef.current
		const row = badge?.closest<HTMLElement>("[data-slides-template-row]")
		const label = row?.querySelector<HTMLElement>("[data-slides-template-label]")
		const icon = row?.querySelector<HTMLElement>("[data-slides-template-icon]")
		if (
			!badge ||
			!todayMeasure ||
			!totalMeasure ||
			!todayCompactMeasure ||
			!totalCompactMeasure ||
			!row ||
			!label ||
			!icon
		)
			return

		const updateLayout = () => {
			const todayWidth = Math.ceil(todayMeasure.getBoundingClientRect().width)
			const totalWidth = Math.ceil(totalMeasure.getBoundingClientRect().width)
			const todayCompactWidth = Math.ceil(todayCompactMeasure.getBoundingClientRect().width)
			const totalCompactWidth = Math.ceil(totalCompactMeasure.getBoundingClientRect().width)
			const rowStyle = window.getComputedStyle(row)
			const gap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap) || 0
			const contentWidth = hasTodayAdded ? Math.max(todayWidth, totalWidth) : totalWidth
			const iconWidth = icon.getBoundingClientRect().width

			setContentWidths({ today: todayWidth, total: totalWidth })
			setCompactContentWidths({ today: todayCompactWidth, total: totalCompactWidth })
			setCompact(
				shouldUseCompactSlidesTemplateBadge({
					availableWidth: row.clientWidth,
					iconWidth,
					titleWidth: label.scrollWidth,
					contentWidth,
					gap,
				}),
			)
			setLayoutMetrics({ availableWidth: row.clientWidth, iconWidth, gap })
		}

		const frame = window.requestAnimationFrame(updateLayout)
		const observer = new ResizeObserver(updateLayout)
		observer.observe(row)
		observer.observe(label)

		return () => {
			window.cancelAnimationFrame(frame)
			observer.disconnect()
		}
	}, [
		count,
		hasTodayAdded,
		todayAdded,
		todayLabel.prefix,
		todayLabel.suffix,
		todayCompactLabel,
		totalLabel.prefix,
		totalLabel.suffix,
		totalCompactLabel,
	])

	const activeView = hasTodayAdded ? view : "total"
	const activeLabel =
		activeView === "today"
			? t("slidesTemplates.todayAddedCount", { value: formatNumber(todayAdded ?? 0) })
			: t("slidesTemplates.templateTotalCount", { value: formatNumber(count) })
	const direction = activeView === "total" ? 1 : -1
	const activeContent =
		activeView === "today"
			? { ...todayLabel, todayAdded: todayAdded ?? 0 }
			: { ...totalLabel, todayAdded: todayAdded ?? 0 }
	const activeCompactLabel = activeView === "today" ? todayCompactLabel : totalCompactLabel
	const activeContentWidth = compact
		? compactContentWidths?.[activeView]
		: contentWidths?.[activeView]
	const targetWidth =
		activeContentWidth !== undefined && layoutMetrics !== undefined
			? getSlidesTemplateBadgeTargetWidth({
					availableWidth: layoutMetrics.availableWidth,
					iconWidth: layoutMetrics.iconWidth,
					contentWidth: activeContentWidth,
					gap: layoutMetrics.gap,
					compact,
				})
			: undefined

	return (
		<motion.span
			ref={badgeRef}
			className="relative inline-flex h-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#fff2ec] text-sm font-medium tabular-nums leading-none text-[#ff6a1f]"
			animate={targetWidth !== undefined ? { width: targetWidth } : undefined}
			transition={{
				duration: prefersReducedMotion ? 0 : BADGE_WIDTH_TRANSITION_DURATION,
				ease: [0.22, 1, 0.36, 1],
			}}
			style={targetWidth !== undefined ? undefined : { width: MIN_TRUNCATED_BADGE_WIDTH }}
			aria-label={activeLabel}
			data-testid={testId}
		>
			<span className="relative flex h-full w-full items-center justify-center overflow-hidden whitespace-nowrap">
				<AnimatePresence initial={false} custom={direction} mode="popLayout">
					<motion.span
						key={activeView}
						custom={direction}
						variants={contentVariants}
						initial={prefersReducedMotion ? false : "enter"}
						animate="center"
						exit={prefersReducedMotion ? undefined : "exit"}
						transition={{
							duration: prefersReducedMotion ? 0 : BADGE_TRANSITION_DURATION,
							ease: [0.22, 1, 0.36, 1],
						}}
						className="absolute inset-0 flex min-w-0 items-center justify-start gap-1 px-2"
						data-testid={testId ? `${testId}-value` : undefined}
					>
						<BadgeContent
							view={activeView}
							count={count}
							todayAdded={activeContent.todayAdded}
							prefix={activeContent.prefix}
							suffix={activeContent.suffix}
							compactLabel={activeCompactLabel}
							compact={compact}
						/>
					</motion.span>
				</AnimatePresence>
			</span>

			<span
				ref={todayMeasureRef}
				aria-hidden="true"
				className="pointer-events-none invisible absolute left-0 top-0 inline-flex h-6 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium"
			>
				<BadgeContent
					view="today"
					count={count}
					todayAdded={todayAdded ?? 0}
					prefix={todayLabel.prefix}
					suffix={todayLabel.suffix}
					compactLabel=""
					measure
				/>
			</span>
			<span
				ref={totalMeasureRef}
				aria-hidden="true"
				className="pointer-events-none invisible absolute left-0 top-0 inline-flex h-6 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium"
			>
				<BadgeContent
					view="total"
					count={count}
					todayAdded={todayAdded ?? 0}
					prefix={totalLabel.prefix}
					suffix={totalLabel.suffix}
					compactLabel=""
					measure
				/>
			</span>
			<span
				ref={todayCompactMeasureRef}
				aria-hidden="true"
				data-slides-template-badge-measure="compact"
				className="pointer-events-none invisible absolute left-0 top-0 inline-flex h-6 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium"
			>
				<BadgeContent
					view="today"
					count={count}
					todayAdded={todayAdded ?? 0}
					prefix=""
					suffix=""
					compactLabel={todayCompactLabel}
					compact
					measure
				/>
			</span>
			<span
				ref={totalCompactMeasureRef}
				aria-hidden="true"
				data-slides-template-badge-measure="compact"
				className="pointer-events-none invisible absolute left-0 top-0 inline-flex h-6 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium"
			>
				<BadgeContent
					view="total"
					count={count}
					todayAdded={todayAdded ?? 0}
					prefix=""
					suffix=""
					compactLabel={totalCompactLabel}
					compact
					measure
				/>
			</span>
		</motion.span>
	)
}
