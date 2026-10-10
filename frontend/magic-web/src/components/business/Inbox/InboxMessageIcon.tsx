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
	Users,
} from "lucide-react"
import type { InboxIconName } from "./types"
import { cn } from "@/utils/cn"

const INBOX_ICONS: Record<InboxIconName, LucideIcon> = {
	users: Users,
	share: Box,
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
	users: "bg-violet-500/10 text-violet-600",
	share: "bg-blue-500/10 text-blue-600",
	project: "bg-blue-500/10 text-blue-600",
	file: "bg-blue-500/10 text-blue-600",
	alert: "bg-destructive/10 text-destructive",
	spark: "bg-violet-500/10 text-violet-600",
	points: "bg-amber-500/10 text-amber-600",
	payment: "bg-sky-500/10 text-sky-600",
	success: "bg-emerald-500/10 text-emerald-600",
	robot: "bg-violet-500/10 text-violet-600",
}

function InboxMessageIcon({ name }: { name: InboxIconName }) {
	const Icon = INBOX_ICONS[name]
	return (
		<div
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-full",
				INBOX_ICON_TONE[name],
			)}
			aria-hidden
		>
			<Icon className="size-4" />
		</div>
	)
}

export default InboxMessageIcon
