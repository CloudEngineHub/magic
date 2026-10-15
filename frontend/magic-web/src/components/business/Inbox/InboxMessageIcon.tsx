import type { LucideIcon } from "lucide-react"
import {
	AlertCircle,
	Bot,
	Box,
	CheckCircle2,
	CirclePlus,
	CreditCard,
	FileText,
	Sparkles,
	Share2,
	Users,
} from "lucide-react"
import type { InboxIconName } from "./types"
import { cn } from "@/utils/cn"

const INBOX_ICONS: Record<InboxIconName, LucideIcon> = {
	users: Users,
	share: Share2,
	project: Box,
	file: FileText,
	alert: AlertCircle,
	spark: Sparkles,
	points: CirclePlus,
	payment: CreditCard,
	success: CheckCircle2,
	robot: Bot,
}

const INBOX_ICON_TONE: Record<InboxIconName, string> = {
	users: "bg-[#f0f2ff] text-[#5364d7] dark:bg-indigo-500/10 dark:text-indigo-400",
	share: "bg-[#f0f2ff] text-[#5364d7] dark:bg-indigo-500/10 dark:text-indigo-400",
	project: "bg-[#f1f3ff] text-[#5564d9] dark:bg-indigo-500/10 dark:text-indigo-400",
	file: "bg-[#f1f3ff] text-[#5564d9] dark:bg-indigo-500/10 dark:text-indigo-400",
	alert: "bg-[#fff0ef] text-[#ca5d63] dark:bg-destructive/10 dark:text-destructive",
	spark: "bg-[#f1f3ff] text-[#5564d9] dark:bg-indigo-500/10 dark:text-indigo-400",
	points: "bg-[#edf8f3] text-[#2c8466] dark:bg-emerald-500/10 dark:text-emerald-400",
	payment: "bg-[#edf8f3] text-[#2c8466] dark:bg-emerald-500/10 dark:text-emerald-400",
	success: "bg-[#edf8f3] text-[#2c8466] dark:bg-emerald-500/10 dark:text-emerald-400",
	robot: "bg-[#f1f3ff] text-[#5564d9] dark:bg-indigo-500/10 dark:text-indigo-400",
}

function InboxMessageIcon({ name, mobile = false }: { name: InboxIconName; mobile?: boolean }) {
	const Icon = INBOX_ICONS[name]
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center",
				mobile ? "size-10 rounded-[12px]" : "size-[34px] rounded-[10px]",
				INBOX_ICON_TONE[name],
			)}
			aria-hidden
		>
			<Icon className="size-4" />
		</div>
	)
}

export default InboxMessageIcon
