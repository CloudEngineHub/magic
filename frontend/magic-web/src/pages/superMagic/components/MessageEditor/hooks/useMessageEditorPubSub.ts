import { useEffect } from "react"
import type { Editor, JSONContent } from "@tiptap/react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { DraftStore } from "../stores"
import type { SendMessageByContentPayload } from "../types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import type { SuperMagicWidgetEditorCommandPayload } from "@/pages/superMagic/events/message"
import {
	insertMentionFromDroppedData,
	DRAG_TYPE,
	type TabDragData,
	type AttachmentDragData,
	type MultipleFilesDragData,
	type PPTSlideDragData,
} from "../utils/drag"
import { runActiveEditor, useLatestActiveEditor } from "../utils/editorLifecycle"
import { INSPECTOR_DETAIL_TYPE } from "../extensions/inspector-detail/const"

interface UseMessageEditorPubSubParams {
	editor: Editor | null
	isMobile: boolean
	draftStore: DraftStore
	updateContent: (content: JSONContent | undefined) => void
	enableMessageSendByContent: boolean
	onSendMessageByContent: (data: SendMessageByContentPayload) => void
}

interface AddContentPayload {
	content?: JSONContent
	extraData?: {
		hasInput?: boolean
	}
}

type DragData = TabDragData | AttachmentDragData | MultipleFilesDragData | PPTSlideDragData

function isDragData(data: unknown): data is DragData {
	if (!data || typeof data !== "object") return false
	if (!("type" in data)) return false
	const dragType = (data as { type?: string }).type
	return (
		dragType === DRAG_TYPE.Tab ||
		dragType === DRAG_TYPE.ProjectFile ||
		dragType === DRAG_TYPE.ProjectDirectory ||
		dragType === DRAG_TYPE.MultipleFiles ||
		dragType === DRAG_TYPE.PPTSlide
	)
}

function safeEditorFocus(editor: Editor | null) {
	runActiveEditor(editor, (activeEditor) => {
		activeEditor.commands.focus()
	})
}

/** Converts Widget plain text into the editor document written by setInput. */
function createPlainTextDocument(content: string): JSONContent {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: content ? [{ type: "text", text: content }] : [],
			},
		],
	}
}

/** Appends plain text to the final paragraph without changing existing structured nodes. */
function appendPlainTextToDocument(currentContent: JSONContent, content: string): JSONContent {
	const documentContent: JSONContent =
		currentContent.type === "doc"
			? currentContent
			: {
					type: "doc",
					content: [currentContent],
				}
	const nodes = [...(documentContent.content ?? [])]
	const lastIndex = nodes.length - 1
	const lastNode = nodes[lastIndex]

	if (lastNode?.type === "paragraph") {
		nodes[lastIndex] = {
			...lastNode,
			content: [...(lastNode.content ?? []), { type: "text", text: content }],
		}
	} else {
		nodes.push({ type: "paragraph", content: [{ type: "text", text: content }] })
	}

	return { ...documentContent, content: nodes }
}

function useMessageEditorPubSub({
	editor,
	isMobile,
	draftStore,
	updateContent,
	enableMessageSendByContent,
	onSendMessageByContent,
}: UseMessageEditorPubSubParams) {
	const activeEditorRef = useLatestActiveEditor(editor)

	useEffect(() => {
		const handleAddFileToChat = (data: {
			items: TiptapMentionAttributes[]
			is_new_topic: boolean
			autoFocus?: boolean
		}) => {
			const { items, autoFocus = false } = data
			// Delay insert for new topics to allow draft loading
			setTimeout(() => {
				draftStore.waitForLoadDraft().then(() => {
					if (Array.isArray(items) && items.length > 0) {
						const mentions = items.map((item) => ({
							type: "mention",
							attrs: item,
						}))
						runActiveEditor(activeEditorRef.current, (activeEditor) => {
							activeEditor.commands.insertContent(mentions)
							if (autoFocus) {
								activeEditor.commands.focus()
								if (isMobile) {
									activeEditor.commands.scrollIntoView()
								}
							}
						})
					}
				})
			}, 400)
		}

		pubsub.subscribe(PubSubEvents.Add_File_To_Chat, handleAddFileToChat)

		return () => {
			pubsub.unsubscribe(PubSubEvents.Add_File_To_Chat, handleAddFileToChat)
		}
	}, [activeEditorRef, isMobile, draftStore])

	useEffect(() => {
		const handleInsertDragDataToEditor = (dragData: unknown) => {
			if (!isDragData(dragData)) return
			runActiveEditor(activeEditorRef.current, (activeEditor) => {
				insertMentionFromDroppedData({ editor: activeEditor, data: dragData })
			})
		}

		pubsub.subscribe(PubSubEvents.Insert_Drag_Data_To_Editor, handleInsertDragDataToEditor)

		return () => {
			pubsub.unsubscribe(
				PubSubEvents.Insert_Drag_Data_To_Editor,
				handleInsertDragDataToEditor,
			)
		}
	}, [activeEditorRef])

	const handleAddContent = useMemoizedFn((data: AddContentPayload) => {
		const { content, extraData } = data
		if (content) updateContent(content)
		if (extraData?.hasInput) {
			runActiveEditor(activeEditorRef.current, (activeEditor) => {
				activeEditor.commands.focusFirstSuperPlaceholder?.()
			})
		} else {
			safeEditorFocus(activeEditorRef.current)
		}
	})

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Add_Content_To_Chat, handleAddContent)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Add_Content_To_Chat, handleAddContent)
		}
	}, [handleAddContent])

	useEffect(() => {
		const handleSetInputMessage = (message: string | string[] | JSONContent) => {
			// JSONContent object — use directly
			if (typeof message === "object" && !Array.isArray(message) && message !== null) {
				updateContent(message)
				safeEditorFocus(activeEditorRef.current)
				return
			}
			const lines = Array.isArray(message) ? message : [message]
			if (lines.length === 0) return
			const inlineNodes: JSONContent[] = []
			lines.forEach((line, i) => {
				if (i > 0) inlineNodes.push({ type: "hardBreak" })
				if (line) inlineNodes.push({ type: "text", text: line })
			})
			const content: JSONContent = {
				type: "doc",
				content: [{ type: "paragraph", content: inlineNodes }],
			}
			updateContent(content)
			safeEditorFocus(activeEditorRef.current)
		}
		pubsub.subscribe(PubSubEvents.Set_Input_Message, handleSetInputMessage)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Set_Input_Message, handleSetInputMessage)
		}
	}, [activeEditorRef, updateContent])

	useEffect(() => {
		if (!enableMessageSendByContent) {
			return
		}
		pubsub.subscribe(PubSubEvents.Send_Message_by_Content, onSendMessageByContent)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Send_Message_by_Content, onSendMessageByContent)
		}
	}, [enableMessageSendByContent, onSendMessageByContent])

	useEffect(() => {
		const handleInsertDemoText = (text: string) => {
			if (typeof text !== "string" || !text) return
			const content: JSONContent = {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [{ type: "text", text }],
					},
				],
			}
			updateContent(content)
			safeEditorFocus(activeEditorRef.current)
		}
		pubsub.subscribe(PubSubEvents.Set_Demo_Text_To_Input, handleInsertDemoText)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Set_Demo_Text_To_Input, handleInsertDemoText)
		}
	}, [activeEditorRef, updateContent])

	useEffect(() => {
		const handleAppendSuggestion = (input: string | JSONContent) => {
			if (!input) return

			// Determine new nodes to append
			const newNodes: JSONContent[] =
				typeof input === "string"
					? [{ type: "paragraph", content: [{ type: "text", text: input }] }]
					: input.type === "doc"
						? (input.content ?? [])
						: [input]

			if (!newNodes.length) return

			runActiveEditor(activeEditorRef.current, (activeEditor) => {
				const inspectorNode = newNodes[0]?.content?.[0]
				const isSingleInspectorNode =
					newNodes.length === 1 &&
					newNodes[0]?.type === "paragraph" &&
					newNodes[0]?.content?.length === 1 &&
					inspectorNode?.type === INSPECTOR_DETAIL_TYPE

				if (isSingleInspectorNode && inspectorNode) {
					activeEditor.commands.insertContent(inspectorNode)
					activeEditor.commands.focus()
					return
				}

				const currentContent = activeEditor.getJSON()
				const mergedContent: JSONContent = !activeEditor.isEmpty
					? {
							...currentContent,
							content: [...(currentContent.content ?? []), ...newNodes],
						}
					: { type: "doc", content: newNodes }
				updateContent(mergedContent)
				activeEditor.commands.focus()
			})
		}
		pubsub.subscribe(PubSubEvents.Append_Suggestion_To_Editor, handleAppendSuggestion)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Append_Suggestion_To_Editor, handleAppendSuggestion)
		}
	}, [activeEditorRef, updateContent])

	useEffect(() => {
		const handleAppendContent = (content: JSONContent) => {
			if (!content || !activeEditorRef.current) return

			const newNodes: JSONContent[] =
				content.type === "doc" ? (content.content ?? []) : [content]
			if (newNodes.length === 0) return

			const inspectorNode = newNodes[0]?.content?.[0]
			const isSingleInspectorNode =
				newNodes.length === 1 &&
				newNodes[0]?.type === "paragraph" &&
				newNodes[0]?.content?.length === 1 &&
				inspectorNode?.type === INSPECTOR_DETAIL_TYPE

			if (isSingleInspectorNode && inspectorNode) {
				runActiveEditor(activeEditorRef.current, (activeEditor) => {
					activeEditor.commands.insertContent(inspectorNode)
				})
				safeEditorFocus(activeEditorRef.current)
				return
			}

			const currentContent = activeEditorRef.current.getJSON()
			const mergedContent: JSONContent = !activeEditorRef.current?.isEmpty
				? {
						...currentContent,
						content: [...(currentContent.content ?? []), ...newNodes],
					}
				: { type: "doc", content: newNodes }
			updateContent(mergedContent)
			safeEditorFocus(activeEditorRef.current)
		}
		pubsub.subscribe(PubSubEvents.Append_Content_To_Editor, handleAppendContent)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Append_Content_To_Editor, handleAppendContent)
		}
	}, [activeEditorRef, updateContent])

	useEffect(() => {
		const handleWidgetEditorCommand = (payload: SuperMagicWidgetEditorCommandPayload) => {
			runActiveEditor(activeEditorRef.current, (activeEditor) => {
				if (payload.command === "setInput") {
					updateContent(createPlainTextDocument(payload.content ?? ""))
					activeEditor.commands.focus()
					payload.respond()
					return
				}

				if (payload.command === "appendInput") {
					updateContent(
						appendPlainTextToDocument(activeEditor.getJSON(), payload.content ?? ""),
					)
					activeEditor.commands.focus()
					payload.respond()
					return
				}

				if (payload.command === "clearInput") {
					updateContent({ type: "doc", content: [{ type: "paragraph" }] })
					activeEditor.commands.focus()
					payload.respond()
					return
				}

				payload.respond(activeEditor.getText({ blockSeparator: "\n" }))
			})
		}

		pubsub.subscribe(PubSubEvents.Magic_Widget_Editor_Command, handleWidgetEditorCommand)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Magic_Widget_Editor_Command, handleWidgetEditorCommand)
		}
	}, [activeEditorRef, updateContent])
}

export default useMessageEditorPubSub
