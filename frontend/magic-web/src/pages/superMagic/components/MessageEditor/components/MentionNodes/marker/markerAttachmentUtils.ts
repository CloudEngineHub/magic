import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"

/**
 * Keep the attachment metadata required by designFileInfoCache when crossing
 * from the MobX workspace store into the design file resolver.
 */
export function mapWorkspaceFilesToFileItems(workspaceFiles: AttachmentItem[]): FileItem[] {
	return workspaceFiles
		.filter((item): item is AttachmentItem & { file_id: string } => Boolean(item.file_id))
		.map((item) => ({
			...item,
			file_id: String(item.file_id),
			file_name: item.file_name ?? item.name ?? item.filename ?? "",
			parent_id: item.parent_id ?? undefined,
		}))
}
