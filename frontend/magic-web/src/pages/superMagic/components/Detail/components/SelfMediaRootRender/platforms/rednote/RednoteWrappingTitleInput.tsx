import { useLayoutEffect, useRef } from "react"
import type { ClipboardEvent, KeyboardEvent } from "react"

interface RednoteWrappingTitleInputProps {
	value: string
	disabled?: boolean
	ariaLabel: string
	testId?: string
	className?: string
	onChange: (value: string) => void
	onCommit: (value: string) => void
	onCancel: () => void
}

function normalizeTitleText(value: string) {
	return value.replace(/[\r\n]+/g, " ")
}

function insertTextAtSelection(element: HTMLElement, text: string) {
	const selection = window.getSelection()
	if (!selection || selection.rangeCount === 0) {
		element.textContent = text
		return
	}

	const range = selection.getRangeAt(0)
	if (!element.contains(range.commonAncestorContainer)) {
		element.textContent = text
		return
	}

	range.deleteContents()
	const textNode = document.createTextNode(text)
	range.insertNode(textNode)
	range.setStartAfter(textNode)
	range.collapse(true)
	selection.removeAllRanges()
	selection.addRange(range)
}

export function RednoteWrappingTitleInput({
	value,
	disabled,
	ariaLabel,
	testId,
	className,
	onChange,
	onCommit,
	onCancel,
}: RednoteWrappingTitleInputProps) {
	const editorRef = useRef<HTMLDivElement | null>(null)

	useLayoutEffect(() => {
		const editor = editorRef.current
		if (!editor) return
		const nextValue = normalizeTitleText(value)
		if (editor.textContent !== nextValue) editor.textContent = nextValue
	}, [value])

	const readValue = () => normalizeTitleText(editorRef.current?.textContent ?? "")

	const handleInput = () => {
		const editor = editorRef.current
		if (!editor) return
		const nextValue = readValue()
		if (editor.textContent !== nextValue) {
			const selection = window.getSelection()
			editor.textContent = nextValue
			if (selection) {
				const range = document.createRange()
				range.selectNodeContents(editor)
				range.collapse(false)
				selection.removeAllRanges()
				selection.addRange(range)
			}
		}
		onChange(nextValue)
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault()
			onCancel()
			return
		}
		if (event.key === "Enter") {
			event.preventDefault()
			onCommit(readValue())
		}
	}

	const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
		event.preventDefault()
		const text = normalizeTitleText(event.clipboardData.getData("text/plain"))
		const editor = editorRef.current
		if (!editor) return
		insertTextAtSelection(editor, text)
		onChange(readValue())
	}

	return (
		<div
			ref={editorRef}
			contentEditable={!disabled}
			suppressContentEditableWarning
			role="textbox"
			aria-multiline="false"
			aria-disabled={disabled}
			aria-label={ariaLabel}
			data-testid={testId}
			autoFocus
			spellCheck={false}
			onInput={handleInput}
			onKeyDown={handleKeyDown}
			onPaste={handlePaste}
			onBlur={() => onCommit(readValue())}
			className={className}
		/>
	)
}
