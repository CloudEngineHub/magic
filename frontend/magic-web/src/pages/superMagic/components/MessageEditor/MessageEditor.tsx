import * as React from "react"
import type { MessageEditorProps, MessageEditorRef } from "./types"

// Preserve the public MessageEditor API while keeping its optional runtime out
// of routes that only need the surrounding page shell.
const MessageEditorRuntime = React.lazy(() =>
	import("./MessageEditorContainer").then(({ MessageEditorContainer }) => ({
		default: MessageEditorContainer,
	})),
)

export const MessageEditor = React.forwardRef<MessageEditorRef, MessageEditorProps>(
	function MessageEditor(props, ref) {
		return (
			<React.Suspense fallback={null}>
				<MessageEditorRuntime {...props} ref={ref} />
			</React.Suspense>
		)
	},
)

export default MessageEditor
export type { MessageEditorProps, MessageEditorRef } from "./types"
export type { InvalidModeFallbackProps } from "./components/TopicInvalidModeFallback"
