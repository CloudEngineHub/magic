import { useMemoizedFn } from "ahooks"
import { RefObject } from "react"
import { MessageEditorRef } from "../components/MessageEditor/MessageEditor"
import { TopicMode } from "../pages/Workspace/TopicMode"
import useTopicExamplesPortal from "./useTopicExamplesPortal"
import { runActiveEditor } from "../components/MessageEditor/utils/editorLifecycle"

interface UseTopicExamplesEditorPortalParams {
	editorRef: RefObject<MessageEditorRef | null>
	topicMode: TopicMode
}

/**
 * Renders topic example cards portal and applies selected example content into editor.
 */
function useTopicExamplesEditorPortal({
	editorRef,
	topicMode,
}: UseTopicExamplesEditorPortalParams) {
	const handleSetExampleContent = useMemoizedFn((content: string | object) => {
		runActiveEditor(editorRef.current?.editor, (editor) => {
			editor.commands.setContent(content, { emitUpdate: true })
		})

		setTimeout(() => {
			runActiveEditor(editorRef.current?.editor, (editor) => {
				if (!editor.commands.focusFirstSuperPlaceholder()) {
					editor.commands.focus()
				}
			})
		}, 100)
	})

	return useTopicExamplesPortal({
		topicMode,
		onCardClick: handleSetExampleContent,
	})
}

export default useTopicExamplesEditorPortal
