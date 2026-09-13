import { useId, useRef, useState } from "react"
import { Slot } from "@radix-ui/react-slot"
import {
	autoUpdate,
	flip,
	FloatingFocusManager,
	FloatingPortal,
	offset,
	safePolygon,
	shift,
	useClick,
	useDismiss,
	useFloating,
	useFocus,
	useHover,
	useInteractions,
	useRole,
} from "@floating-ui/react"
import { ArrowRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Dialog } from "@/components/shadcn-ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import {
	useOverlayInteractionScopeAttributes,
	useOverlayInteractionScopeContentAttributes,
} from "@/components/shadcn-ui/overlay-interaction-scope"
import { HelpDialog } from "./HelpDialog"
import type { ContextHelpProps } from "./types"

export type { ContextHelpProps, HelpDefinition } from "./types"

/** 同一个入口负责简介和完整说明；业务只提供内容，不复制浮层状态与焦点逻辑。 */
export function ContextHelp({ help, mode, children }: ContextHelpProps) {
	const { t } = useTranslation("interface")
	const [layer, setLayer] = useState<"closed" | "preview" | "dialog">("closed")
	const suppressFocusPreview = useRef(false)
	const titleId = useId()
	const dialogId = useId()
	const triggerScope = useOverlayInteractionScopeAttributes()
	const contentScope = useOverlayInteractionScopeContentAttributes()
	const previewEnabled = mode === "preview" && layer !== "dialog"
	const { refs, floatingStyles, context } = useFloating({
		open: layer === "preview",
		onOpenChange(open, _event, reason) {
			if (open && reason === "focus" && suppressFocusPreview.current) return
			// 键盘已进入说明时，鼠标移出不能让「查看更多」消失。
			if (
				!open &&
				(reason === "hover" || reason === "safe-polygon") &&
				refs.floating.current?.contains(document.activeElement)
			)
				return
			setLayer((current) => (current === "dialog" ? current : open ? "preview" : "closed"))
		},
		placement: "right-start",
		middleware: [offset(4), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	})
	const hover = useHover(context, {
		enabled: previewEnabled,
		mouseOnly: true,
		move: false,
		handleClose: safePolygon(),
	})
	const focus = useFocus(context, { enabled: previewEnabled })
	const click = useClick(context, { enabled: previewEnabled, toggle: false })
	const dismiss = useDismiss(context, { enabled: previewEnabled })
	const role = useRole(context, { role: "dialog", enabled: previewEnabled })
	const { getReferenceProps, getFloatingProps } = useInteractions([
		hover,
		focus,
		click,
		dismiss,
		role,
	])

	function openDialog() {
		suppressFocusPreview.current = true
		setLayer("dialog")
	}

	const trigger = (
		<Slot
			ref={refs.setReference}
			{...getReferenceProps({
				onPointerDown() {
					suppressFocusPreview.current = false
				},
				onBlur() {
					suppressFocusPreview.current = false
				},
				onClick() {
					if (mode === "dialog") openDialog()
				},
			})}
			{...triggerScope}
			aria-haspopup="dialog"
			aria-expanded={mode === "dialog" ? layer === "dialog" : layer !== "closed"}
			aria-controls={
				layer === "dialog"
					? dialogId
					: mode === "preview" && layer === "preview"
						? context.floatingId
						: undefined
			}
		>
			{children}
		</Slot>
	)

	return (
		<Dialog open={layer === "dialog"} onOpenChange={(open) => !open && setLayer("closed")}>
			{mode === "dialog" ? (
				<Tooltip
					open={layer === "preview"}
					onOpenChange={(open) => {
						if (open && suppressFocusPreview.current) return
						setLayer((current) =>
							current === "dialog" ? current : open ? "preview" : "closed",
						)
					}}
				>
					<TooltipTrigger asChild>{trigger}</TooltipTrigger>
					<TooltipContent side="bottom" className="max-w-72">
						{help.summary}
					</TooltipContent>
				</Tooltip>
			) : (
				trigger
			)}
			{mode === "preview" && layer === "preview" && (
				<FloatingPortal>
					<FloatingFocusManager
						context={context}
						modal={false}
						initialFocus={-1}
						returnFocus={false}
					>
						<div
							ref={refs.setFloating}
							style={floatingStyles}
							className="z-tooltip w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none"
							{...getFloatingProps({
								onPointerDown: (event) => event.stopPropagation(),
								onClick: (event) => event.stopPropagation(),
								onDoubleClick: (event) => event.stopPropagation(),
								onKeyDown: (event) => event.stopPropagation(),
							})}
							{...contentScope}
							aria-labelledby={titleId}
						>
							<div className="flex items-center gap-3">
								{help.identity && (
									<span className="inline-flex shrink-0">
										{help.identity.renderIcon(28)}
									</span>
								)}
								<div className="min-w-0">
									<p id={titleId} className="break-all font-medium">
										{help.identity?.name ?? help.title}
									</p>
									{help.identity && (
										<p className="text-xs text-muted-foreground">
											{help.title}
											{help.identity.scope ? " · " + help.identity.scope : ""}
										</p>
									)}
								</div>
							</div>
							<p className="text-xs leading-5 text-muted-foreground">
								{help.summary}
							</p>
							{help.points?.length ? (
								<ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
									{help.points.map((point) => (
										<li key={point}>{point}</li>
									))}
								</ul>
							) : null}
							<div className="flex justify-end">
								<Button variant="ghost" size="sm" onClick={openDialog}>
									{t("contextHelp.more")}
									<ArrowRight size={16} />
								</Button>
							</div>
						</div>
					</FloatingFocusManager>
				</FloatingPortal>
			)}
			{layer === "dialog" && (
				<HelpDialog
					help={help}
					id={dialogId}
					onCloseAutoFocus={(event) => {
						event.preventDefault()
						// 简介关闭时不恢复焦点；完整面板关闭后才返回原入口，且不立即重开简介。
						suppressFocusPreview.current = true
						const triggerElement = refs.domReference.current
						if (triggerElement instanceof HTMLElement && triggerElement.isConnected)
							triggerElement.focus()
					}}
				/>
			)}
		</Dialog>
	)
}
