import { observer } from "mobx-react-lite"
import EditorLayout, {
	type EditorLayoutProps,
} from "../../../components/MainInputContainer/scenes/EditorLayout"
import { useChatHomeContext } from "../useChatHomeContext"

/** Only the editor owns a fresh chat session; the surrounding home stays mounted. */
export default observer(function ChatHomeEditor(props: EditorLayoutProps) {
	const editorContext = useChatHomeContext()
	return (
		<EditorLayout
			{...props}
			editorContext={editorContext}
			inputContainerId={editorContext.sceneInputContainerId}
		/>
	)
})
