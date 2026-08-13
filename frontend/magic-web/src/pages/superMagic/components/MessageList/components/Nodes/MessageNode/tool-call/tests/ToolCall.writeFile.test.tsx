import { act, render, screen } from "@testing-library/react"
import { observable, runInAction } from "mobx"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ToolCallContainer as ToolCall } from "../ToolCallContainer"

const storeHarness = vi.hoisted(() => ({
	toolResponseMap: new Map<string, Map<string, Record<string, unknown>>>(),
	getStreamState: vi.fn(),
}))

vi.mock("@/pages/superMagic/stores", async () => {
	const { observable } = await import("mobx")
	const toolResponseMap = observable.map<string, Map<string, Record<string, unknown>>>()
	storeHarness.toolResponseMap = toolResponseMap

	return {
		superMagicStore: {
			toolResponseMap,
			getMessageNode: vi.fn(() => undefined),
			getStreamState: storeHarness.getStreamState,
		},
	}
})

vi.mock("../tools/Default", () => ({
	default: ({ toolData }: { toolData?: { remark?: string } }) => (
		<div data-testid="default-tool-remark">{toolData?.remark || ""}</div>
	),
}))

vi.mock("../tools/KnowledgeSearch", () => ({
	default: () => null,
}))

vi.mock("../tools/WriteFile", () => ({
	default: ({ toolData }: { toolData?: { remark?: string } }) => (
		<div data-testid="write-file-remark">{toolData?.remark || ""}</div>
	),
}))

vi.mock("../tools/MCP", () => ({
	MCPTool: () => null,
}))

function renderWriteFile(rawArguments: string) {
	return (
		<ToolCall
			topicId="topic-1"
			correlationId="corr-1"
			toolCall={{
				id: "write-file-1",
				type: "function",
				function: {
					name: "write_file",
					label: "写入文件",
					arguments: rawArguments,
				},
				tool: {
					id: "write-file-1",
					name: "write_file",
					action: "写入文件",
					status: "running",
					remark: "",
				},
			}}
		/>
	)
}

function renderReadFiles(rawArguments: string, ownerSuperMessageId?: string) {
	return (
		<ToolCall
			topicId="topic-1"
			correlationId="corr-1"
			ownerSuperMessageId={ownerSuperMessageId}
			toolCall={{
				id: "read-files-1",
				type: "function",
				function: {
					name: "read_files",
					label: "读取文件",
					arguments: rawArguments,
				},
				tool: {
					id: "read-files-1",
					name: "read_files",
					action: "读取文件",
					status: "running",
					remark: "",
				},
			}}
		/>
	)
}

function renderShellExec(rawArguments: string) {
	return (
		<ToolCall
			topicId="topic-1"
			correlationId="corr-1"
			toolCall={{
				id: "shell-exec-1",
				type: "function",
				function: {
					name: "shell_exec",
					label: "执行命令",
					arguments: rawArguments,
				},
				tool: {
					id: "shell-exec-1",
					name: "shell_exec",
					action: "执行命令",
					status: "running",
					remark: "",
				},
			}}
		/>
	)
}

describe("ToolCall write_file remark preview", () => {
	beforeEach(() => {
		storeHarness.toolResponseMap.clear()
		storeHarness.getStreamState.mockReset()
		vi.clearAllMocks()
	})

	it("previews the file name from incomplete streaming arguments", () => {
		render(
			renderWriteFile(
				'{"file_path": "/app/中国近代史调研/民国社会文化深度调研.html", "content": "<main',
			),
		)

		expect(screen.getByTestId("write-file-remark")).toHaveTextContent(
			"民国社会文化深度调研.html",
		)
	})

	it("waits for the streamed file_path string to close before previewing it", () => {
		const { rerender } = render(renderWriteFile('{"file_path": "/app/项目/流式报告'))

		expect(screen.getByTestId("write-file-remark")).toBeEmptyDOMElement()

		rerender(renderWriteFile('{"file_path": "/app/项目/流式报告.md", "content": "#'))

		expect(screen.getByTestId("write-file-remark")).toHaveTextContent("流式报告.md")
	})

	it("reconciles the preview when final arguments replace the streamed file path", () => {
		const { rerender } = render(
			renderWriteFile('{"file_path": "/app/项目/流式名称.html", "content": "draft"}'),
		)

		expect(screen.getByTestId("write-file-remark")).toHaveTextContent("流式名称.html")

		rerender(renderWriteFile('{"file_path": "/app/项目/最终名称.html", "content": "final"}'))

		expect(screen.getByTestId("write-file-remark")).toHaveTextContent("最终名称.html")
	})

	it("keeps a real response remark ahead of the arguments preview", () => {
		storeHarness.toolResponseMap.set(
			"topic-1",
			observable.map([
				[
					"write-file-1",
					{
						id: "write-file-1",
						name: "write_file",
						status: "finished",
						remark: "服务端确认名称.html",
					},
				],
			]),
		)

		render(renderWriteFile('{"file_path": "/app/流式预测名称.html", "content": ""}'))

		expect(screen.getByTestId("write-file-remark")).toHaveTextContent("服务端确认名称.html")
	})

	it("does not derive a remark from arguments for other tools", () => {
		render(
			<ToolCall
				topicId="topic-1"
				correlationId="corr-1"
				toolCall={{
					id: "read-file-1",
					type: "function",
					function: {
						name: "read_file",
						label: "读取文件",
						arguments: '{"file_path": "/app/不应显示.html"}',
					},
					tool: {
						id: "read-file-1",
						name: "read_file",
						action: "读取文件",
						status: "running",
						remark: "",
					},
				}}
			/>,
		)

		expect(screen.getByTestId("default-tool-remark")).toBeEmptyDOMElement()
	})
})

describe("ToolCall read_files remark preview", () => {
	beforeEach(() => {
		storeHarness.toolResponseMap.clear()
		vi.clearAllMocks()
	})

	it("adds completed operation file names while arguments are streaming", () => {
		const { rerender } = render(
			renderReadFiles(
				'{"operations": [{"file_path": "中国近代史科普/index.html", "limit": 50}, {"file_path": "中国近代史科普/deta',
			),
		)

		expect(screen.getByTestId("default-tool-remark")).toHaveTextContent("index.html")

		rerender(
			renderReadFiles(
				'{"operations": [{"file_path": "中国近代史科普/index.html", "limit": 50}, {"file_path": "中国近代史科普/detail.html"}]}',
			),
		)

		expect(screen.getByTestId("default-tool-remark")).toHaveTextContent(
			"index.html、detail.html",
		)
	})

	it("uses canonical stream arguments when the visual tool projection is still behind", () => {
		const streamState = observable({
			tool_calls: [
				{
					id: "read-files-1",
					function: {
						name: "read_files",
						arguments: '{"operations": [{"file_path": "中国未来',
					},
				},
			],
		})
		storeHarness.getStreamState.mockReturnValue(streamState)

		render(renderReadFiles('{"operations": [{"', "assistant-super-message-1"))
		expect(screen.getByTestId("default-tool-remark")).toBeEmptyDOMElement()

		act(() => {
			runInAction(() => {
				streamState.tool_calls[0].function.arguments =
					'{"operations": [{"file_path": "中国未来发展规划.md", "limit": -1}]}'
			})
		})

		expect(screen.getByTestId("default-tool-remark")).toHaveTextContent("中国未来发展规划.md")
	})
})

describe("ToolCall run_python_snippet remark preview", () => {
	beforeEach(() => {
		storeHarness.toolResponseMap.clear()
		vi.clearAllMocks()
	})

	it("previews purpose from streaming arguments", () => {
		render(
			<ToolCall
				topicId="topic-1"
				correlationId="corr-1"
				toolCall={{
					id: "python-snippet-1",
					type: "function",
					function: {
						name: "run_python_snippet",
						label: "执行Python代码片段",
						arguments:
							'{"purpose": "替换HTML锚点填充内容", "python_code": "\\nimport re"}',
					},
					tool: {
						id: "python-snippet-1",
						name: "run_python_snippet",
						action: "执行Python代码片段",
						status: "running",
						remark: "",
					},
				}}
			/>,
		)

		expect(screen.getByTestId("default-tool-remark")).toHaveTextContent("替换HTML锚点填充内容")
	})
})

describe("ToolCall shell_exec remark preview", () => {
	beforeEach(() => {
		storeHarness.toolResponseMap.clear()
		vi.clearAllMocks()
	})

	it("previews command after the streamed JSON string closes", () => {
		const { rerender } = render(renderShellExec('{"command": "wc -c \\"/app/report'))

		expect(screen.getByTestId("default-tool-remark")).toBeEmptyDOMElement()

		rerender(
			renderShellExec(
				'{"command": "wc -c \\"/app/report.html\\" && grep -c \\"ANCHOR\\" \\"/app/report.html\\""}',
			),
		)

		expect(screen.getByTestId("default-tool-remark")).toHaveTextContent(
			'wc -c "/app/report.html" && grep -c "ANCHOR" "/app/report.html"',
		)
	})
})
