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
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { reasoningEffortLevels, type ModelItem, type ReasoningEffort } from "../types"
import { useModelDetailsHover } from "../hooks/useModelDetailsHover"
import { CollapsibleDescription } from "./CollapsibleDescription"
import { ModelBillingMultiplier } from "./ModelBillingMultiplier"
import { cn } from "@/utils/cn"

interface ModelReasoningDetailsProps {
	model: ModelItem
	description?: string
	mobile: boolean
	disabled: boolean
	onSelect: (model: ModelItem) => void
	children: ReactElement
}

/** 紧凑模型行的三级详情；桌面跨区域共享悬停状态，移动端单层切换。 */
export function ModelReasoningDetails({
	model,
	description = model.model_description,
	mobile,
	disabled,
	onSelect,
	children,
}: ModelReasoningDetailsProps) {
	const { t } = useTranslation("super")
	const id = useId()
	const hover = useModelDetailsHover()
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
	const selected = modelCache.getReasoningEffort(model)
	const selectedLabel = selected
		? labels[selected]
		: t("messageEditor.modelSwitch.reasoning.default")
	const hasMultiplier =
		typeof model.billing_multiplier === "number" &&
		Number.isFinite(model.billing_multiplier) &&
		model.billing_multiplier >= 0

	/** 在详情和子菜单的任意入口取消父层关闭及其他模型的待切换任务。 */
	function keepOpen() {
		hover.keepOpen()
	}

	/** 离开某一级时等待跨越 Portal 间隙，不因子菜单曾打开而永久固定父层。 */
	function scheduleClose() {
		clearTimeout(levelTimer.current)
		// 键盘仍在详情中操作时，鼠标移出不能使焦点所在面板消失。
		if (
			detailRef.current?.contains(document.activeElement) ||
			levelsRef.current?.contains(document.activeElement)
		)
			return
		if (!mobile) hover.requestClose(id)
	}

	/** 手动点击与键盘可以立即打开；鼠标悬停经过短暂等待。 */
	function showDetails(immediate = false) {
		if (disabled) return
		hoverOpened.current = !immediate
		hover.requestOpen(id, immediate)
	}

	/** 先固定强度，再触发既有模型选择与浮层关闭流程。 */
	function selectEffort(effort?: ReasoningEffort) {
		modelCache.setReasoningEffort(model, effort)
		hover.requestClose(id, true)
		setLevelsOpen(false)
		onSelect({ ...model, reasoning_effort: effort ?? null })
	}

	/** 子菜单入口支持悬停与点击，离开前取消尚未执行的打开任务。 */
	function scheduleLevels() {
		keepOpen()
		clearTimeout(levelTimer.current)
		levelTimer.current = setTimeout(() => {
			levelsHoverOpened.current = true
			setLevelsOpen(true)
		}, 140)
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
				{[undefined, ...levels].map((level, index) => (
					<div
						key={level ?? "default"}
						className={index === 0 ? "mb-1 border-b pb-1" : undefined}
					>
						<Button
							variant="ghost"
							className="h-9 w-full justify-between px-2 text-sm font-normal"
							onClick={() => selectEffort(level)}
							aria-pressed={selected === level}
						>
							{level
								? labels[level]
								: t("messageEditor.modelSwitch.reasoning.default")}
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
			className="h-9 w-full justify-between bg-accent px-2 text-sm font-normal"
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
						open && !mobile && "[&_[data-testid=model-switch-item]]:bg-accent",
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
				side={mobile ? "top" : "right"}
				align="start"
				sideOffset={4}
				className="w-64 max-w-[calc(100vw-32px)] p-3 duration-100"
				onPointerEnter={keepOpen}
				onPointerLeave={scheduleClose}
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
						<div className="break-words text-sm font-semibold">{model.model_name}</div>
						{description && (
							<ScrollArea viewportClassName="max-h-48">
								<div className="mt-2">
									<CollapsibleDescription
										description={description}
										isExpanded={descriptionExpanded}
										expandLabel={t(
											"messageEditor.modelSwitch.expandDescription",
										)}
										collapseLabel={t(
											"messageEditor.modelSwitch.collapseDescription",
										)}
										onToggle={() => setDescriptionExpanded((value) => !value)}
									/>
								</div>
							</ScrollArea>
						)}
						{hasMultiplier && (
							<div className="mt-3 border-t px-2 py-3 text-sm">
								<div className="flex items-center justify-between">
									<span>{t("messageEditor.modelSwitch.billingMultiplier")}</span>
									<ModelBillingMultiplier value={model.billing_multiplier} />
								</div>
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
									{t("messageEditor.modelSwitch.billingMultiplierHint")}
								</p>
							</div>
						)}
						{levels.length > 0 && (
							<div className={hasMultiplier ? undefined : "mt-3 border-t pt-3"}>
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
											side="right"
											align="start"
											sideOffset={4}
											className="w-36 p-0 duration-100"
											onPointerEnter={keepOpen}
											onPointerLeave={scheduleClose}
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
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}
