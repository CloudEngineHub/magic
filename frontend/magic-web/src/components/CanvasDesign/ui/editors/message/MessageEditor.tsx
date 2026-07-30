import {
	forwardRef,
	useImperativeHandle,
	useRef,
	useEffect,
	useCallback,
	useMemo,
	type ClipboardEvent,
} from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import type { Extension, Node as TiptapNode } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import HardBreak from "@tiptap/extension-hard-break"
import Placeholder from "@tiptap/extension-placeholder"
import { UndoRedo } from "@tiptap/extensions"
import { Fragment } from "@tiptap/pm/model"
import type { MentionDataServicePort, ReferenceResourcePanelItem } from "../../../public/props"
import { useOverflowChange } from "../../../app/hooks/layout/useOverflowChange"
import {
	getStringFromContent,
	getContentFromString,
	getMentionPathsFromContent,
	getMatchablePathsFromValue,
	MENTION_CARET_GUARD_TEXT,
	type MatchableMentionItem,
} from "./tiptap/contentUtils"
import styles from "./index.module.css"
import tiptapStyles from "./tiptap-editor.module.css"
import { runActiveEditor } from "@/utils/tiptapEditorLifecycle"

interface MentionEditorCommands {
	updateMentionEnabled?: (enabled: boolean) => boolean
	openMentionPanel?: () => boolean
}

interface MessageEditorProps {
	value?: string
	onChange?: (value: string) => void
	placeholder?: string
	onEnter?: () => void
	autoFocus?: boolean
	/** 与 autoFocus 联用：为 true 时忽略持久化选区并将光标移到文档末尾（如失败重试后进入编辑） */
	autoFocusAtDocumentEnd?: boolean
	/** 跨卸载/重挂载恢复光标位置的持久化 key */
	selectionPersistenceKey?: string
	onScrollbarChange?: (hasScrollbar: boolean) => void
	/** 可匹配的 @ 项，用于 string 转 JSON */
	matchableItems?: MatchableMentionItem[]
	/** @ 面板数据服务（兼容 MentionPanel DataService） */
	mentionDataService?: MentionDataServicePort
	/** Mention 扩展实例（通过依赖注入传入，实现组件隔离；TipTap Mention 为 Node） */
	mentionExtension?: Extension | TiptapNode<unknown, unknown> | null
	language?: string
	/** @ 提及路径列表变化时的回调（去重后的路径列表，currentPrompt 为编辑器当前内容） */
	onMentionChange?: (
		paths: string[],
		currentPrompt: string,
		context: MessageEditorMentionChangeContext,
	) => void
	/** hover 在某个 @ 提及项上时回调对应 path，离开时回调 null */
	onMentionItemHoverChange?: (path: string | null) => void
	/** 是否启用 @ 功能（模型列表加载完成后才为 true） */
	mentionEnabled?: boolean
	/** 外部资源列表尚未恢复完成时，暂不发出 ready mention 快照。 */
	mentionItemsReady?: boolean
	/** 为 true 时外层与编辑区宽度 100% 铺满父级（用于视频生成等较宽面板） */
	fullWidth?: boolean
	onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void
}

export interface MessageEditorMentionChangeContext {
	source: "user" | "sync"
	status: "pending" | "ready"
	revision: number
}

export type MessageEditorMentionMatcher = (item: ReferenceResourcePanelItem) => boolean

/** insertMentionItems 的可选行为（如上传/模式切换需在文末追加 @，与 appendMentionToString 一致） */
export interface InsertCanvasMentionItemsOptions {
	placement?: "cursor" | "documentEnd"
	/** 默认替换当前选区；为 false 时折叠到选区末尾插入，避免覆盖已选文本。 */
	replaceSelection?: boolean
}

interface MessageEditorSelectionRange {
	from: number
	to: number
}

interface MessageEditorMentionSnapshot {
	paths: string[]
	currentPrompt: string
}

const MAX_PERSISTED_SELECTION_RANGE_COUNT = 200
const persistedSelectionRangeMap = new Map<string, MessageEditorSelectionRange>()

export interface MessageEditorRef {
	focus: () => void
	/** 获取编辑器当前的内容（字符串形式） */
	getCurrentPrompt: () => string
	openMentionPanel: () => void
	insertMentionItem: (
		item: ReferenceResourcePanelItem,
		options?: InsertCanvasMentionItemsOptions,
	) => boolean
	insertMentionItems: (
		items: ReferenceResourcePanelItem[],
		options?: InsertCanvasMentionItemsOptions,
	) => boolean
	removeMentionItems: (matcher: MessageEditorMentionMatcher) => boolean
	replaceMentionItems: (
		matcher: MessageEditorMentionMatcher,
		item: ReferenceResourcePanelItem,
	) => boolean
}

const MessageEditor = forwardRef<MessageEditorRef, MessageEditorProps>(
	function MessageEditor(props, ref) {
		const {
			value,
			onChange,
			placeholder,
			onEnter,
			autoFocus = false,
			autoFocusAtDocumentEnd = false,
			selectionPersistenceKey,
			onScrollbarChange,
			matchableItems = [],
			mentionExtension: injectedMentionExtension,
			onMentionChange,
			onMentionItemHoverChange,
			mentionEnabled = true,
			mentionItemsReady = true,
			fullWidth = false,
			onPaste,
		} = props
		const editorContainerRef = useRef<HTMLDivElement>(null)
		const isInternalChangeRef = useRef(false)
		const latestFocusedSelectionRangeRef = useRef<MessageEditorSelectionRange | null>(null)
		const onEnterRef = useRef(onEnter)
		onEnterRef.current = onEnter
		// useEditor 仅依赖 mentionExtension；其余走 ref，避免整编辑器重建失焦
		const onChangeRef = useRef(onChange)
		onChangeRef.current = onChange
		const onMentionChangeRef = useRef(onMentionChange)
		onMentionChangeRef.current = onMentionChange
		const onMentionItemHoverChangeRef = useRef(onMentionItemHoverChange)
		onMentionItemHoverChangeRef.current = onMentionItemHoverChange
		const placeholderRef = useRef(placeholder ?? "")
		placeholderRef.current = placeholder ?? ""
		const hoveredMentionPathRef = useRef<string | null>(null)
		const lastMentionSnapshotRef = useRef<MessageEditorMentionSnapshot | null>(null)
		const mentionSyncRevisionRef = useRef(0)

		useEffect(() => {
			if (!selectionPersistenceKey) return
			latestFocusedSelectionRangeRef.current =
				getPersistedSelectionRange(selectionPersistenceKey)
		}, [selectionPersistenceKey])

		const getPreferredSelectionRange = useCallback(
			() =>
				resolvePreferredSelectionRange(
					latestFocusedSelectionRangeRef.current,
					selectionPersistenceKey,
				),
			[selectionPersistenceKey],
		)
		const syncSelectionRange = useCallback(
			(selectionRange: MessageEditorSelectionRange) => {
				latestFocusedSelectionRangeRef.current = selectionRange
				setPersistedSelectionRange(selectionPersistenceKey, selectionRange)
			},
			[selectionPersistenceKey],
		)

		const resolveOverflowTargets = useCallback(
			(wrapper: HTMLDivElement) => [wrapper.firstElementChild],
			[],
		)
		const { checkOverflow: checkScrollbar } = useOverflowChange({
			targetRef: editorContainerRef,
			axis: "y",
			onOverflowChange: onScrollbarChange,
			observeTargets: resolveOverflowTargets,
		})

		const scrollToBottom = useCallback(() => {
			if (!editorContainerRef.current) return
			const wrapper = editorContainerRef.current
			if (wrapper.scrollHeight > wrapper.clientHeight) {
				wrapper.scrollTop = wrapper.scrollHeight
			}
		}, [])

		// 使用外部注入的 mentionExtension，如果没有注入则返回 null（不启用 @ 功能）
		const mentionExtension = injectedMentionExtension

		// extensions 不随 placeholder 变，防止 useEditor 销毁实例
		const extensions = useMemo(() => {
			const base = [
				Document,
				Paragraph,
				Text,
				HardBreak,
				Placeholder.configure({
					// 占位文案读 ref，勿把 placeholder 放进本 useMemo / useEditor 依赖
					placeholder: () => placeholderRef.current ?? "",
				}),
				UndoRedo.configure({
					depth: 100,
					newGroupDelay: 250,
				}),
			]
			if (mentionExtension) {
				base.push(mentionExtension)
			}
			return base
		}, [mentionExtension])

		const editor = useEditor(
			{
				extensions,
				content: getContentFromString(value ?? "", matchableItems),
				editorProps: {
					handleKeyDown: (_, event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							const handleEnter = onEnterRef.current
							if (!handleEnter) return false
							event.preventDefault()
							handleEnter()
							return true
						}
						if (event.key === "Enter" && event.shiftKey) {
							requestAnimationFrame(() => {
								requestAnimationFrame(() => {
									scrollToBottom()
								})
							})
						}
						return false
					},
				},
				onUpdate: ({ editor: e }) => {
					if (isInternalChangeRef.current) return
					const str = getStringFromContent(e.getJSON())
					onChangeRef.current?.(str)
					const mentionCb = onMentionChangeRef.current
					if (mentionCb) {
						const paths = getMentionPathsFromContent(e.getJSON())
						lastMentionSnapshotRef.current = {
							paths: [...paths],
							currentPrompt: str,
						}
						mentionCb(paths, str, {
							source: "user",
							status: "ready",
							revision: (mentionSyncRevisionRef.current += 1),
						})
					}
				},
				onSelectionUpdate: ({ editor: e }) => {
					if (!e.isFocused) return
					const selectionRange = {
						from: e.state.selection.from,
						to: e.state.selection.to,
					}
					syncSelectionRange(selectionRange)
				},
			},
			// 此处依赖变化会整段销毁 TipTap，仅保留 mentionExtension
			[mentionExtension],
		)

		useImperativeHandle(ref, () => ({
			focus: () => {
				if (!editor || editor.isDestroyed) return
				focusEditorWithPreservedSelection(editor, getPreferredSelectionRange())
			},
			getCurrentPrompt: () => {
				if (!editor) return ""
				return getStringFromContent(editor.getJSON())
			},
			openMentionPanel: () => {
				if (!editor || !mentionExtension || !mentionEnabled) return
				;(editor.commands as MentionEditorCommands).openMentionPanel?.()
			},
			insertMentionItem: (
				item: ReferenceResourcePanelItem,
				options?: InsertCanvasMentionItemsOptions,
			) => {
				if (!editor) return false
				return insertMentionItemsToEditor(
					editor,
					[item],
					options,
					getPreferredSelectionRange,
					syncSelectionRange,
				)
			},
			insertMentionItems: (
				items: ReferenceResourcePanelItem[],
				options?: InsertCanvasMentionItemsOptions,
			) => {
				if (!editor) return false
				return insertMentionItemsToEditor(
					editor,
					items,
					options,
					getPreferredSelectionRange,
					syncSelectionRange,
				)
			},
			removeMentionItems: (matcher: MessageEditorMentionMatcher) => {
				if (!editor) return false
				return removeMentionItemsInEditor(editor, matcher, syncSelectionRange)
			},
			replaceMentionItems: (
				matcher: MessageEditorMentionMatcher,
				item: ReferenceResourcePanelItem,
			) => {
				if (!editor) return false
				return replaceMentionItemsInEditor(editor, matcher, item)
			},
		}))

		// value 变化时 setContent；matchableItems 延迟到达时（挂载后 syncFromElement 完成）需重新解析以恢复 @mention 样式。
		// 推迟到 microtask：TipTap 为 Mention 等 NodeView 创建 ReactRenderer 时会 flushSync，若在 React effect 栈内同步 setContent 会触发警告。
		useEffect(() => {
			if (!editor) return

			const valueSnapshot = value ?? ""
			const itemsSnapshot = matchableItems
			const syncRevision = (mentionSyncRevisionRef.current += 1)
			const mentionCb = onMentionChangeRef.current
			if (mentionCb) {
				runActiveEditor(editor, (activeEditor) => {
					mentionCb(
						getMentionPathsFromContent(activeEditor.getJSON()),
						getStringFromContent(activeEditor.getJSON()),
						{ source: "sync", status: "pending", revision: syncRevision },
					)
				})
			}
			const syncMentionChange = (activeEditor: Editor) => {
				const mentionCb = onMentionChangeRef.current
				if (!mentionCb) return
				if (!mentionItemsReady) return
				const paths = getMentionPathsFromContent(activeEditor.getJSON())
				const currentPrompt = getStringFromContent(activeEditor.getJSON())
				const previousSnapshot = lastMentionSnapshotRef.current
				const isSameSnapshot =
					previousSnapshot?.currentPrompt === currentPrompt &&
					previousSnapshot.paths.length === paths.length &&
					previousSnapshot.paths.every((path, index) => path === paths[index])
				if (isSameSnapshot) return
				lastMentionSnapshotRef.current = {
					paths: [...paths],
					currentPrompt,
				}
				mentionCb(paths, currentPrompt, {
					source: "sync",
					status: "ready",
					revision: syncRevision,
				})
			}
			let cancelled = false

			queueMicrotask(() => {
				runActiveEditor(editor, (activeEditor) => {
					if (cancelled) return

					const currentStr = getStringFromContent(activeEditor.getJSON())
					const pathsInEditor = new Set(
						getMentionPathsFromContent(activeEditor.getJSON()),
					)
					const matchablePathsInValue = getMatchablePathsFromValue(
						valueSnapshot,
						itemsSnapshot,
					)
					const hasMentionsRenderedAsText = matchablePathsInValue.some(
						(p) => !pathsInEditor.has(p),
					)

					if (currentStr !== valueSnapshot) {
						const contentToSet = getContentFromString(valueSnapshot, itemsSnapshot)
						isInternalChangeRef.current = true
						activeEditor.commands.setContent(contentToSet, {
							emitUpdate: false,
						})
						syncMentionChange(activeEditor)
						queueMicrotask(() => {
							isInternalChangeRef.current = false
						})
						return
					}

					if (hasMentionsRenderedAsText) {
						const contentToSet = getContentFromString(valueSnapshot, itemsSnapshot)
						isInternalChangeRef.current = true
						activeEditor.commands.setContent(contentToSet, {
							emitUpdate: false,
						})
						syncMentionChange(activeEditor)
						queueMicrotask(() => {
							isInternalChangeRef.current = false
						})
						return
					}

					syncMentionChange(activeEditor)
				})
			})

			return () => {
				cancelled = true
			}
		}, [value, matchableItems, editor, mentionItemsReady])

		// 空文档时占位文案变更：空事务触发占位装饰重算（不重建 editor）
		useEffect(() => {
			placeholderRef.current = placeholder ?? ""
			if (!editor) return
			const isEmpty = runActiveEditor(editor, (activeEditor) => activeEditor.isEmpty, false)
			if (!isEmpty) return
			queueMicrotask(() => {
				runActiveEditor(editor, (activeEditor) => {
					activeEditor.view.dispatch(activeEditor.state.tr)
				})
			})
		}, [placeholder, editor])

		useEffect(() => {
			checkScrollbar()
		}, [checkScrollbar])

		useEffect(() => {
			if (!autoFocus || !editor) return
			const timer = window.setTimeout(() => {
				runActiveEditor(editor, (activeEditor) => {
					if (autoFocusAtDocumentEnd) activeEditor.commands.focus("end")
					else
						focusEditorWithPreservedSelection(
							activeEditor,
							getPreferredSelectionRange(),
						)
				})
			}, 50)
			return () => window.clearTimeout(timer)
		}, [autoFocus, autoFocusAtDocumentEnd, editor, getPreferredSelectionRange])

		useEffect(() => {
			const timer = setTimeout(checkScrollbar, 0)
			return () => clearTimeout(timer)
		}, [value, checkScrollbar])

		useEffect(() => {
			if (!editor || !mentionExtension) return
			runActiveEditor(editor, (activeEditor) => {
				;(activeEditor.commands as MentionEditorCommands).updateMentionEnabled?.(
					mentionEnabled,
				)
			})
		}, [editor, mentionExtension, mentionEnabled])

		useEffect(() => {
			if (!editor) return

			function getHoveredMentionPath(target: EventTarget | null): string | null {
				if (!(target instanceof Element)) return null
				const mentionEl = target.closest<HTMLElement>(".canvas-project-file-mention")
				return mentionEl?.dataset.filePath || null
			}

			function syncHoveredMentionPath(nextPath: string | null) {
				if (hoveredMentionPathRef.current === nextPath) return
				hoveredMentionPathRef.current = nextPath
				onMentionItemHoverChangeRef.current?.(nextPath)
			}

			function handlePointerOver(event: PointerEvent) {
				syncHoveredMentionPath(getHoveredMentionPath(event.target))
			}

			function handlePointerOut(event: PointerEvent) {
				const currentPath = getHoveredMentionPath(event.target)
				if (!currentPath) return
				const nextPath = getHoveredMentionPath(event.relatedTarget)
				if (nextPath === currentPath) return
				syncHoveredMentionPath(nextPath)
			}

			function handlePointerLeave() {
				syncHoveredMentionPath(null)
			}

			const editorDom = editor.view.dom
			editorDom.addEventListener("pointerover", handlePointerOver)
			editorDom.addEventListener("pointerout", handlePointerOut)
			editorDom.addEventListener("pointerleave", handlePointerLeave)

			return () => {
				editorDom.removeEventListener("pointerover", handlePointerOver)
				editorDom.removeEventListener("pointerout", handlePointerOut)
				editorDom.removeEventListener("pointerleave", handlePointerLeave)
				syncHoveredMentionPath(null)
			}
		}, [editor])

		if (!editor) return null

		const rootClassName = fullWidth
			? `${styles.editorContainer} ${styles.editorContainerFullWidth}`
			: styles.editorContainer

		return (
			<div
				className={rootClassName}
				onPaste={onPaste}
				data-testid="canvas-reference-editor-container"
			>
				<div ref={editorContainerRef} className={styles.editorWrapper}>
					<EditorContent editor={editor} className={tiptapStyles.tiptapEditor} />
				</div>
			</div>
		)
	},
)

function insertMentionItemsToEditor(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	items: ReferenceResourcePanelItem[],
	options?: InsertCanvasMentionItemsOptions,
	getLatestFocusedSelectionRange?: () => MessageEditorSelectionRange | null,
	onSelectionRangeChange?: (selectionRange: MessageEditorSelectionRange) => void,
) {
	if (items.length === 0) return false

	const didInsert =
		runActiveEditor(
			editor,
			(activeEditor) => {
				if (!activeEditor.schema.nodes.mention) return false
				const content = items.flatMap((item) => [
					{
						type: "mention",
						attrs: item,
					},
					{
						type: "text",
						text: MENTION_CARET_GUARD_TEXT,
					},
				])

				const fragment = Fragment.fromArray(
					content.map((node) => activeEditor.schema.nodeFromJSON(node)),
				)
				const fragSize = fragment.size
				const shouldUsePreservedSelection =
					options?.placement !== "documentEnd" && !activeEditor.isFocused

				const chain = activeEditor.chain()
				if (options?.placement === "documentEnd") {
					chain.focus("end", { scrollIntoView: false })
				} else {
					chain.focus(undefined, { scrollIntoView: false })
				}
				return chain
					.command(({ tr, commands }) => {
						const currentSelection = tr.selection
						const preservedSelection = shouldUsePreservedSelection
							? getLatestFocusedSelectionRange?.()
							: null
						const maxPos = Math.max(1, tr.doc.content.size)
						const insertionRange = resolveMentionInsertionRange({
							currentSelection,
							preservedSelection,
							maxPos,
							replaceSelection: options?.replaceSelection !== false,
						})
						const { from: insertFrom, to: insertTo } = insertionRange
						if (
							!commands.insertContentAt({ from: insertFrom, to: insertTo }, content, {
								updateSelection: false,
							})
						) {
							return false
						}
						const nextSelectionPosition = insertFrom + fragSize
						if (!commands.setTextSelection(nextSelectionPosition)) {
							return false
						}
						onSelectionRangeChange?.({
							from: nextSelectionPosition,
							to: nextSelectionPosition,
						})
						return true
					})
					.run()
			},
			false,
		) ?? false

	if (didInsert) restoreEditorFocusAfterMentionMutation(editor)

	return didInsert
}

export function resolveMentionInsertionRange(options: {
	currentSelection: MessageEditorSelectionRange
	preservedSelection?: MessageEditorSelectionRange | null
	maxPos: number
	replaceSelection: boolean
}): MessageEditorSelectionRange {
	const { currentSelection, preservedSelection, maxPos, replaceSelection } = options
	const selection = preservedSelection ?? currentSelection
	// doc.content.size 包含最外层文本块的闭合边界；该边界位于段落外，不能用于内联 mention 插入。
	const maxTextPosition = Math.max(1, maxPos - 1)
	const from = Math.min(Math.max(selection.from, 1), maxTextPosition)
	const to = Math.min(Math.max(selection.to, from), maxTextPosition)
	if (replaceSelection) return { from, to }
	return { from: to, to }
}

function replaceMentionItemsInEditor(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	matcher: MessageEditorMentionMatcher,
	item: ReferenceResourcePanelItem,
): boolean {
	const didReplace = runActiveEditor(
		editor,
		(activeEditor) => {
			const targetPositions: number[] = []
			activeEditor.state.doc.descendants((node, pos) => {
				if (node.type.name !== "mention") return true
				if (!matcher(node.attrs as ReferenceResourcePanelItem)) return true
				targetPositions.push(pos)
				return true
			})

			if (targetPositions.length === 0) return false

			const tr = activeEditor.state.tr
			targetPositions.forEach((targetPos) => {
				tr.setNodeMarkup(targetPos, undefined, item)
			})
			activeEditor.view.dispatch(tr)
			return true
		},
		false,
	)

	if (didReplace) restoreEditorFocusAfterMentionMutation(editor)
	return didReplace
}

function removeMentionItemsInEditor(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	matcher: MessageEditorMentionMatcher,
	onSelectionRangeChange?: (selectionRange: MessageEditorSelectionRange) => void,
): boolean {
	const didRemove = runActiveEditor(
		editor,
		(activeEditor) => {
			const targetRanges: Array<{ from: number; to: number }> = []
			activeEditor.state.doc.descendants((node, pos) => {
				if (node.type.name !== "mention") return true
				if (!matcher(node.attrs as ReferenceResourcePanelItem)) return true

				const mentionEnd = pos + node.nodeSize
				const nextNode = activeEditor.state.doc.resolve(mentionEnd).nodeAfter
				const hasCaretGuard =
					nextNode?.isText === true && nextNode.text?.startsWith(MENTION_CARET_GUARD_TEXT)
				targetRanges.push({
					from: pos,
					to: mentionEnd + (hasCaretGuard ? MENTION_CARET_GUARD_TEXT.length : 0),
				})
				return true
			})

			if (targetRanges.length === 0) return false

			const tr = activeEditor.state.tr
			targetRanges
				.sort((a, b) => b.from - a.from)
				.forEach(({ from, to }) => tr.delete(from, to))
			activeEditor.view.dispatch(tr)
			onSelectionRangeChange?.({
				from: activeEditor.state.selection.from,
				to: activeEditor.state.selection.to,
			})
			return true
		},
		false,
	)

	if (didRemove) restoreEditorFocusAfterMentionMutation(editor)
	return didRemove
}

/** 与“+ 添加媒体”保持一致：外部控件操作结束后，将光标恢复到编辑器当前选区。 */
function restoreEditorFocusAfterMentionMutation(editor: NonNullable<ReturnType<typeof useEditor>>) {
	setTimeout(() => {
		runActiveEditor(editor, (activeEditor) => {
			activeEditor.commands.focus(undefined, { scrollIntoView: false })
		})
	}, 0)
}

export default MessageEditor

function focusEditorWithPreservedSelection(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	selectionRange: MessageEditorSelectionRange | null,
) {
	runActiveEditor(editor, (activeEditor) => {
		if (!selectionRange) {
			activeEditor.commands.focus("end")
			return
		}

		const maxPos = Math.max(1, activeEditor.state.doc.content.size)
		const from = Math.min(Math.max(selectionRange.from, 1), maxPos)
		const to = Math.min(Math.max(selectionRange.to, from), maxPos)

		activeEditor.chain().focus().setTextSelection({ from, to }).run()
	})
}

function resolvePreferredSelectionRange(
	inMemorySelectionRange: MessageEditorSelectionRange | null,
	selectionPersistenceKey?: string,
): MessageEditorSelectionRange | null {
	return inMemorySelectionRange ?? getPersistedSelectionRange(selectionPersistenceKey)
}

function getPersistedSelectionRange(
	selectionPersistenceKey?: string,
): MessageEditorSelectionRange | null {
	if (!selectionPersistenceKey) return null
	const selectionRange = persistedSelectionRangeMap.get(selectionPersistenceKey)
	if (!selectionRange) return null
	return {
		from: selectionRange.from,
		to: selectionRange.to,
	}
}

function setPersistedSelectionRange(
	selectionPersistenceKey: string | undefined,
	selectionRange: MessageEditorSelectionRange,
) {
	if (!selectionPersistenceKey) return
	persistedSelectionRangeMap.delete(selectionPersistenceKey)
	persistedSelectionRangeMap.set(selectionPersistenceKey, {
		from: selectionRange.from,
		to: selectionRange.to,
	})
	while (persistedSelectionRangeMap.size > MAX_PERSISTED_SELECTION_RANGE_COUNT) {
		const oldestKey = persistedSelectionRangeMap.keys().next().value
		if (!oldestKey) break
		persistedSelectionRangeMap.delete(oldestKey)
	}
}
