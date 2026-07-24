import { lazy, Suspense, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { DetailType } from "@/pages/superMagic/components/Detail/types"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { MicroAppEmptyIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import MicroAppBuildingPreview from "./MicroAppBuildingPreview"
import MicroAppPhonePreviewFrame from "./MicroAppPhonePreviewFrame"
import { isHtmlFile } from "../utils/microAppFiles"

const HTMLPreview = lazy(() => import("@/pages/superMagic/components/Detail/contents/HTML"))

export type MicroAppEntryPreviewMode = "desktop" | "phone"

export interface MicroAppEntryPreviewProps {
	entryFile: AttachmentItem | null
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	selectedProject: ProjectListItem | null
	allowEdit: boolean
	onOpenFile?: (fileItem?: unknown) => void
	viewMode?: MicroAppEntryPreviewMode
	refreshKey?: number
	onRegisterAIEdit?: (handler: (() => void) | null) => void
	onAIEditActiveChange?: (active: boolean) => void
	emptyTestId?: string
	buildingTestId?: string
	isBuilding?: boolean
}

function getEntryFileData(entryFile: AttachmentItem | null) {
	if (!entryFile?.file_id) return null

	const fileName =
		entryFile.display_filename || entryFile.file_name || entryFile.filename || "index.html"

	return {
		...entryFile,
		file_id: entryFile.file_id,
		file_name: fileName,
		file_extension: entryFile.file_extension || fileName.split(".").pop() || "html",
	}
}

export default function MicroAppEntryPreview({
	entryFile,
	attachments,
	attachmentList,
	selectedProject,
	allowEdit,
	onOpenFile,
	viewMode = "desktop",
	refreshKey = 0,
	onRegisterAIEdit,
	onAIEditActiveChange,
	emptyTestId = "micro-app-preview-empty",
	buildingTestId = "micro-app-preview-building",
	isBuilding = false,
}: MicroAppEntryPreviewProps) {
	const { t } = useTranslation("super")
	const entryData = useMemo(() => getEntryFileData(entryFile), [entryFile])
	const hasAnyHtml = useMemo(() => attachmentList.some(isHtmlFile), [attachmentList])

	if (!entryData) {
		if (isBuilding && !hasAnyHtml) {
			return <MicroAppBuildingPreview testId={buildingTestId} />
		}

		return (
			<div
				className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center"
				data-testid={emptyTestId}
			>
				<MicroAppEmptyIllustration size="md" />
				<p className="text-sm font-medium text-foreground">
					{t("microAppPage.preview.emptyTitle")}
				</p>
				<p className="text-xs leading-5 text-muted-foreground">
					{t("microAppPage.preview.emptyDescription")}
				</p>
			</div>
		)
	}

	const preview = (
		<HTMLPreview
			key={`${entryData.file_id}-${refreshKey}`}
			type={DetailType.Html}
			data={entryData}
			attachments={attachments}
			attachmentList={attachmentList}
			selectedProject={selectedProject}
			activeFileId={entryData.file_id}
			updatedAt={entryData.updated_at}
			allowEdit={allowEdit}
			viewMode={viewMode}
			openFileTab={onOpenFile}
			showFileHeader={false}
			showFooter={false}
			showPhoneFrame={false}
			onRegisterAIEdit={onRegisterAIEdit}
			onAIEditActiveChange={onAIEditActiveChange}
			className="h-full min-h-0 w-full"
		/>
	)

	return (
		<Suspense
			fallback={
				<div className="flex h-full items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			}
		>
			{viewMode === "phone" ? (
				<MicroAppPhonePreviewFrame>{preview}</MicroAppPhonePreviewFrame>
			) : (
				preview
			)}
		</Suspense>
	)
}
