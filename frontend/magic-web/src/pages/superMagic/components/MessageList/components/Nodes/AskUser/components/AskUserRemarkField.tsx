import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	type ChangeEvent,
} from "react"
import { Textarea } from "@/components/shadcn-ui/textarea"
import { cn } from "@/utils/cn"
import type { AskUserLocale } from "@/pages/superMagic/components/MessageList/utils/askUser"
import { AskUserQuestionMarkdownTitle } from "@/pages/superMagic/components/MessageList/utils/AskUserMarkdownText"
import {
	getAskUserRemarkLabel,
	getAskUserRemarkPlaceholder,
} from "@/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/tools/AskUser/otherOption"

const askUserBreakTextClass = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
const ASK_USER_INPUT_MAX_HEIGHT = 200
const askUserScrollAreaClass =
	"[scrollbar-width:thin] [scrollbar-color:rgb(var(--muted-foreground-rgb)_/_0.22)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20"

const askUserRemarkTextareaClassByVariant = {
	v2: `min-h-16 w-full max-h-[200px] min-w-0 resize-none overflow-hidden rounded-md border border-border bg-background px-2 py-1 text-left text-sm font-normal leading-5 text-foreground shadow-none outline-none placeholder:text-sm placeholder:text-muted-foreground focus-visible:border-border focus-visible:!ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${askUserScrollAreaClass}`,
	legacy:
		"min-h-16 w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-left text-[13px] font-normal leading-4 text-foreground shadow-none placeholder:text-[13px] placeholder:text-muted-foreground focus-visible:border-border focus-visible:!ring-0 md:text-[13px]",
} as const

const askUserRemarkTitleClassByVariant = {
	v2: "text-sm leading-5 font-normal text-foreground",
	legacy: "text-xs font-medium leading-4 text-foreground",
} as const

interface AskUserRemarkFieldProps {
	value: string
	onChange?: (value: string) => void
	disabled?: boolean
	readOnly?: boolean
	locale: AskUserLocale
	className?: string
	testIdPrefix?: "ask-user-v2-card" | "ask-user-card"
	variant?: keyof typeof askUserRemarkTextareaClassByVariant
	contentIndentClass?: string
}

export function AskUserRemarkField({
	value,
	onChange,
	disabled = false,
	readOnly = false,
	locale,
	className,
	testIdPrefix = "ask-user-card",
	variant = "legacy",
	contentIndentClass,
}: AskUserRemarkFieldProps) {
	const label = getAskUserRemarkLabel(locale)
	const placeholder = getAskUserRemarkPlaceholder(locale)
	const showReadOnly = readOnly || disabled
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const syncTextareaHeight = useCallback(() => {
		const textarea = textareaRef.current
		if (!textarea || variant !== "v2") return
		textarea.style.height = "auto"
		const nextHeight = Math.min(textarea.scrollHeight, ASK_USER_INPUT_MAX_HEIGHT)
		textarea.style.height = `${nextHeight}px`
		textarea.style.overflowY =
			textarea.scrollHeight > ASK_USER_INPUT_MAX_HEIGHT ? "auto" : "hidden"
	}, [variant])

	useLayoutEffect(() => {
		syncTextareaHeight()
	}, [syncTextareaHeight, value, placeholder])

	useEffect(() => {
		if (showReadOnly && !value.trim()) return
		syncTextareaHeight()
	}, [showReadOnly, syncTextareaHeight, value])

	if (showReadOnly && !value.trim()) return null

	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		onChange?.(event.target.value)
	}

	return (
		<div
			className={cn("space-y-1.5", className)}
			data-testid={`${testIdPrefix}-remark-field`}
		>
			<AskUserQuestionMarkdownTitle
				content={label}
				className={cn(askUserRemarkTitleClassByVariant[variant], askUserBreakTextClass)}
				testId={`${testIdPrefix}-remark-label`}
			/>
			<div className={contentIndentClass}>
				{variant === "legacy" ? (
					<Textarea
						ref={textareaRef}
						value={value}
						disabled={showReadOnly}
						readOnly={showReadOnly}
						placeholder={placeholder}
						onChange={handleChange}
						data-testid={`${testIdPrefix}-remark-input`}
						className={askUserRemarkTextareaClassByVariant.legacy}
					/>
				) : (
					<textarea
						ref={textareaRef}
						value={value}
						disabled={showReadOnly}
						readOnly={showReadOnly}
						placeholder={placeholder}
						onChange={handleChange}
						rows={1}
						data-testid={`${testIdPrefix}-remark-input`}
						className={askUserRemarkTextareaClassByVariant.v2}
					/>
				)}
			</div>
		</div>
	)
}
