import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, ChevronUp } from "lucide-react"
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
import { cn } from "@/utils/cn"
import { MODEL_DETAILS_HOVER_CLOSE_DELAY_MS } from "../hooks/useModelDetailsHover"
import {
	reasoningEffortLevels,
	type ModelItem,
	type ModelTabType,
	type ReasoningEffort,
} from "../types"
import { getModelDisplayedReasoningEffort } from "../utils"

/** 用列表里的当前模型能力，并保留已选模型上的显式强度。 */
export function resolveReasoningFooterModel({
	activeTab,
	selectedModel,
	groups,
}: {
	activeTab: ModelTabType
	selectedModel?: ModelItem | null
	groups: Array<{ models?: ModelItem[] | null }>
}): ModelItem | null {
	if (activeTab !== "language" || !selectedModel) return null
	const current =
		groups
			.flatMap((group) => group.models ?? [])
			.find((model) => model.model_id === selectedModel.model_id) ?? selectedModel
	if (Object.prototype.hasOwnProperty.call(selectedModel, "reasoning_effort")) {
		return { ...current, reasoning_effort: selectedModel.reasoning_effort ?? null }
	}
	return current
}

/** 与底部遮罩同高，列表滚到底时最后一行可以停在遮罩上方。 */
export const MODEL_REASONING_FOOTER_HEIGHT_CLASS = "h-14"

interface ModelReasoningFooterProps {
	model: ModelItem
	onReasoningEffortChange: (model: ModelItem) => void
	/** 桌面悬停打开。移动端外面的档位直接铺开，不走这个菜单。 */
	openOn?: "hover" | "tap"
	/** 桌面盖住模型列表底部；移动端排在外面的语言模型行下面。 */
	layout?: "overlay" | "inline"
}

/** 桌面盖住列表底部并悬停展开。移动端在外面把档位铺开，模型列表里不选。 */
export function ModelReasoningFooter({
	model,
	onReasoningEffortChange,
	openOn = "hover",
	layout = "overlay",
}: ModelReasoningFooterProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const [override, setOverride] = useState<ReasoningEffort | null | undefined>(undefined)
	const hoverOpened = useRef(false)
	const closeTimer = useRef<ReturnType<typeof setTimeout>>()
	const footerRef = useRef<HTMLDivElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const labels: Record<ReasoningEffort, string> = {
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
	const canSelect = levels.length > 0
	const selected =
		override === undefined
			? canSelect
				? getModelDisplayedReasoningEffort(model)
				: undefined
			: (override ?? undefined)
	const selectedLabel =
		canSelect && selected ? labels[selected] : t("messageEditor.modelSwitch.reasoning.default")

	useEffect(() => {
		setOverride(undefined)
		setOpen(false)
	}, [model.model_id, model.reasoning_effort])
	useEffect(() => () => clearTimeout(closeTimer.current), [])
	useEffect(() => {
		if (openOn !== "tap" || !open) return
		function handlePointerDown(event: PointerEvent) {
			if (footerRef.current?.contains(event.target as Node)) return
			setOpen(false)
		}
		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [open, openOn])

	function keepOpen() {
		clearTimeout(closeTimer.current)
	}

	function openFromHover() {
		if (!canSelect) return
		keepOpen()
		hoverOpened.current = true
		setOpen(true)
	}

	function scheduleClose(event?: { relatedTarget: EventTarget | null }) {
		const relatedTarget = event?.relatedTarget
		const target = relatedTarget instanceof Node ? relatedTarget : null
		if (target && (footerRef.current?.contains(target) || menuRef.current?.contains(target))) {
			return
		}
		clearTimeout(closeTimer.current)
		closeTimer.current = setTimeout(() => {
			hoverOpened.current = false
			setOpen(false)
		}, MODEL_DETAILS_HOVER_CLOSE_DELAY_MS)
	}

	function selectEffort(effort?: ReasoningEffort) {
		modelCache.setReasoningEffort(model, effort)
		setOverride(effort ?? null)
		hoverOpened.current = false
		setOpen(false)
		onReasoningEffortChange({ ...model, reasoning_effort: effort ?? null })
	}

	if (layout === "inline") {
		const options: Array<ReasoningEffort | undefined> = [undefined, ...levels]
		return (
			<div
				ref={footerRef}
				data-testid="model-switch-reasoning-footer"
				className="relative w-full shrink-0 pb-1"
			>
				<div className="flex h-8 items-center">
					<span className="w-7 shrink-0" aria-hidden="true" />
					<span className="text-sm text-muted-foreground">
						{t("messageEditor.modelSwitch.reasoning.label")}
					</span>
					{canSelect ? null : (
						<span className="ml-auto text-sm text-foreground" aria-disabled="true">
							{t("messageEditor.modelSwitch.reasoning.default")}
						</span>
					)}
				</div>
				{canSelect ? (
					<ScrollArea
						scrollbarOrientation="horizontal"
						hideScrollbar
						className="h-8 w-full [&_[data-slot=scroll-area-scrollbar]]:h-0 [&_[data-slot=scroll-area-scrollbar]]:border-0 [&_[data-slot=scroll-area-scrollbar]]:p-0"
						viewportClassName="h-8 w-full [&>div]:!block"
					>
						<div
							className="flex w-max gap-1.5 pl-7"
							role="group"
							aria-label={t("messageEditor.modelSwitch.reasoning.label")}
						>
							{options.map((level) => {
								const pressed = selected === level
								return (
									<button
										key={level ?? "default"}
										type="button"
										aria-pressed={pressed}
										data-testid={`model-switch-reasoning-option-${level ?? "default"}`}
										className={cn(
											"h-8 shrink-0 rounded-full px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
											pressed
												? "bg-foreground font-medium text-background"
												: "bg-background text-foreground active:opacity-80",
										)}
										onClick={() => selectEffort(level)}
									>
										{level
											? labels[level]
											: t("messageEditor.modelSwitch.reasoning.default")}
									</button>
								)
							})}
						</div>
					</ScrollArea>
				) : null}
			</div>
		)
	}

	const MenuIcon = openOn === "tap" ? (open ? ChevronDown : ChevronUp) : ChevronRight
	const shellClass = "absolute inset-x-0 bottom-0 z-10 bg-card"
	const barClass = cn(
		"flex items-center border-t border-border/70 px-3",
		MODEL_REASONING_FOOTER_HEIGHT_CLASS,
	)
	const choices = (
		<div
			className="flex flex-col p-1"
			role="group"
			aria-label={t("messageEditor.modelSwitch.reasoning.label")}
		>
			{[undefined, ...levels].map((level, index) => (
				<div
					key={level ?? "default"}
					className={index === 0 ? "mb-1 border-b pb-1" : undefined}
				>
					<Button
						type="button"
						variant="ghost"
						className={cn(
							"w-full justify-between px-2 text-sm font-normal",
							openOn === "tap" ? "h-11" : "h-9",
						)}
						onClick={() => selectEffort(level)}
						aria-pressed={selected === level}
						data-testid={`model-switch-reasoning-option-${level ?? "default"}`}
					>
						{level ? labels[level] : t("messageEditor.modelSwitch.reasoning.default")}
						{selected === level && <Check className="size-4" aria-hidden="true" />}
					</Button>
				</div>
			))}
		</div>
	)
	const trigger = (
		<button
			type="button"
			disabled={!canSelect}
			className={cn(
				"flex w-full min-w-0 items-center gap-3 rounded-lg px-1 text-left text-sm",
				"outline-none focus-visible:ring-2 focus-visible:ring-ring",
				canSelect
					? openOn === "tap"
						? "h-11 active:bg-muted/70"
						: "h-10 hover:bg-muted/70"
					: "h-10 cursor-default disabled:opacity-100",
				canSelect && open && "bg-muted/70",
			)}
			aria-expanded={canSelect ? open : undefined}
			data-testid="model-switch-reasoning-footer-trigger"
			{...(openOn === "tap" && canSelect
				? {
						onClick: () => {
							setOpen((value) => !value)
						},
					}
				: {})}
		>
			<span className="shrink-0 text-foreground">
				{t("messageEditor.modelSwitch.reasoning.label")}
			</span>
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
				{model.model_name || model.model_id}
			</span>
			<span className="flex shrink-0 items-center gap-1 text-foreground">
				{selectedLabel}
				{canSelect ? <MenuIcon className="size-4 text-muted-foreground" /> : null}
			</span>
		</button>
	)

	// 没有可选档位时仍展示当前模型的思考强度，固定为默认，不打开选择菜单。
	if (!canSelect) {
		return (
			<div ref={footerRef} data-testid="model-switch-reasoning-footer" className={shellClass}>
				<div className={barClass}>{trigger}</div>
			</div>
		)
	}

	if (openOn === "tap") {
		return (
			<div ref={footerRef} data-testid="model-switch-reasoning-footer" className={shellClass}>
				{open ? (
					<div
						data-testid="model-switch-reasoning-menu"
						className="border-t border-border/70 bg-card"
					>
						<ScrollArea viewportClassName="max-h-64">{choices}</ScrollArea>
					</div>
				) : null}
				<div className={barClass}>{trigger}</div>
			</div>
		)
	}

	return (
		<Popover
			open={open}
			onOpenChange={(value) => {
				if (value && hoverOpened.current) return
				if (!value) hoverOpened.current = false
				setOpen(value)
			}}
		>
			<PopoverAnchor asChild>
				<div
					ref={footerRef}
					data-testid="model-switch-reasoning-footer"
					className={cn(shellClass, barClass)}
					onPointerEnter={(event) => {
						if (event.pointerType && event.pointerType !== "mouse") return
						openFromHover()
					}}
					onMouseEnter={openFromHover}
					onPointerLeave={scheduleClose}
					onMouseLeave={scheduleClose}
				>
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				</div>
			</PopoverAnchor>
			<PopoverContent
				ref={menuRef}
				data-testid="model-switch-reasoning-menu"
				data-model-switch-details-overlay
				side="right"
				align="end"
				sideOffset={8}
				collisionPadding={12}
				className="w-36 p-0 duration-100"
				onPointerEnter={keepOpen}
				onMouseEnter={keepOpen}
				onPointerLeave={scheduleClose}
				onMouseLeave={scheduleClose}
				onOpenAutoFocus={(event) => {
					if (hoverOpened.current) event.preventDefault()
				}}
				onCloseAutoFocus={(event) => {
					if (hoverOpened.current) event.preventDefault()
				}}
			>
				{choices}
			</PopoverContent>
		</Popover>
	)
}
