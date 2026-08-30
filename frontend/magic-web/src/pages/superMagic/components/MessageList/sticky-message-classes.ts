import { cn } from "@/utils/cn"

export const USER_MESSAGE_STICKY_POSITION_CLASS = "sticky z-20"

export const USER_MESSAGE_STICKY_MASK_CLASS = cn(
	"isolate overflow-visible",
	"[--sticky-message-mask-bg:rgb(var(--sidebar-rgb))] [--sticky-message-mask-fade-from:rgb(var(--sidebar-rgb))]",
	"before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-[var(--sticky-message-mask-bg)] before:content-['']",
	"after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:z-0 after:h-4 after:bg-gradient-to-b after:from-[var(--sticky-message-mask-fade-from)] after:to-transparent after:content-['']",
	"[&>*]:relative [&>*]:z-[1]",
)

export const USER_MESSAGE_STICKY_OVERLAY_CLASS = cn(
	USER_MESSAGE_STICKY_POSITION_CLASS,
	USER_MESSAGE_STICKY_MASK_CLASS,
)

/** Mobile keeps the same sticky User row but uses the mobile page background without a fade tail. */
export const USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE = cn(
	"before:bg-[rgb(var(--mobile-background-rgb))]",
	"after:bg-none",
)

export function getUserMessageStickyTopClass(
	isMobile: boolean,
): "top-0 [--sticky-message-top:0px]" | "top-[40px] [--sticky-message-top:40px]" {
	return isMobile ? "top-0 [--sticky-message-top:0px]" : "top-[40px] [--sticky-message-top:40px]"
}

/** Extra classes applied to the row wrapper when the message is from the user */
export const USER_MESSAGE_ROW_CLASS = "flex min-w-0 justify-end"

/**
 * Assistant content keeps a timeline gutter, while terminal status badges cancel only that
 * gutter through the inherited CSS variable so they align with top-level Tool statuses.
 */
export const ASSISTANT_MESSAGE_ROW_CLASS =
	"pb-2 pl-6 [--message-status-offset:-1.5rem] after:absolute after:left-[11px] after:top-0 after:z-[-1] after:h-full after:w-px after:border-l after:border-dashed after:border-border after:content-['']"

/** Distance from the viewport top at which the active User turn parks while pinned. */
export function getStickyMessageTopOffset(isMobile: boolean) {
	return isMobile ? 0 : 40
}
