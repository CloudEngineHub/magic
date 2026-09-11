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

export function publishPptxExportIssues(
	issues: ExportIssue[],
	context: { fileId?: string; fileName?: string } = {},
) {
	if (issues.length === 0) return
	pubsub.publish(PubSubEvents.Pptx_Export_Issues, {
		issues,
		fileId: context.fileId,
		fileName: context.fileName,
	})
}
