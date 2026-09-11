import type { ExportIssue } from "@magic/html2pptx"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

export function createPptxRepairPrompt(issues: ExportIssue[]): string {
	const details = issues
		.map((issue) => {
			const page = issue.pageIndex === undefined ? "未知页" : `第 ${issue.pageIndex + 1} 页`
			return `${page}：${issue.message}`
		})
		.join("\n")
	return `请修复以下页面的 PPT 导出问题，检查 HTML 容器、元素 ID、脚本初始化时机和资源引用，并保留其他正常内容：\n${details}`
}

/** Convert an export rejection into the same safe issue shape used by page diagnostics. */
export function createPptxExportFailureIssue(error: unknown): ExportIssue {
	const diagnostic =
		error && typeof error === "object" && "diagnostic" in error
			? (error as { diagnostic?: Record<string, unknown> }).diagnostic
			: undefined
	const pageIndex = typeof diagnostic?.pageIndex === "number" ? diagnostic.pageIndex : undefined
	const details = diagnostic
		? {
				phase: diagnostic.phase,
				failureCode: diagnostic.code,
			}
		: undefined
	return {
		pageIndex,
		code: "render-error",
		message: error instanceof Error ? error.message : String(error),
		severity: "error",
		details,
	}
}

export function publishPptxExportFailure(
	issues: ExportIssue[],
	error: unknown,
	context: { fileId?: string; fileName?: string } = {},
) {
	const failure = createPptxExportFailureIssue(error)
	const hasSameFailure = issues.some(
		(issue) =>
			issue.code === failure.code &&
			issue.pageIndex === failure.pageIndex &&
			issue.message === failure.message,
	)
	publishPptxExportIssues(hasSameFailure ? issues : [...issues, failure], context)
}

export function publishPptxExportIssues(
	issues: ExportIssue[],
	context: { fileId?: string; fileName?: string } = {},
) {
	if (issues.length === 0) return
	const uniqueIssues = issues.filter(
		(issue, index, all) =>
			all.findIndex(
				(candidate) =>
					candidate.code === issue.code &&
					candidate.pageIndex === issue.pageIndex &&
					candidate.message === issue.message,
			) === index,
	)
	pubsub.publish(PubSubEvents.Pptx_Export_Issues, {
		issues: uniqueIssues,
		fileId: context.fileId,
		fileName: context.fileName,
	})
}
