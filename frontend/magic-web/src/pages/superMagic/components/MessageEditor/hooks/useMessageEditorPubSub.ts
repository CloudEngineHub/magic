import { useEffect, useRef } from "react"
import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { DraftStore } from "../stores"
import type { SendMessageByContentPayload } from "../types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import type { SuperMagicWidgetEditorCommandPayload } from "@/pages/superMagic/events/message"
import type { HtmlMultiSelectionRequest } from "@/components/business/ElementInspector"
import { buildHtmlMultiSelectionPromptContent } from "@/components/business/ElementInspector"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { htmlScreenshotUploadService } from "../services/HtmlScreenshotUploadService"
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
	onSendMessageByContent: (data: SendMessageByContentPayload) => void | Promise<void>
	projectId?: string
	topicId?: string
}

interface AddContentPayload {
	content?: JSONContent
	extraData?: {
		hasInput?: boolean
		focusAtEnd?: boolean
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

function getScreenshotFileName(targetId: string, index: number) {
	const safeTargetId = targetId.replace(/[^a-zA-Z0-9_-]/g, "-")
	return `html-screenshot-${safeTargetId || index + 1}.png`
}

function useMessageEditorPubSub({
	editor,
	isMobile,
	draftStore,
	updateContent,
	enableMessageSendByContent,
	onSendMessageByContent,
	projectId,
	topicId,
}: UseMessageEditorPubSubParams) {
	const activeEditorRef = useLatestActiveEditor(editor)
	const preparedScreenshotMentionsRef = useRef(new Map<string, TiptapMentionAttributes>())
	const preparingScreenshotPromisesRef = useRef(
		new Map<string, Promise<TiptapMentionAttributes>>(),
	)

	const uploadScreenshot = useMemoizedFn(
		(targetId: string, dataUrl: string, fileName: string) => {
			const prepared = preparedScreenshotMentionsRef.current.get(targetId)
			if (prepared) return Promise.resolve(prepared)

			const preparing = preparingScreenshotPromisesRef.current.get(targetId)
			if (preparing) return preparing

			const promise = (async () => {
				if (!projectId) throw new Error("当前项目不可用，无法上传截图")
				const savedFile = await htmlScreenshotUploadService.uploadScreenshot({
					dataUrl,
					fileName,
					projectId,
					topicId,
				})
				const mention: TiptapMentionAttributes = {
					type: MentionItemType.PROJECT_FILE,
					data: {
						file_id: savedFile.file_id,
						file_name: savedFile.file_name,
						file_path: savedFile.relative_file_path ?? savedFile.file_key,
						file_extension: savedFile.file_name.split(".").pop() ?? "",
						file_size: savedFile.file_size,
						is_hidden: true,
					},
				}
				preparedScreenshotMentionsRef.current.set(targetId, mention)
				return mention
			})()

			preparingScreenshotPromisesRef.current.set(targetId, promise)
			void promise.then(
				() => preparingScreenshotPromisesRef.current.delete(targetId),
				() => preparingScreenshotPromisesRef.current.delete(targetId),
			)
			return promise
		},
	)

	useEffect(() => {
		const handlePrepareHtmlScreenshot = async (request: {
			targetId: string
			dataUrl: string
			fileName?: string
			onSuccess?: (mention: TiptapMentionAttributes) => void
			onError?: (error: unknown) => void
		}) => {
			try {
				const mention = await uploadScreenshot(
					request.targetId,
					request.dataUrl,
					request.fileName ?? `html-screenshot-${Date.now()}.png`,
				)
				request.onSuccess?.(mention)
			} catch (error) {
				request.onError?.(error)
			}
		}
		pubsub.subscribe(PubSubEvents.Prepare_Html_Screenshot, handlePrepareHtmlScreenshot)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Prepare_Html_Screenshot, handlePrepareHtmlScreenshot)
		}
	}, [uploadScreenshot])

	useEffect(() => {
		const handleSubmitHtmlMultiSelection = async (request: HtmlMultiSelectionRequest) => {
			try {
				const screenshotTargets = request.targets.filter(
					(target) => target.kind === "screenshot" && Boolean(target.screenshot?.dataUrl),
				)
				const screenshotMentions = new Map(
					await Promise.all(
						screenshotTargets.map(
							async (target, index) =>
								[
									target.id ?? `screenshot:${index}`,
									target.screenshot?.mention ??
										(await uploadScreenshot(
											target.id ?? `screenshot:${index}`,
											target.screenshot?.dataUrl ?? "",
											getScreenshotFileName(
												target.id ?? `screenshot:${index}`,
												index,
											),
										)),
								] as const,
						),
					),
				)
				const content = buildHtmlMultiSelectionPromptContent(
					{
						fileId: request.fileId,
						fileName: request.fileName || "index.html",
						filePath: request.filePath || request.fileId,
					},
					request.targets,
					"HTML 页面修改目标",
					screenshotMentions,
				)
				await onSendMessageByContent({
					jsonContent: content,
					shouldClearEditorAfterSend: true,
				})
				screenshotTargets.forEach((target, index) => {
					preparedScreenshotMentionsRef.current.delete(target.id ?? `screenshot:${index}`)
				})
				request.onSuccess?.()
			} catch (error) {
				request.onError?.(error)
			}
		}
		pubsub.subscribe(PubSubEvents.Submit_Html_Multi_Selection, handleSubmitHtmlMultiSelection)
		return () => {
			pubsub.unsubscribe(
				PubSubEvents.Submit_Html_Multi_Selection,
				handleSubmitHtmlMultiSelection,
			)
		}
	}, [onSendMessageByContent, uploadScreenshot])

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

	const applyAddContentPayload = useMemoizedFn((data: AddContentPayload) => {
		const { content, extraData } = data
		if (content) {
			updateContent(content)
		}
		if (extraData?.hasInput) {
			runActiveEditor(activeEditorRef.current, (activeEditor) => {
				activeEditor.commands.focusFirstSuperPlaceholder?.()
			})
		} else if (extraData?.focusAtEnd) {
			runActiveEditor(activeEditorRef.current, (activeEditor) => {
				activeEditor.commands.focus("end")
			})
		} else {
			safeEditorFocus(activeEditorRef.current)
		}
	})

	const handleAddContent = useMemoizedFn((data: AddContentPayload) => {
		// Wait for draft restore on new topics so loadLatestDraft clear does not wipe prefilled content.
		void draftStore.waitForLoadDraft().then(() => {
			applyAddContentPayload(data)
		})
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
