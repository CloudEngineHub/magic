import { ToolCallContainer } from "@/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/ToolCallContainer"
import type { ToolCallItem } from "@/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/types"

const FILE_TOOL_CALL = {
	id: "tool-file-1",
	type: "function",
	function: {
		name: "write_file",
		label: "write file",
		arguments: "{}",
	},
	tool: {
		status: "finished",
		action: "write file",
		remark: "admin.html",
		detail: {
			type: "code",
			data: { source_file_id: "admin-1" },
		},
		attachments: [],
	},
} satisfies ToolCallItem

export default function MicroAppConversationPanelMock({
	onSelectDetail,
}: {
	onSelectDetail?: (detail: unknown) => void
}) {
	return (
		<>
			<button
				type="button"
				data-testid="desktop-conversation-panel"
				onClick={() =>
					onSelectDetail?.({
						type: "shell",
						currentFileId: "tool-1",
						data: { command: "pwd", source_file_id: "admin-1" },
					})
				}
			>
				conversation
			</button>
			<ToolCallContainer
				topicId="topic-1"
				correlationId="message-1"
				toolCall={FILE_TOOL_CALL}
				onSelectDetail={onSelectDetail}
			/>
		</>
	)
}
