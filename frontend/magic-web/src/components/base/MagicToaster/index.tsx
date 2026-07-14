import { cn } from "@/lib/utils"
import { Toaster } from "@/components/shadcn-ui/sonner"
import type { ToasterProps } from "sonner"

interface MagicToasterProps extends Partial<ToasterProps> {
	/** 是否使用居中定位样式，默认 true */
	centered?: boolean
}

/**
 * Wraps the shared Sonner toaster with the app's centered layout rules while
 * keeping mobile toasts inside the safe viewport for long localized messages.
 */
export default function MagicToaster({
	centered = true,
	visibleToasts = 3,
	position = "top-center",
	// Sonner collapses non-front toasts (hides inner content) when false
	expand = true,
	className,
	...rest
}: MagicToasterProps) {
	return (
		<Toaster
			visibleToasts={visibleToasts}
			expand={expand}
			className={cn(
				centered && [
					"!left-0 !right-0 !top-[calc(var(--safe-area-inset-top)+40px)] !w-auto !translate-x-0",
					"[&_[data-sonner-toast]]:!left-0 [&_[data-sonner-toast]]:!right-0 [&_[data-sonner-toast]]:!mx-auto",
					// Desktop keeps the original compact single-line toast footprint.
					"[&_[data-sonner-toast]]:!w-fit [&_[data-sonner-toast]]:!whitespace-nowrap [&_[data-sonner-toast]]:!py-2",
					// Mobile keeps short messages compact but still caps long content to the
					// safe viewport width so localized warnings wrap instead of overflowing.
					"max-md:[&_[data-sonner-toast]]:!w-fit max-md:[&_[data-sonner-toast]]:!max-w-[calc(100vw-24px)] max-md:[&_[data-sonner-toast]]:!whitespace-normal max-md:[&_[data-sonner-toast]]:![overflow-wrap:anywhere]",
					// Sonner nests title/description containers, so they need explicit wrapping
					// overrides to prevent inner text nodes from restoring no-wrap behavior.
					"max-md:[&_[data-sonner-toast]_*]:!whitespace-normal max-md:[&_[data-sonner-toast]_*]:![overflow-wrap:anywhere]",
				],
				className,
			)}
			position={position}
			{...rest}
		/>
	)
}
