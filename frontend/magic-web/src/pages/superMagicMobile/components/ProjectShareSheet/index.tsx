import CommonPopup from "@/pages/superMagicMobile/components/CommonPopup"
import { cn } from "@/lib/utils"
import DefaultOpenFilePicker from "./components/DefaultOpenFilePicker"
import ProjectShareCreateView from "./components/ProjectShareCreateView"
import ProjectShareDeleteConfirmView from "./components/ProjectShareDeleteConfirmView"
import ProjectShareExpiryView from "./components/ProjectShareExpiryView"
import ProjectShareLinkDetailView from "./components/ProjectShareLinkDetailView"
import ProjectShareManageView from "./components/ProjectShareManageView"
import ProjectShareFilePicker from "./components/ProjectShareFilePicker"
import { ProjectShareSheetFooter } from "./components/ProjectShareSheetFooter"
import ProjectShareSheetHeader from "./components/ProjectShareSheetHeader"
import { useProjectShareSheet } from "./hooks/useProjectShareSheet"
import type { ProjectShareSheetProps, ProjectShareSheetView } from "./types"

/** Views without a fixed footer must pad the scroll area for the home-indicator safe region. */
const VIEWS_WITHOUT_FOOTER: ProjectShareSheetView[] = ["manage", "expiry", "deleteConfirm"]

/** Async list and edit views keep a moderate minimum height while detail views size to content. */
const VIEWS_WITH_STABLE_MIN_HEIGHT: ProjectShareSheetView[] = ["manage", "edit"]

/** Caps the minimum on tall screens while scaling it down for shorter mobile viewports. */
const PROJECT_SHARE_SHEET_MIN_HEIGHT = "min(72dvh, 640px)"

/**
 * 移动端项目分享 Sheet：用单一底部弹层承接原型多视图流程，真实保存/编辑仍复用现有分享弹层能力。
 */
export default function ProjectShareSheet(props: ProjectShareSheetProps) {
	const controller = useProjectShareSheet(props)
	const scrollClassName = cn(
		"scrollbar-y-thin relative min-h-0 flex-1 overflow-y-auto px-3.5 pt-2.5",
		VIEWS_WITHOUT_FOOTER.includes(controller.view) &&
			"pb-[max(var(--safe-area-inset-bottom),16px)]",
	)
	const stableMinHeight = VIEWS_WITH_STABLE_MIN_HEIGHT.includes(controller.view)
		? PROJECT_SHARE_SHEET_MIN_HEIGHT
		: undefined

	return (
		<>
			<CommonPopup
				title=""
				hideHeader
				showHeader={false}
				popupProps={{
					visible: props.open,
					onClose: controller.close,
					onMaskClick: controller.close,
					showCloseButton: false,
					withSafeBottom: false,
					bodyClassName: "flex min-h-0 flex-1 flex-col overflow-hidden p-0",
					// 默认手柄位于 MagicPopup 外层内容壳内；这里同步外层底色，避免头部上方露出白底造成分层。
					className: "rounded-t-[14px] border-0 bg-[#F7F7F6]",
					bodyStyle: {
						background: "#F7F7F6",
						borderRadius: "14px 14px 0 0",
						height: "auto",
						maxHeight: "92dvh",
						minHeight: stableMinHeight,
					},
				}}
				wrapperStyle={{
					height: "auto",
					maxHeight: "92dvh",
					minHeight: stableMinHeight,
				}}
			>
				<div
					className="flex max-h-[92dvh] min-h-0 flex-col overflow-hidden bg-[#F7F7F6]"
					style={{ minHeight: stableMinHeight }}
					data-testid="project-share-sheet-root"
				>
					<ProjectShareSheetHeader
						controller={controller}
						projectName={props.projectName}
					/>
					<div className="flex min-h-0 flex-1 flex-col">
						<div className={scrollClassName} data-testid="project-share-sheet-scroll">
							{controller.view === "create" || controller.view === "edit" ? (
								<ProjectShareCreateView controller={controller} />
							) : null}
							{controller.view === "manage" ? (
								<ProjectShareManageView controller={controller} />
							) : null}
							{controller.view === "linkDetail" ? (
								<ProjectShareLinkDetailView controller={controller} />
							) : null}
							{controller.view === "expiry" ? (
								<ProjectShareExpiryView controller={controller} />
							) : null}
							{controller.view === "deleteConfirm" ? (
								<ProjectShareDeleteConfirmView controller={controller} />
							) : null}
						</div>
						<ProjectShareSheetFooter controller={controller} />
					</div>
				</div>
			</CommonPopup>

			<DefaultOpenFilePicker
				open={controller.defaultOpenFilePickerOpen}
				candidateTree={controller.defaultOpenFileCandidateTree}
				selectedFileId={controller.defaultOpenFileId}
				onClose={controller.closeDefaultOpenFilePicker}
				onSelectFile={controller.selectDefaultOpenFile}
			/>

			{controller.fileSelectorOpen ? (
				<ProjectShareFilePicker
					open={Boolean(controller.fileSelectorOpen)}
					attachments={props.attachments}
					selectedFileIds={controller.selectedFileIds}
					defaultOpenFileId={controller.defaultOpenFileId}
					onClose={controller.closeFileSelector || (() => undefined)}
					onConfirm={controller.confirmFileSelector || (() => undefined)}
				/>
			) : null}
		</>
	)
}
