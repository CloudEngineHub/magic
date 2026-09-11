import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { Button } from "@/components/shadcn-ui/button"
import { SelectDirectoryModal } from "../SelectPathModal"
import { DuplicateFileModal } from "../TopicFilesButton/components/DuplicateFileModal"
import type { useUserSpaceFileActions } from "./hooks/useUserSpaceFileActions"
import type { useUserSpaceUpload } from "./hooks/useUserSpaceUpload"
import { formatDirectoryFileTime } from "../TopicFilesButton/components/FileDirectoryView"
import userFilesStore from "@/stores/userFiles"

export function UserFileActionDialogs({
	actions,
	upload,
}: {
	actions: ReturnType<typeof useUserSpaceFileActions>
	upload: ReturnType<typeof useUserSpaceUpload>
}) {
	const { t, i18n } = useTranslation("super")
	const info = actions.info
	const nameTitle =
		actions.nameAction?.type === "rename"
			? t("userSpace.rename")
			: actions.nameAction?.directory
				? t("userSpace.createFolder")
				: t("userSpace.createFile")
	return (
		<>
			<Dialog
				open={Boolean(actions.nameAction)}
				onOpenChange={(open) => {
					if (!open && !actions.busy) actions.setNameAction(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{nameTitle}</DialogTitle>
						<DialogDescription>{t("userSpace.nameDescription")}</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(event) => {
							event.preventDefault()
							void actions.submitName()
						}}
						className="space-y-4"
					>
						<Input
							autoFocus
							value={actions.name}
							disabled={actions.busy}
							onChange={(event) => actions.setName(event.target.value)}
							aria-label={t("userSpace.name")}
						/>
						{actions.nameError && (
							<p role="alert" className="text-sm text-destructive">
								{actions.nameError}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={actions.busy}
								onClick={() => actions.setNameAction(null)}
							>
								{t("common.cancel")}
							</Button>
							<Button type="submit" disabled={actions.busy}>
								{t("common.confirm")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			{actions.moveRoot && (
				<SelectDirectoryModal
					visible={actions.moveFiles.length > 0}
					title={t("userSpace.move")}
					directorySource={{
						root: {
							...actions.attachment(actions.moveRoot),
							file_name: t("userSpace.title"),
						},
						identityKey: userFilesStore.currentIdentityKey ?? "",
						loadChildren: actions.loadTargetDirectory,
					}}
					isShowCreateDirectory={false}
					disabledFolderIds={actions.moveFiles.flatMap((file) =>
						file.is_directory && file.file_id ? [file.file_id] : [],
					)}
					onClose={actions.closeMove}
					onSubmit={({ path }) => {
						const id = path.at(-1)?.file_id ?? actions.moveRoot?.id
						if (id) void actions.submitMove(id)
					}}
				/>
			)}
			<Dialog
				open={actions.failures.length > 0}
				onOpenChange={(open) => {
					if (!open) actions.clearFailures()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("userSpace.partialResult")}</DialogTitle>
						<DialogDescription>
							{t("userSpace.partialDescription", {
								success: actions.successCount,
								failed: actions.failures.length,
							})}
						</DialogDescription>
					</DialogHeader>
					<ul className="max-h-64 space-y-2 overflow-auto text-sm">
						{actions.failures.map(({ file, message }) => (
							<li key={file.file_id}>
								<span className="font-medium">{file.file_name ?? file.name}</span>
								<span className="ml-2 text-muted-foreground">{message}</span>
							</li>
						))}
					</ul>
					<DialogFooter>
						<Button onClick={actions.clearFailures}>{t("common.confirm")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<DuplicateFileModal
				visible={upload.duplicates.modalVisible}
				fileName={upload.duplicates.currentFileName}
				totalDuplicates={upload.duplicates.totalDuplicates}
				onCancel={upload.cancelPending}
				onReplace={upload.duplicates.handleReplace}
				onKeepBoth={upload.duplicates.handleKeepBoth}
			/>
			<Dialog
				open={Boolean(info)}
				onOpenChange={(open) => {
					if (!open) actions.setInfo(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("userSpace.info")}</DialogTitle>
					</DialogHeader>
					<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm">
						<dt>{t("userSpace.name")}</dt>
						<dd className="break-all">{info?.file_name}</dd>
						<dt>{t("userSpace.location")}</dt>
						<dd className="break-all">~/{info?.relative_file_path}</dd>
						<dt>{t("userSpace.modified")}</dt>
						<dd>{formatDirectoryFileTime(info?.updated_at, i18n.language)}</dd>
						<dt>{t("userSpace.size")}</dt>
						<dd>
							{new Intl.NumberFormat(i18n.language, {
								style: "unit",
								unit: "byte",
								unitDisplay: "short",
							}).format(info?.file_size ?? 0)}
						</dd>
					</dl>
				</DialogContent>
			</Dialog>
		</>
	)
}
