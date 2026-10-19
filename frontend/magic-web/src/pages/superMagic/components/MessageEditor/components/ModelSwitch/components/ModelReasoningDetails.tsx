import { useEffect, useId, useRef, useState, type ReactElement } from "react"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@/components/shadcn-ui/popover"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { getModelDisplayedReasoningEffort, getNextModelReasoningEffort } from "../utils"
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { reasoningEffortLevels, type ModelItem, type ReasoningEffort } from "../types"
import {
	MODEL_DETAILS_HOVER_OPEN_DELAY_MS,
	useModelDetailsHover,
} from "../hooks/useModelDetailsHover"
import { CollapsibleDescription } from "./CollapsibleDescription"
import { ModelBillingMultiplier } from "./ModelBillingMultiplier"
import { cn } from "@/utils/cn"

function formatContextWindow(value?: number | null) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`
	if (value >= 1_000) return `${Math.round(value / 1_000)}K`
	return String(value)
}

interface ModelReasoningDetailsProps {
	model: ModelItem
	description?: string
	mobile: boolean
	disabled: boolean
	onReasoningEffortChange: (model: ModelItem) => void
	children: ReactElement
}

/** 紧凑模型行的三级详情；桌面跨区域共享悬停状态，移动端单层切换。 */
export function ModelReasoningDetails({
	model,
	description = model.model_description,
	mobile,
	disabled,
	onReasoningEffortChange,
	children,
}: ModelReasoningDetailsProps) {
	const { t } = useTranslation("super")
	const id = useId()
	const hover = useModelDetailsHover()
	const { requestClose } = hover
	const open = hover.activeId === id
	const [levelsOpen, setLevelsOpen] = useState(false)
	const [descriptionExpanded, setDescriptionExpanded] = useState(false)
	const hoverOpened = useRef(false)
	const levelsHoverOpened = useRef(false)
	const focusStrength = useRef(false)
	const restoreRowFocus = useRef(false)
	const restoringFocus = useRef(false)
	const anchorRef = useRef<HTMLDivElement>(null)
	const strengthRef = useRef<HTMLButtonElement>(null)
	const detailRef = useRef<HTMLDivElement>(null)
	const levelsRef = useRef<HTMLDivElement>(null)
	const levelTimer = useRef<ReturnType<typeof setTimeout>>()
	const labels = {
		none: t("messageEditor.modelSwitch.reasoning.none"),
		minimal: t("messageEditor.modelSwitch.reasoning.minimal"),
		low: t("messageEditor.modelSwitch.reasoning.low"),
		medium: t("messageEditor.modelSwitch.reasoning.medium"),
		high: t("messageEditor.modelSwitch.reasoning.high"),
		xhigh: t("messageEditor.modelSwitch.reasoning.xhigh"),
		max: t("messageEditor.modelSwitch.reasoning.max"),
	}
	const levels = reasoningEffortLevels.filter((level) =>
		model.reasoning_effort_levels?.includes(level),
	)
	const selected = getModelDisplayedReasoningEffort(model)
	const defaultLabel = t("messageEditor.modelSwitch.reasoning.default")
	const selectedLabel = selected ? labels[selected] : defaultLabel
	const hasMultiplier =
		typeof model.billing_multiplier === "number" &&
		Number.isFinite(model.billing_multiplier) &&
		model.billing_multiplier >= 0
	const contextWindow = formatContextWindow(model.max_context_tokens)

	/** 在详情和子菜单的任意入口取消父层关闭及其他模型的待切换任务。 */
	function keepOpen() {
		hover.keepOpen()
	}

	/** 一级行离开时保留 Portal 过渡时间；详情和三级卡片离开菜单则立即关闭。 */
	function scheduleClose(
		event?: { relatedTarget: EventTarget | null },
		allowPortalBridge = true,
	) {
		clearTimeout(levelTimer.current)
		// 鼠标离开时即使焦点仍留在卡片内也要关闭；键盘焦点转移由 blur 事件单独保护。
		if (mobile) return
		const relatedTarget = event?.relatedTarget
		const target =
			relatedTarget && typeof (relatedTarget as Node).nodeType === "number"
				? (relatedTarget as Node)
				: null
		const remainsInMenu =
			target &&
			(anchorRef.current?.contains(target) ||
				detailRef.current?.contains(target) ||
				levelsRef.current?.contains(target))
		// The first-level row needs a grace period for every exit: browsers can
		// report the portaled card's transition target as an unrelated element.
		// Nested cards still close immediately when they leave the whole menu.
		const isPortalTransition = allowPortalBridge || Boolean(remainsInMenu)
		hover.requestClose(id, !isPortalTransition)
	}

	/** 手动点击与键盘可以立即打开；鼠标悬停经过短暂等待。 */
	function showDetails(immediate = false) {
		if (disabled) return
		hoverOpened.current = !immediate
		hover.requestOpen(id, immediate)
	}

	/** 固定用户覆盖；再次点击当前档位则清除覆盖，继续继承后台设置。 */
	function selectEffort(level: ReasoningEffort) {
		const effort = getNextModelReasoningEffort(model, level)
		modelCache.setReasoningEffort(model, effort)
		hover.requestClose(id, true)
		setLevelsOpen(false)
		onReasoningEffortChange({ ...model, reasoning_effort: effort ?? null })
	}

	/** 子菜单入口支持悬停与点击，离开前取消尚未执行的打开任务。 */
	function scheduleLevels() {
		keepOpen()
		clearTimeout(levelTimer.current)
		levelTimer.current = setTimeout(() => {
			levelsHoverOpened.current = true
			setLevelsOpen(true)
		}, MODEL_DETAILS_HOVER_OPEN_DELAY_MS)
	}

	/** 关闭或切换模型后恢复折叠详情，键盘右箭头将焦点移到思考入口。 */
	useEffect(() => {
		if (!open) {
			clearTimeout(levelTimer.current)
			setLevelsOpen(false)
			setDescriptionExpanded(false)
		} else if (focusStrength.current) {
			focusStrength.current = false
			strengthRef.current?.focus()
		}
	}, [open])
	useEffect(() => () => clearTimeout(levelTimer.current), [])
	useEffect(() => {
		const scrollContainer = anchorRef.current?.closest<HTMLElement>(
			"[data-model-switch-scroll-container]",
		)
		if (!scrollContainer) return

		// The detail card is portaled, so close it when its model row leaves the scrolling viewport.
		// Keeping the card open would let it visually drift away from the model that opened it.
		const handleScroll = () => requestClose(id, true)
		scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
		return () => scrollContainer.removeEventListener("scroll", handleScroll)
	}, [id, requestClose])
	const choices = (
		<ScrollArea viewportClassName="max-h-80">
			<div
				className="flex flex-col p-1"
				role="group"
				aria-label={t("messageEditor.modelSwitch.reasoning.label")}
			>
				<div className="px-2 py-1.5 text-xs text-muted-foreground">
					{t("messageEditor.modelSwitch.reasoning.label")}
				</div>
				{levels.map((level) => (
					<div key={level}>
						<Button
							variant="ghost"
							className="h-9 w-full justify-between px-2 text-sm font-normal"
							onClick={() => selectEffort(level)}
							aria-pressed={selected === level}
						>
							{labels[level]}
							{selected === level && <Check className="size-4" aria-hidden="true" />}
						</Button>
					</div>
				))}
			</div>
		</ScrollArea>
	)
	const strengthButton = (
		<Button
			ref={strengthRef}
			variant="ghost"
			className="h-10 w-full justify-between rounded-lg px-2 text-sm font-normal hover:bg-muted/70"
			onClick={mobile ? () => setLevelsOpen(true) : undefined}
			onPointerEnter={(event) => {
				if (!mobile && event.pointerType === "mouse") scheduleLevels()
			}}
			onPointerLeave={() => clearTimeout(levelTimer.current)}
		>
			<span>{t("messageEditor.modelSwitch.reasoning.label")}</span>
			<span className="flex items-center gap-1 text-xs text-muted-foreground">
				{selectedLabel}
				<ChevronRight className="size-4" />
			</span>
		</Button>
	)

	return (
		<Popover
			open={open}
			onOpenChange={(value) => {
				if (value) showDetails(true)
				else hover.requestClose(id, true)
			}}
		>
			<PopoverAnchor asChild>
				<div
					ref={anchorRef}
					className={cn(
						"flex min-w-0 items-center gap-1",
						open && !mobile && "[&_[data-testid=model-switch-item]]:bg-muted/80",
					)}
					onPointerEnter={(event) => {
						if (!mobile && event.pointerType === "mouse") showDetails()
					}}
					onPointerLeave={scheduleClose}
					onFocusCapture={(event) => {
						if (restoringFocus.current) return
						if (
							!mobile &&
							!disabled &&
							event.target.getAttribute("data-testid") === "model-switch-item"
						) {
							hoverOpened.current = true
							hover.requestOpen(id, true)
						}
					}}
					onBlurCapture={(event) => {
						const target = event.relatedTarget as Node | null
						if (
							!event.currentTarget.contains(target) &&
							!detailRef.current?.contains(target) &&
							!levelsRef.current?.contains(target)
						)
							scheduleClose()
					}}
					onKeyDownCapture={(event) => {
						if (!mobile && !disabled && event.key === "ArrowRight" && levels.length) {
							event.preventDefault()
							focusStrength.current = true
							hoverOpened.current = true
							hover.requestOpen(id, true)
							if (open) {
								focusStrength.current = false
								strengthRef.current?.focus()
							}
						}
					}}
				>
					<div className="min-w-0 flex-1">{children}</div>
					{mobile && (
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-9 shrink-0"
								disabled={disabled}
								aria-label={t("messageEditor.modelSwitch.reasoning.details")}
								onClick={() => showDetails(true)}
							>
								<ChevronRight className="size-4" />
							</Button>
						</PopoverTrigger>
					)}
				</div>
			</PopoverAnchor>
			<PopoverContent
				ref={detailRef}
				data-model-switch-details-overlay
				// 桌面端详情继续放在模型列表右侧；参考图只用于卡片层级与视觉样式。
				side={mobile ? "top" : "right"}
				align="start"
				// The anchor is the compact model row, so leave enough room for the
				// detail card to sit beside the full model-list panel without overlap.
				sideOffset={mobile ? 8 : 20}
				collisionPadding={12}
				className="w-64 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border-border/80 bg-card p-0 shadow-[0_12px_32px_rgba(15,23,42,0.14)] duration-100"
				onPointerEnter={keepOpen}
				onPointerLeave={(event) => scheduleClose(event, false)}
				onFocusCapture={keepOpen}
				onBlurCapture={(event) => {
					const target = event.relatedTarget as Node | null
					if (
						!mobile &&
						!event.currentTarget.contains(target) &&
						!levelsRef.current?.contains(target)
					)
						hover.requestClose(id)
				}}
				onInteractOutside={(event) => {
					// 子菜单挂载在独立 Portal 中，点击或聚焦其中选项仍属于父详情。
					if (levelsRef.current?.contains(event.target as Node)) event.preventDefault()
				}}
				onOpenAutoFocus={(event) => {
					if (hoverOpened.current) event.preventDefault()
				}}
				onCloseAutoFocus={(event) => {
					if (hoverOpened.current || restoreRowFocus.current) event.preventDefault()
					// 桌面没有独立详情按钮，Esc 返回原模型行且不重新触发打开。
					if (restoreRowFocus.current) {
						restoreRowFocus.current = false
						restoringFocus.current = true
						anchorRef.current
							?.querySelector<HTMLElement>('[data-testid="model-switch-item"]')
							?.focus()
						restoringFocus.current = false
					}
				}}
				onEscapeKeyDown={() => {
					if (!mobile) restoreRowFocus.current = true
				}}
			>
				{mobile && levelsOpen ? (
					<>
						<Button variant="ghost" onClick={() => setLevelsOpen(false)}>
							<ChevronLeft className="size-4" />
							{t("messageEditor.modelSwitch.reasoning.label")}
						</Button>
						{choices}
					</>
				) : (
					<>
						<div className="border-b border-border/70 px-4 pb-4 pt-4">
							<div className="break-words text-base font-medium leading-6">
								{model.model_name}
							</div>
							{description && (
								<ScrollArea viewportClassName="mt-1.5 max-h-28">
									<CollapsibleDescription
										description={description}
										className="!text-sm !leading-5"
										isExpanded={descriptionExpanded}
										expandLabel={t(
											"messageEditor.modelSwitch.expandDescription",
										)}
										collapseLabel={t(
											"messageEditor.modelSwitch.collapseDescription",
										)}
										onToggle={() => setDescriptionExpanded((value) => !value)}
									/>
								</ScrollArea>
							)}
						</div>
						{hasMultiplier && (
							<div className="border-b border-border/70 px-4 py-3.5 text-sm">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">
										{t("messageEditor.modelSwitch.billingMultiplier")}
									</span>
									<ModelBillingMultiplier value={model.billing_multiplier} />
								</div>
								<p className="leading-3.5 mt-1 text-[10px] text-muted-foreground">
									{t("messageEditor.modelSwitch.billingMultiplierHint")}
								</p>
							</div>
						)}
						{levels.length > 0 && (
							<div className="px-3 py-2.5">
								{mobile ? (
									strengthButton
								) : (
									<Popover
										open={levelsOpen}
										onOpenChange={(value) => {
											levelsHoverOpened.current = false
											setLevelsOpen(value)
										}}
									>
										<PopoverTrigger asChild>{strengthButton}</PopoverTrigger>
										<PopoverContent
											ref={levelsRef}
											data-model-switch-details-overlay
											side="right"
											align="start"
											// This popover is anchored to an inner row; the larger offset
											// keeps it parallel with the complete detail card.
											sideOffset={16}
											className="w-36 p-0 duration-100"
											onPointerEnter={keepOpen}
											onPointerLeave={(event) => scheduleClose(event, false)}
											onFocusCapture={keepOpen}
											onOpenAutoFocus={(event) => {
												if (levelsHoverOpened.current)
													event.preventDefault()
											}}
											onCloseAutoFocus={(event) => {
												if (levelsHoverOpened.current)
													event.preventDefault()
											}}
											onBlurCapture={(event) => {
												const target = event.relatedTarget as Node | null
												if (
													!mobile &&
													!event.currentTarget.contains(target) &&
													!detailRef.current?.contains(target)
												)
													hover.requestClose(id)
											}}
										>
											{choices}
										</PopoverContent>
									</Popover>
								)}
							</div>
						)}
						{contextWindow && (
							<div className="flex items-center justify-between border-t border-border/70 px-4 py-3.5 text-sm">
								<span className="text-foreground">
									{t("messageEditor.modelSwitch.contextWindow")}
								</span>
								<span className="flex items-center gap-1 text-muted-foreground">
									<span className="tabular-nums">{contextWindow}</span>
									<ChevronRight className="size-4" aria-hidden="true" />
								</span>
							</div>
						)}
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}
