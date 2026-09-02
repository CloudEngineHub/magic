import { cn } from "@/utils/cn"
import type { AskUserLocale } from "@/pages/superMagic/components/MessageList/utils/askUser"
import {
	getAskUserRemarkLabel,
	getAskUserRemarkPlaceholder,
} from "@/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/tools/AskUser/otherOption"

const askUserRemarkScrollAreaClass =
	"[scrollbar-width:thin] [scrollbar-color:rgb(var(--muted-foreground-rgb)_/_0.22)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20"
const askUserRemarkTextareaClass = `min-h-14 w-full max-h-[120px] min-w-0 resize-none overflow-hidden rounded-md border border-border bg-background px-2.5 py-2 text-left text-sm font-normal leading-5 text-foreground shadow-none outline-none placeholder:text-sm placeholder:text-muted-foreground focus-visible:border-border focus-visible:!ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${askUserRemarkScrollAreaClass}`
const askUserRemarkReadonlyClass =
	"min-w-0 whitespace-pre-wrap break-words text-sm leading-5 text-foreground [overflow-wrap:anywhere]"

interface AskUserRemarkFieldProps {
	value: string
	onChange?: (value: string) => void
	disabled?: boolean
	readOnly?: boolean
	locale: AskUserLocale
	className?: string
	testIdPrefix?: "ask-user-v2-card" | "ask-user-card"
}

export function AskUserRemarkField({
	value,
	onChange,
	disabled = false,
	readOnly = false,
	locale,
	className,
	testIdPrefix = "ask-user-card",
}: AskUserRemarkFieldProps) {
	const label = getAskUserRemarkLabel(locale)
	const placeholder = getAskUserRemarkPlaceholder(locale)
	const showReadOnly = readOnly || disabled

	if (showReadOnly && !value.trim()) return null

	return (
		<div
			className={cn("space-y-1.5", className)}
			data-testid={`${testIdPrefix}-remark-field`}
		>
			<label
				className="text-xs font-medium leading-4 text-muted-foreground"
				htmlFor={`${testIdPrefix}-remark-input`}
			>
				{label}
			</label>
			{showReadOnly ? (
				<p
					className={askUserRemarkReadonlyClass}
					data-testid={`${testIdPrefix}-remark-display`}
				>
					{value}
				</p>
			) : (
				<textarea
					id={`${testIdPrefix}-remark-input`}
					value={value}
					disabled={disabled}
					placeholder={placeholder}
					onChange={(event) => onChange?.(event.target.value)}
					data-testid={`${testIdPrefix}-remark-input`}
					className={askUserRemarkTextareaClass}
				/>
			)}
		</div>
	)
}
