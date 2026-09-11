import type { TFunction } from "i18next"
import type { ExportIssue } from "@magic/html2pptx"
import { Button } from "@/components/shadcn-ui/button"
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

export function showPptxExportIssues(t: TFunction, issues: ExportIssue[]) {
	if (issues.length === 0) return null
	const prompt = createPptxRepairPrompt(issues)
	return {
		content: (
			<div className="flex max-w-[420px] flex-col gap-2">
				<div>{t("topicFiles.exportIssueTitle")}</div>
				<div className="max-h-32 overflow-auto text-xs">
					{issues.map((issue, index) => {
						const page = issue.pageIndex === undefined
							? t("topicFiles.exportIssuePageUnknown")
							: t("topicFiles.exportIssuePage", { page: issue.pageIndex + 1 })
						return <div key={`${issue.code}-${issue.pageIndex}-${index}`}>{page}：{issue.message}</div>
					})}
				</div>
				<Button
					type="button"
					size="sm"
					onClick={() => pubsub.publish(PubSubEvents.Set_Input_Message, prompt)}
				>
					{t("topicFiles.exportIssueRepair")}
				</Button>
			</div>
		),
		duration: 0,
	}
}
