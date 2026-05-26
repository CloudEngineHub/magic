import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { ForwardRefExoticComponent, RefAttributes } from "react"
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react"
import { Document } from "@tiptap/extension-document"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { PlaceholderExtension } from "@/pages/superMagic/components/MessageEditor/extensions"
import { UndoRedo } from "@tiptap/extensions"
import { cn } from "@/lib/utils"
import MentionExtension from "@/components/business/MentionPanel/tiptap-plugin"
import GlobalMentionPanelStore from "@/components/business/MentionPanel/builtin-store"
import { useTranslation } from "react-i18next"
import type { Language } from "@/components/business/MentionPanel/i18n/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import SuperMagicVoiceInput from "@/pages/superMagic/components/MessageEditor/components/VoiceInput"
import type { MagicPromptEditorProps, MagicPromptEditorRef, MentionNodeInfo } from "./types"
import AIPolishButton from "./AIPolishButton"
import "./MagicPromptEditor.css"

/**
 * MagicPromptEditor — A reusable Tiptap-based prompt editor with @mention support
 * and optional AI polish functionality.
 *
 * Designed to replace <textarea> in forms where mention/@ linking is needed.
 */
const MagicPromptEditor = forwardRef<MagicPromptEditorRef, MagicPromptEditorProps>(
	(
		{
			value,
			textValue,
			onChange,
			onTextChange,
			placeholder,
			disabled = false,
			minHeight = 100,
			maxHeight,
			enableMention = true,
			mentionPanelStore = GlobalMentionPanelStore,
			onMentionInsert,
			onMentionRemove,
			enableAIPolish = false,
			onAIPolish,
			enableVoice = false,
			className,
			rows,
			onBlur,
			bottomToolbar,
		},
		ref,
	) => {
		const { i18n, t } = useTranslation("super")
		const [isPolishing, setIsPolishing] = useState(false)
		const contentRef = useRef<string>(JSON.stringify(value ?? null))

		const computedMinHeight = rows ? rows * 24 + 16 : minHeight

		const initialContent =
			value ??
			(textValue
				? {
						type: "doc",
						content: [
							{ type: "paragraph", content: [{ type: "text", text: textValue }] },
						],
					}
				: undefined)

		const editor = useEditor({
			content: initialContent,
			editable: !disabled,
			extensions: [
				Document,
				Paragraph,
				Text,
				PlaceholderExtension.configure({
					placeholder: placeholder ?? "",
					showOnlyCurrent: false,
				}),
				UndoRedo.configure({ depth: 50, newGroupDelay: 300 }),
				...(enableMention
					? [
							MentionExtension.configure({
								language: i18n.language as Language,
								getParentContainer: () => document.body,
								onInsert: (item) => {
									onMentionInsert?.({ type: item.type, data: item.data })
								},
								onRemove: (item) => {
									onMentionRemove?.({ type: item.type, data: item.data })
								},
								dataService: mentionPanelStore,
							}),
						]
					: []),
			],
			onUpdate({ editor: ed }) {
				const json = ed.getJSON()
				const snapshot = JSON.stringify(json)
				if (snapshot === contentRef.current) return
				contentRef.current = snapshot
				onChange?.(json)
				onTextChange?.(getPlainText(ed.getJSON()))
			},
			onBlur({ editor: ed, event }) {
				// Don't trigger blur when the mention/suggestion panel is active
				const isSuggestionActive = ed.state.plugins.some((plugin) => {
					try {
						const pluginState = plugin.getState(ed.state)
						return (
							pluginState &&
							typeof pluginState === "object" &&
							"active" in pluginState &&
							pluginState.active === true
						)
					} catch {
						return false
					}
				})
				if (isSuggestionActive) return

				// Don't trigger blur if focus moved to an element inside the editor's own container
				const relatedTarget = (event as FocusEvent)?.relatedTarget as HTMLElement | null
				if (relatedTarget) {
					const editorContainer =
						ed.view.dom.closest(".magic-prompt-editor")?.parentElement
					if (editorContainer?.contains(relatedTarget)) return
				}

				onBlur?.()
			},
			editorProps: {
				attributes: {
					class: "prose prose-sm max-w-none focus:outline-none",
				},
			},
		})

		// Sync disabled state
		useMemo(() => {
			if (editor && editor.isEditable === disabled) {
				editor.setEditable(!disabled)
			}
		}, [editor, disabled])

		/** Extract plain text from JSON content, representing mentions as @name */
		const getPlainText = useCallback((json?: JSONContent): string => {
			if (!json) return ""
			const parts: string[] = []
			const walk = (node: JSONContent) => {
				if (node.type === "text" && node.text) {
					parts.push(node.text)
				} else if (node.type === "mention" && node.attrs) {
					const data = node.attrs.data
					const name = data?.name || data?.agent_name || data?.file_name || "mention"
					parts.push(`@${name}`)
				} else if (node.type === "paragraph") {
					if (parts.length > 0) parts.push("\n")
				}
				if (node.content) {
					node.content.forEach(walk)
				}
			}
			walk(json)
			return parts.join("").trim()
		}, [])

		/** Collect all mention nodes with placeholder tokens for AI polish */
		const collectMentionNodes = useCallback((): MentionNodeInfo[] => {
			if (!editor) return []
			const mentions: MentionNodeInfo[] = []
			let idx = 0
			editor.state.doc.descendants((node, pos) => {
				if (node.type.name === "mention") {
					mentions.push({
						pos,
						attrs: { type: node.attrs.type, data: node.attrs.data },
						placeholder: `{{MENTION_${idx}}}`,
					})
					idx++
				}
			})
			return mentions
		}, [editor])

		/** Get text content with mention placeholders for AI processing */
		const getTextWithPlaceholders = useCallback((): {
			text: string
			mentions: MentionNodeInfo[]
		} => {
			if (!editor) return { text: "", mentions: [] }
			const mentions = collectMentionNodes()
			const mentionMap = new Map(mentions.map((m) => [m.pos, m.placeholder]))

			const parts: string[] = []
			let lastParagraph = false
			editor.state.doc.descendants((node, pos) => {
				if (node.type.name === "paragraph") {
					if (lastParagraph) parts.push("\n")
					lastParagraph = true
					return true // continue into children
				}
				if (node.type.name === "text" && node.text) {
					parts.push(node.text)
					return false
				}
				if (node.type.name === "mention") {
					const placeholder = mentionMap.get(pos)
					if (placeholder) parts.push(placeholder)
					return false
				}
				return true
			})
			return { text: parts.join(""), mentions }
		}, [editor, collectMentionNodes])

		/** Rebuild editor content from polished text, restoring mention nodes */
		const rebuildContentFromPolishedText = useCallback(
			(polishedText: string, mentions: MentionNodeInfo[]) => {
				if (!editor) return

				// Build a new document: split polished text by mention placeholders and reconstruct
				const mentionByPlaceholder = new Map(mentions.map((m) => [m.placeholder, m.attrs]))

				// Build regex to split by placeholders
				const placeholderPattern = /(\{\{MENTION_\d+\}\})/g
				const paragraphs = polishedText.split("\n")

				const docContent: JSONContent[] = paragraphs.map((para) => {
					const segments = para.split(placeholderPattern)
					const content: JSONContent[] = []

					for (const seg of segments) {
						if (!seg) continue
						const mentionAttrs = mentionByPlaceholder.get(seg)
						if (mentionAttrs) {
							content.push({
								type: "mention",
								attrs: mentionAttrs,
							})
						} else {
							content.push({ type: "text", text: seg })
						}
					}

					return {
						type: "paragraph",
						content: content.length > 0 ? content : undefined,
					}
				})

				const newDoc: JSONContent = { type: "doc", content: docContent }
				editor.commands.setContent(newDoc)
				contentRef.current = JSON.stringify(newDoc)
				onChange?.(newDoc)
				onTextChange?.(getPlainText(newDoc))
			},
			[editor, onChange, onTextChange, getPlainText],
		)

		/** Handle AI polish action */
		const handleAIPolish = useCallback(async () => {
			if (!onAIPolish || !editor || isPolishing) return

			setIsPolishing(true)
			try {
				const { text, mentions } = getTextWithPlaceholders()
				if (!text.trim()) return

				const polished = await onAIPolish(text, mentions)
				if (polished && polished !== text) {
					rebuildContentFromPolishedText(polished, mentions)
				}
			} finally {
				setIsPolishing(false)
			}
		}, [
			onAIPolish,
			editor,
			isPolishing,
			getTextWithPlaceholders,
			rebuildContentFromPolishedText,
		])

		// Expose ref API
		useImperativeHandle(ref, () => ({
			getEditor: () => editor,
			getJSON: () => editor?.getJSON(),
			getText: () => getPlainText(editor?.getJSON()),
			setContent: (content: JSONContent) => {
				editor?.commands.setContent(content)
				contentRef.current = JSON.stringify(content)
			},
			clear: () => {
				editor?.commands.clearContent()
				contentRef.current = JSON.stringify(null)
			},
			focus: () => editor?.commands.focus(),
		}))

		const hasToolbar = (enableAIPolish && onAIPolish) || enableVoice

		/** Called by SuperMagicVoiceInput after each voice update */
		const handleVoiceUpdateValue = useCallback(
			(json: JSONContent) => {
				contentRef.current = JSON.stringify(json)
				onChange?.(json)
				onTextChange?.(getPlainText(json))
			},
			[onChange, onTextChange, getPlainText],
		)

		return (
			<div
				className={cn(
					"flex flex-col rounded-md border border-input bg-background text-sm",
					"ring-offset-background",
					"focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
					disabled && "cursor-not-allowed opacity-50",
					"[&_img.ProseMirror-separator]:inline",
					className,
				)}
			>
				<div className="flex flex-1">
					{/* Editor content */}
					<div
						className="magic-prompt-editor flex-1 cursor-text overflow-y-auto px-3 py-2"
						style={{
							minHeight: computedMinHeight,
							maxHeight: maxHeight,
						}}
						onClick={() => editor?.commands.focus()}
					>
						<EditorContent editor={editor} />
					</div>

					{/* Right-side toolbar */}
					{hasToolbar && (
						<div className="flex flex-col items-center gap-1 border-l border-input px-1 py-1.5">
							{enableAIPolish && onAIPolish && (
								<AIPolishButton
									onClick={handleAIPolish}
									loading={isPolishing}
									disabled={disabled}
								/>
							)}
							{enableVoice && (
								<SuperMagicVoiceInput
									tiptapEditor={editor}
									updateValue={handleVoiceUpdateValue}
									iconSize={14}
									className="!h-7 !w-7 !bg-transparent !text-muted-foreground hover:!text-primary hover:!bg-primary/10"
									tooltipText={t("detail.aiCard.form.voiceInput", "语音输入")}
									tooltipSide="left"
								/>
							)}
						</div>
					)}
				</div>

				{/* Bottom toolbar slot */}
				{bottomToolbar && <div className="border-t border-input">{bottomToolbar}</div>}
			</div>
		)
	},
) as ForwardRefExoticComponent<MagicPromptEditorProps & RefAttributes<MagicPromptEditorRef>>

MagicPromptEditor.displayName = "MagicPromptEditor"

export default MagicPromptEditor
