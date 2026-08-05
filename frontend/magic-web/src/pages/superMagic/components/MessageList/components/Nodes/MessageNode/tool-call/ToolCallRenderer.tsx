import { lazy, Suspense } from "react"
import DefaultTool from "./tools/Default"
import KnowledgeSearchTool from "./tools/KnowledgeSearch"
import WriteFileTool from "./tools/WriteFile"
import { MCPTool } from "./tools/MCP"
import type { ToolCallRendererProps } from "./types"

const AskUserToolCall = lazy(() => import("./tools/AskUser"))
const MicroAppPlanToolCall = lazy(() => import("../tools/microAppPlan"))

export function ToolCallRenderer({
	toolCall,
	toolData,
	loading,
	classNames,
	selectedTopic,
	isShare,
	onClick,
	onSelectDetail,
	onMouseEnter,
	onMouseLeave,
}: ToolCallRendererProps) {
	// MCP uses tool.name for the wrapper protocol while function.name identifies the MCP method.
	if (toolCall.tool?.name === "mcp_tool_call") {
		return (
			<MCPTool
				onClick={onClick}
				toolData={toolData}
				loading={loading}
				classNames={classNames ? { markdown: classNames } : undefined}
				onSelectDetail={onSelectDetail}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			/>
		)
	}

	if (toolCall.function.name === "ask_user") {
		return (
			<Suspense fallback={null}>
				<AskUserToolCall
					toolData={toolData}
					loading={loading}
					classNames={classNames}
					selectedTopic={selectedTopic}
					isShare={isShare}
					onSelectDetail={onSelectDetail}
					onMouseEnter={onMouseEnter}
					onMouseLeave={onMouseLeave}
				/>
			</Suspense>
		)
	}

	if (toolCall.function.name === "micro_app_plan") {
		return (
			<Suspense fallback={null}>
				<MicroAppPlanToolCall
					toolData={toolData}
					loading={loading}
					classNames={classNames}
					selectedTopic={selectedTopic}
					isShare={isShare}
					onSelectDetail={onSelectDetail}
					onMouseEnter={onMouseEnter}
					onMouseLeave={onMouseLeave}
				/>
			</Suspense>
		)
	}

	if (toolCall.function.name === "write_file") {
		return (
			<WriteFileTool
				onClick={onClick}
				toolData={toolData}
				loading={loading}
				classNames={classNames}
				onSelectDetail={onSelectDetail}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			/>
		)
	}

	if (
		toolCall.function.name === "search_knowledge" ||
		toolData.detail?.type === "knowledge_search" ||
		toolData.detail?.data?.type === "knowledge_search"
	) {
		return (
			<KnowledgeSearchTool
				onClick={onClick}
				toolData={toolData}
				loading={loading}
				classNames={classNames}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
			/>
		)
	}

	return (
		<DefaultTool
			onClick={onClick}
			toolData={toolData}
			loading={loading}
			classNames={classNames}
			onSelectDetail={onSelectDetail}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		/>
	)
}
