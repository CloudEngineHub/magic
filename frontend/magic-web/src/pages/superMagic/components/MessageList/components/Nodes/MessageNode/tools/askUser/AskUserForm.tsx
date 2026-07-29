import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type MouseEvent,
} from "react"
import { RadioGroup, RadioGroupItem } from "@/components/shadcn-ui/radio-group"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import { ASK_USER_CONFIRM_VALUE } from "@/pages/superMagic/components/MessageList/utils/askUserConstants"
import type { AskUserLocale } from "@/pages/superMagic/components/MessageList/utils/askUser"
import {
	clearAskUserDraftAnswers,
	readAskUserDraftAnswers,
	writeAskUserDraftAnswers,
	type AskUserDraftAnswers,
} from "@/pages/superMagic/components/MessageList/utils/askUserDraftCache"
import type { ParsedQuestion } from "./parse"
import {
	getAskUserAutoSubmitInText,
	getAskUserDefaultValueHintText,
	getAskUserInputPlaceholder,
	getAskUserMultiSelectRangeText,
	ASK_USER_OTHER_SENTINEL,
	AskUserOtherInput,
	getAskUserOtherPlaceholder,
	getAskUserRenderableOptions,
	getAskUserSkipActionText,
	getAskUserSubmitActionText,
	getAskUserUnlimitedText,
	mapMultiSelectAnswer,
	resolveMultiSelectDisplayState,
	resolveSelectDisplayState,
} from "./otherOption"

type AnswerValue = string | readonly string[]
export type AskUserAnswers = Readonly<Record<string, AnswerValue>>
type AskUserFormStatus = "pending" | "answered" | "skipped" | "timeout" | "cancelled" | string

interface AskUserFormProps {
	questions: readonly ParsedQuestion[]
	locale: AskUserLocale
	/** LLM arguments 仍在流式输入：未完成题只读，按钮不可用 */
	streaming?: boolean
	/** 表单整体冻结（本地已提交 / 工具响应已到）：所有字段只读、按钮不可用 */
	disabled?: boolean
	/** 到期时间戳（秒），不存在则不显示倒计时 */
	expiresAt?: number
	/** 已提交的答案（来自 toolResponseMap，用于回显） */
	submittedAnswers?: Readonly<Record<string, AnswerValue>>
	status?: AskUserFormStatus
	draftCacheKey?: string
	onSubmit?: (answers: AskUserAnswers) => void
	onSkip?: (answers: AskUserAnswers) => void
	onProgressChange?: (count: number) => void
	className?: string
}

const EMPTY_ARRAY: readonly string[] = Object.freeze([])
const ASK_USER_CONFIRM_SELECT_OPTIONS = [
	ASK_USER_CONFIRM_VALUE.yes,
	ASK_USER_CONFIRM_VALUE.no,
] as const
const askUserQuestionPanelClass = "mt-1.5 min-w-0 rounded-md border border-border bg-muted p-2.5"
const askUserBreakTextClass = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
const askUserBodyTextClass = "text-sm leading-5"
const askUserQuestionTextClass = `${askUserBodyTextClass} font-normal text-foreground`
const askUserMutedTextClass = `${askUserBodyTextClass} text-muted-foreground`
const askUserScrollAreaClass =
	"[scrollbar-width:thin] [scrollbar-color:rgb(var(--muted-foreground-rgb)_/_0.22)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20"
const ASK_USER_INPUT_MAX_HEIGHT = 200
const askUserInputClass = `min-h-16 w-full max-h-[200px] min-w-0 resize-none overflow-hidden rounded-md border border-border bg-background px-2 py-1 text-left text-sm font-normal leading-5 text-foreground shadow-none outline-none placeholder:text-sm placeholder:text-muted-foreground focus-visible:border-border focus-visible:!ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${askUserScrollAreaClass}`
const askUserOptionControlBase =
	"mt-0.5 size-4 shrink-0 border border-input bg-background shadow-xs focus-visible:ring-1 focus-visible:ring-ring/50"
const askUserOptionRowClass = "flex min-h-6 cursor-pointer items-start gap-2 py-0.5"

function formatAnswerForDisplay(value?: AnswerValue | null) {
	if (Array.isArray(value)) return value.join("、")
	return value || ""
}

function getSingleAnswerValue(value?: AnswerValue) {
	if (typeof value === "string") return value
	if (Array.isArray(value)) return value[0] || ""
	return ""
}

function shouldIgnoreOptionRowClick(event: MouseEvent<HTMLElement>) {
	const target = event.target
	return target instanceof HTMLElement && Boolean(target.closest("button,input,textarea"))
}

function formatQuestionTitle(question: ParsedQuestion, index: number, total: number) {
	if (total <= 1) return question.label
	if (/^\s*\d+[.\u3001)\uff09]\s*/.test(question.label)) return question.label
	return `${index + 1}. ${question.label}`
}

function normalizeDefaultAnswer(question: ParsedQuestion): AnswerValue | null {
	const defaultValue = question.defaultValue
	if (defaultValue === undefined || defaultValue === null) return null
	if (question.type === "multi_select") {
		if (Array.isArray(defaultValue)) return defaultValue
		return defaultValue
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
	}
	if (Array.isArray(defaultValue)) return defaultValue[0] || ""
	return defaultValue
}

function buildDefaultAnswers(questions: readonly ParsedQuestion[]) {
	const answers: Record<string, AnswerValue> = {}
	for (const question of questions) {
		const defaultValue = normalizeDefaultAnswer(question)
		if (defaultValue === null) return { isComplete: false, answers }
		if (!isAnsweredQuestionValueValid(question, defaultValue))
			return { isComplete: false, answers }
		answers[question.id] = defaultValue
	}
	return { isComplete: questions.length > 0, answers }
}

function isAnsweredQuestionValueValid(question: ParsedQuestion, answer: AnswerValue | undefined) {
	if (question.type === "multi_select") {
		const values = parseMultiSelectAnswer(answer)
			.map((item) => item.trim())
			.filter(Boolean)
		if (values.length === 0) return false
		const min = question.min ?? 1
		if (values.length < min) return false
		if (typeof question.max === "number" && values.length > question.max) return false
		return true
	}

	if (typeof answer === "string") return answer.trim().length > 0
	if (Array.isArray(answer)) return (answer[0] || "").trim().length > 0
	return false
}

function getAnsweredQuestionCount(
	questions: readonly ParsedQuestion[],
	answers?: Readonly<Record<string, AnswerValue>>,
) {
	if (!answers) return 0
	return questions.filter((question) =>
		isAnsweredQuestionValueValid(question, answers[question.id]),
	).length
}

function getEmptyAnswerValue(question: ParsedQuestion): AnswerValue {
	return question.type === "multi_select" ? EMPTY_ARRAY : ""
}

function useCountdown(expiresAt: number | undefined, onExpire?: () => void) {
	const [remaining, setRemaining] = useState<number>(() => {
		if (!expiresAt) return -1
		return Math.max(0, Math.ceil(expiresAt - Date.now() / 1000))
	})
	const onExpireRef = useRef(onExpire)
	onExpireRef.current = onExpire

	useEffect(() => {
		if (!expiresAt) {
			setRemaining(-1)
			return
		}
		const calc = () => Math.max(0, Math.ceil(expiresAt - Date.now() / 1000))
		setRemaining(calc())

		const timer = setInterval(() => {
			const next = calc()
			setRemaining(next)
			if (next <= 0) {
				clearInterval(timer)
				onExpireRef.current?.()
			}
		}, 1000)

		return () => clearInterval(timer)
	}, [expiresAt])

	return remaining
}

function formatCountdown(seconds: number): string {
	const totalSeconds = Math.max(seconds, 0)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const secondsPart = totalSeconds % 60
	return [hours, minutes, secondsPart].map((value) => value.toString().padStart(2, "0")).join(":")
}

/**
 * 只透出"写入 answer"能力，子组件按键时不会让父 render。
 * Provider value 在组件生命周期内引用稳定，不会造成 Provider 级重渲染。
 */
interface AnswersContextValue {
	writeAnswer: (id: string, value: AnswerValue) => void
}

const AnswersContext = createContext<AnswersContextValue | null>(null)

function useWriteAnswer() {
	const ctx = useContext(AnswersContext)
	if (!ctx) {
		throw new Error("useWriteAnswer must be used within <AnswersContext.Provider>")
	}
	return ctx.writeAnswer
}

function AskUserFormImpl({
	questions,
	locale,
	streaming,
	disabled,
	expiresAt,
	submittedAnswers,
	status = "pending",
	draftCacheKey,
	onSubmit,
	onSkip,
	onProgressChange,
	className,
}: AskUserFormProps) {
	// answersRef 是 submit 时的唯一真源；按键路径只写不读，避免触发父 render
	const answersRef = useRef<Record<string, AnswerValue>>({})
	const [draftAnswers, setDraftAnswers] = useState<Readonly<Record<string, AnswerValue>>>()

	const hasPending = useMemo(() => questions.some((q) => !q.isComplete), [questions])
	const isTimeout = status === "timeout"
	const isTerminal = ["answered", "skipped", "timeout", "cancelled"].includes(status)

	const writeAnswer = useCallback(
		(id: string, value: AnswerValue) => {
			answersRef.current[id] = value
			if (draftCacheKey && !submittedAnswers && !isTerminal) {
				writeAskUserDraftAnswers(draftCacheKey, answersRef.current as AskUserDraftAnswers)
			}
			onProgressChange?.(getAnsweredQuestionCount(questions, answersRef.current))
		},
		[draftCacheKey, isTerminal, onProgressChange, questions, submittedAnswers],
	)

	const ctxValue = useMemo<AnswersContextValue>(() => ({ writeAnswer }), [writeAnswer])

	const actionsDisabled =
		Boolean(streaming) ||
		Boolean(disabled) ||
		hasPending ||
		questions.length === 0 ||
		isTerminal
	const submitDisabled = actionsDisabled
	const defaultAnswers = useMemo(() => buildDefaultAnswers(questions), [questions])
	const displayAnswers = submittedAnswers || (isTimeout ? defaultAnswers.answers : undefined)

	const handleSubmit = useCallback(
		(answers?: AskUserAnswers) => {
			const sourceAnswers = answers || answersRef.current
			const nextAnswers = Object.fromEntries(
				questions.map((question) => [
					question.id,
					sourceAnswers[question.id] ?? getEmptyAnswerValue(question),
				]),
			) as Record<string, AnswerValue>
			onSubmit?.(nextAnswers as AskUserAnswers)
		},
		[onSubmit, questions],
	)

	const handleSkip = useCallback(() => {
		onSkip?.({ ...answersRef.current } as AskUserAnswers)
	}, [onSkip])

	const expiredRef = useRef(false)
	const onCountdownExpire = useCallback(() => {
		if (expiredRef.current) return
		expiredRef.current = true
		if (defaultAnswers.isComplete) {
			handleSubmit(defaultAnswers.answers)
			return
		}
		onSkip?.({ ...answersRef.current } as AskUserAnswers)
	}, [defaultAnswers.answers, defaultAnswers.isComplete, handleSubmit, onSkip])

	const remaining = useCountdown(
		!disabled && !streaming && !isTerminal ? expiresAt : undefined,
		onCountdownExpire,
	)
	const showCountdown = typeof expiresAt === "number" && remaining > 0 && !disabled && !isTerminal
	const shouldShowActions = !submittedAnswers && !isTerminal

	useEffect(() => {
		onProgressChange?.(
			getAnsweredQuestionCount(questions, submittedAnswers || answersRef.current),
		)
	}, [onProgressChange, questions, submittedAnswers])

	useEffect(() => {
		if (!draftCacheKey) {
			setDraftAnswers(undefined)
			return
		}
		if (submittedAnswers || isTerminal) {
			clearAskUserDraftAnswers(draftCacheKey)
			setDraftAnswers(undefined)
			return
		}

		const nextDraftAnswers = readAskUserDraftAnswers(draftCacheKey) as Readonly<
			Record<string, AnswerValue>
		> | null
		answersRef.current = nextDraftAnswers ? { ...nextDraftAnswers } : {}
		setDraftAnswers(nextDraftAnswers || undefined)
		onProgressChange?.(getAnsweredQuestionCount(questions, answersRef.current))
	}, [draftCacheKey, isTerminal, onProgressChange, questions, submittedAnswers])

	return (
		<AnswersContext.Provider value={ctxValue}>
			<div
				className={cn("flex max-h-[500px] min-h-0 w-full flex-col gap-1.5", className)}
				data-testid="ask-user-v2-card-form"
			>
				<div
					className={cn("flex min-h-0 flex-1 flex-col", askUserQuestionPanelClass)}
					data-testid="ask-user-v2-card-question-panel"
				>
					<div
						className={cn(
							"-mr-1.5 min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-3",
							askUserScrollAreaClass,
						)}
						data-testid="ask-user-v2-card-questions"
					>
						{questions.map((question, index) => (
							<QuestionItem
								key={question.id}
								index={index}
								locale={locale}
								total={questions.length}
								question={question}
								disabled={
									Boolean(disabled) || (!!streaming && !question.isComplete)
								}
								submittedAnswer={displayAnswers?.[question.id]}
								draftAnswer={draftAnswers?.[question.id]}
								showDefaultHint={!displayAnswers && !disabled && !isTimeout}
							/>
						))}
					</div>
				</div>
				{shouldShowActions && (
					<div className="shrink-0 pt-0.5" data-testid="ask-user-v2-card-footer">
						<div className="flex flex-wrap items-center justify-between gap-1.5">
							{showCountdown ? (
								<div
									className={cn(
										"flex min-w-0 items-center gap-1 font-medium",
										askUserMutedTextClass,
									)}
								>
									<span
										className={cn(
											"min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
										)}
									>
										{getAskUserAutoSubmitInText({
											locale,
											time: formatCountdown(remaining),
										})}
									</span>
								</div>
							) : (
								<div />
							)}
							<div className="flex shrink-0 items-center gap-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={actionsDisabled}
									onClick={handleSkip}
									data-testid="ask-user-v2-card-skip-button"
									className="h-7 rounded-md border border-border px-3 text-sm font-medium leading-5 text-foreground shadow-none"
								>
									{getAskUserSkipActionText(locale)}
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={submitDisabled}
									onClick={() => handleSubmit()}
									data-testid="ask-user-v2-card-submit-button"
									className="h-7 rounded-md bg-primary px-3 text-sm font-medium leading-5 text-primary-foreground shadow-none hover:bg-primary/90"
								>
									{getAskUserSubmitActionText(locale)}
								</Button>
							</div>
						</div>
					</div>
				)}
			</div>
		</AnswersContext.Provider>
	)
}

interface QuestionItemProps {
	index: number
	locale: AskUserLocale
	total: number
	question: ParsedQuestion
	disabled: boolean
	submittedAnswer?: AnswerValue
	showDefaultHint: boolean
	draftAnswer?: AnswerValue
}

const QuestionItem = memo(function QuestionItem({
	index,
	locale,
	total,
	question,
	disabled,
	submittedAnswer,
	showDefaultHint,
	draftAnswer,
}: QuestionItemProps) {
	const hasMultipleQuestions = total > 1
	const questionContentIndentClass =
		hasMultipleQuestions && question.type === "input" ? "pl-4" : undefined

	return (
		<div
			className={cn("space-y-1.5 transition-opacity", !question.isComplete && "opacity-70")}
			data-testid={`ask-user-v2-card-question-item-${question.id}`}
		>
			<p
				className={cn(askUserQuestionTextClass, askUserBreakTextClass)}
				data-testid={`ask-user-v2-card-question-text-${question.id}`}
			>
				{question.label ? (
					formatQuestionTitle(question, index, total)
				) : (
					<span className="text-muted-foreground">...</span>
				)}
			</p>

			<div className={questionContentIndentClass}>
				{question.type === "confirm" && (
					<SelectField
						questionId={question.id}
						options={ASK_USER_CONFIRM_SELECT_OPTIONS}
						otherPlaceholder={getAskUserOtherPlaceholder(locale)}
						disabled={disabled}
						submittedAnswer={submittedAnswer}
						draftAnswer={draftAnswer}
					/>
				)}

				{question.type === "input" && (
					<InputField
						questionId={question.id}
						placeholder={question.placeholder ?? getAskUserInputPlaceholder(locale)}
						disabled={disabled}
						submittedAnswer={submittedAnswer}
						draftAnswer={draftAnswer}
					/>
				)}

				{question.type === "select" && (
					<SelectField
						questionId={question.id}
						options={question.options}
						otherPlaceholder={getAskUserOtherPlaceholder(locale)}
						disabled={disabled}
						submittedAnswer={submittedAnswer}
						draftAnswer={draftAnswer}
					/>
				)}

				{question.type === "multi_select" && (
					<MultiSelectField
						questionId={question.id}
						locale={locale}
						options={question.options}
						otherPlaceholder={getAskUserOtherPlaceholder(locale)}
						min={question.min}
						max={question.max}
						disabled={disabled}
						submittedAnswer={submittedAnswer}
						draftAnswer={draftAnswer}
					/>
				)}
			</div>
			{showDefaultHint && question.defaultValue !== undefined && (
				<p
					className={askUserMutedTextClass}
					data-testid={`ask-user-v2-card-default-value-hint-${question.id}`}
				>
					<span className={askUserBreakTextClass}>
						{getAskUserDefaultValueHintText({
							locale,
							defaultValue: formatAnswerForDisplay(question.defaultValue),
						})}
					</span>
				</p>
			)}
		</div>
	)
})

interface InputFieldProps {
	questionId: string
	placeholder?: string
	disabled: boolean
	submittedAnswer?: AnswerValue
	draftAnswer?: AnswerValue
}

const InputField = memo(function InputField({
	questionId,
	placeholder,
	disabled,
	submittedAnswer,
	draftAnswer,
}: InputFieldProps) {
	const writeAnswer = useWriteAnswer()
	const [value, setValue] = useState(() => getSingleAnswerValue(draftAnswer))
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const displayValue = typeof submittedAnswer === "string" ? submittedAnswer : value

	useEffect(() => {
		setValue(getSingleAnswerValue(draftAnswer))
	}, [draftAnswer, questionId])

	useLayoutEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.style.height = "auto"
		const nextHeight = Math.min(textarea.scrollHeight, ASK_USER_INPUT_MAX_HEIGHT)
		textarea.style.height = `${nextHeight}px`
		textarea.style.overflowY =
			textarea.scrollHeight > ASK_USER_INPUT_MAX_HEIGHT ? "auto" : "hidden"
	}, [displayValue, placeholder])

	const handleChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			const next = e.target.value
			setValue(next)
			writeAnswer(questionId, next)
		},
		[questionId, writeAnswer],
	)

	return (
		<textarea
			ref={textareaRef}
			value={displayValue}
			placeholder={placeholder}
			disabled={disabled}
			onChange={handleChange}
			rows={1}
			data-testid={`ask-user-v2-card-input-${questionId}`}
			className={askUserInputClass}
		/>
	)
})

interface SelectFieldProps {
	questionId: string
	options: readonly string[]
	otherPlaceholder: string
	disabled: boolean
	submittedAnswer?: AnswerValue
	draftAnswer?: AnswerValue
}

const SelectField = memo(function SelectField({
	questionId,
	options,
	otherPlaceholder,
	disabled,
	submittedAnswer,
	draftAnswer,
}: SelectFieldProps) {
	const writeAnswer = useWriteAnswer()
	const initialDraftState = useMemo(
		() => resolveSelectDisplayState(options, draftAnswer),
		[options, draftAnswer],
	)
	const [value, setValue] = useState(() => initialDraftState.selectedValue)
	const [otherText, setOtherText] = useState(() => initialDraftState.otherText)

	const renderableOptions = useMemo(() => getAskUserRenderableOptions(options), [options])
	const submittedState = useMemo(
		() => resolveSelectDisplayState(options, submittedAnswer),
		[options, submittedAnswer],
	)

	const displayValue = submittedAnswer !== undefined ? submittedState.selectedValue : value
	const displayOtherText = submittedAnswer !== undefined ? submittedState.otherText : otherText

	useEffect(() => {
		setValue(initialDraftState.selectedValue)
		setOtherText(initialDraftState.otherText)
	}, [initialDraftState, questionId])

	const handleChange = useCallback(
		(next: string) => {
			setValue(next)
			writeAnswer(questionId, next === ASK_USER_OTHER_SENTINEL ? otherText : next)
		},
		[otherText, questionId, writeAnswer],
	)

	const handleOtherTextChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			const next = e.target.value
			setOtherText(next)
			writeAnswer(questionId, next)
		},
		[questionId, writeAnswer],
	)

	return (
		<RadioGroup
			value={displayValue}
			onValueChange={handleChange}
			disabled={disabled}
			className="gap-0.5"
			data-testid={`ask-user-v2-card-select-group-${questionId}`}
		>
			{renderableOptions.map((opt, idx) => {
				const optionId = `${questionId}-opt-${idx}`
				const isOther = opt === ASK_USER_OTHER_SENTINEL
				return (
					<div
						key={optionId}
						className={askUserOptionRowClass}
						onClick={(event) => {
							if (disabled || shouldIgnoreOptionRowClick(event)) return
							handleChange(opt)
						}}
						data-testid={`ask-user-v2-card-select-option-${questionId}`}
					>
						<RadioGroupItem
							id={optionId}
							value={opt}
							disabled={disabled}
							className={cn(
								askUserOptionControlBase,
								"rounded-full text-foreground [&_svg]:fill-primary",
							)}
						/>
						{isOther ? (
							<AskUserOtherInput
								testIdPrefix="select"
								placeholder={otherPlaceholder}
								value={displayOtherText}
								onChange={handleOtherTextChange}
								onFocus={() => {
									if (displayValue !== ASK_USER_OTHER_SENTINEL) {
										setValue(ASK_USER_OTHER_SENTINEL)
									}
									writeAnswer(questionId, displayOtherText)
								}}
								disabled={disabled}
								questionId={questionId}
							/>
						) : (
							<span className={cn(askUserQuestionTextClass, askUserBreakTextClass)}>
								{opt}
							</span>
						)}
					</div>
				)
			})}
		</RadioGroup>
	)
})

interface MultiSelectFieldProps {
	questionId: string
	locale: AskUserLocale
	options: readonly string[]
	otherPlaceholder: string
	min?: number
	max?: number
	disabled: boolean
	submittedAnswer?: AnswerValue
	draftAnswer?: AnswerValue
}

function parseMultiSelectAnswer(answer: AnswerValue | undefined): readonly string[] {
	if (!answer) return EMPTY_ARRAY
	if (Array.isArray(answer)) return answer.filter(Boolean)
	try {
		const parsed = JSON.parse(answer)
		if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string")
	} catch {
		/* not JSON array, treat as single value */
	}
	return [answer]
}

const MultiSelectField = memo(function MultiSelectField({
	questionId,
	locale,
	options,
	otherPlaceholder,
	min,
	max,
	disabled,
	submittedAnswer,
	draftAnswer,
}: MultiSelectFieldProps) {
	const writeAnswer = useWriteAnswer()

	const renderableOptions = useMemo(() => getAskUserRenderableOptions(options), [options])
	const draftValues = useMemo(() => parseMultiSelectAnswer(draftAnswer), [draftAnswer])
	const draftState = useMemo(
		() => resolveMultiSelectDisplayState(options, draftValues),
		[options, draftValues],
	)
	const [value, setValue] = useState<readonly string[]>(() => draftState.selectedValues)
	const [otherText, setOtherText] = useState(() => draftState.otherText)
	const submittedValues = useMemo(
		() => parseMultiSelectAnswer(submittedAnswer),
		[submittedAnswer],
	)
	const submittedState = useMemo(
		() => resolveMultiSelectDisplayState(options, submittedValues),
		[options, submittedValues],
	)
	const displayValue = submittedAnswer !== undefined ? submittedState.selectedValues : value
	const displayOtherText = submittedAnswer !== undefined ? submittedState.otherText : otherText
	const maxSelectionReached = typeof max === "number" && displayValue.length >= max

	const valueRef = useRef<readonly string[]>(EMPTY_ARRAY)
	valueRef.current = value

	useEffect(() => {
		setValue(draftState.selectedValues)
		setOtherText(draftState.otherText)
	}, [draftState, questionId])

	const toggle = useCallback(
		(option: string, checked: boolean) => {
			const current = valueRef.current
			let next: readonly string[]
			if (checked) {
				if (current.includes(option)) return
				next = [...current, option]
			} else {
				if (!current.includes(option)) return
				next = current.filter((x) => x !== option)
			}
			setValue(next)
			writeAnswer(questionId, mapMultiSelectAnswer(next, otherText))
		},
		[otherText, questionId, writeAnswer],
	)

	const handleOtherTextChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			const next = e.target.value
			setOtherText(next)
			writeAnswer(questionId, mapMultiSelectAnswer(valueRef.current, next))
		},
		[questionId, writeAnswer],
	)

	return (
		<div className="space-y-2">
			<div
				className="space-y-0.5"
				data-testid={`ask-user-v2-card-multi-select-group-${questionId}`}
			>
				{renderableOptions.map((opt, idx) => {
					const optionId = `${questionId}-opt-${idx}`
					const checked = displayValue.includes(opt)
					const isOther = opt === ASK_USER_OTHER_SENTINEL
					return (
						<div
							key={optionId}
							className={askUserOptionRowClass}
							onClick={(event) => {
								if (
									disabled ||
									(!checked && maxSelectionReached) ||
									shouldIgnoreOptionRowClick(event)
								) {
									return
								}
								toggle(opt, !checked)
							}}
							data-testid={`ask-user-v2-card-multi-select-option-${questionId}`}
						>
							<Checkbox
								id={optionId}
								checked={checked}
								disabled={disabled || (!checked && maxSelectionReached)}
								onCheckedChange={(next) => toggle(opt, next === true)}
								className={cn(
									askUserOptionControlBase,
									"rounded-[4px] data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
								)}
							/>
							{isOther ? (
								<AskUserOtherInput
									testIdPrefix="multi-select"
									placeholder={otherPlaceholder}
									value={displayOtherText}
									onChange={handleOtherTextChange}
									onFocus={() => {
										if (
											!displayValue.includes(ASK_USER_OTHER_SENTINEL) &&
											!maxSelectionReached
										) {
											toggle(ASK_USER_OTHER_SENTINEL, true)
										}
									}}
									disabled={disabled || (!checked && maxSelectionReached)}
									questionId={questionId}
								/>
							) : (
								<span
									className={cn(askUserQuestionTextClass, askUserBreakTextClass)}
								>
									{opt}
								</span>
							)}
						</div>
					)
				})}
			</div>
			{(min !== undefined || max !== undefined) && (
				<p
					className={askUserMutedTextClass}
					data-testid={`ask-user-v2-card-multi-select-hint-${questionId}`}
				>
					{getAskUserMultiSelectRangeText({
						locale,
						min: min ?? 1,
						max: typeof max === "number" ? max : getAskUserUnlimitedText(locale),
					})}
				</p>
			)}
		</div>
	)
})

export const AskUserForm = memo(AskUserFormImpl)
