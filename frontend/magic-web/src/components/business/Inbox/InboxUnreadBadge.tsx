import { cn } from "@/utils/cn"

interface InboxUnreadBadgeProps {
	label: string | null
	className?: string
	testId?: string
}

function InboxUnreadBadge({
	label,
	className,
	testId = "inbox-unread-badge",
}: InboxUnreadBadgeProps) {
	if (!label) return null

	return (
		<span
			data-testid={testId}
			className={cn(
				"inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white",
				className,
			)}
		>
			{label}
		</span>
	)
}

export default InboxUnreadBadge
