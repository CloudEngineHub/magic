import type { DataService, McpMentionData, MentionItem } from "../types"
import { MentionItemType } from "../types"
import {
	checkMCPOAuth,
	MCPOAuthType,
} from "@/components/Agent/MCP/AgentSettings/AgentPanel/MCPPanel/helpers"

export async function prepareMentionItemForPending(
	item: MentionItem,
	dataService?: DataService,
): Promise<{ canSelect: boolean; mcpValidated: boolean }> {
	if (item.type !== MentionItemType.MCP) return { canSelect: true, mcpValidated: false }

	const mcpData = item.data as McpMentionData | undefined
	if (!mcpData) return { canSelect: true, mcpValidated: false }

	const result = await checkMCPOAuth(mcpData)
	if (result === MCPOAuthType.validationFailed) {
		return { canSelect: false, mcpValidated: false }
	}

	await Promise.resolve(
		dataService?.dispatch({
			kind: "effect",
			effect: "refresh-mcp",
		}),
	)
	return { canSelect: true, mcpValidated: true }
}
