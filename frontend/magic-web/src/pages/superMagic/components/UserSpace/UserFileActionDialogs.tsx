import { useTranslation } from "react-i18next"
import { Input } from "antd"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/shadcn-ui/dialog"
import { Button } from "@/components/shadcn-ui/button"
import { SelectDirectoryModal } from "../SelectPathModal"
import { DuplicateFileModal } from "../TopicFilesButton/components/DuplicateFileModal"
import type { useUserSpaceFileActions } from "./hooks/useUserSpaceFileActions"

export function UserFileActionDialogs({
	actions,
}: {
	actions: ReturnType<typeof useUserSpaceFileActions>
}) {
	const { t } = useTranslation("super")
	const { rename, virtualFile, virtualFolder, move, upload } = actions
	const input = rename.renamingItemId
		? {
				title: t("userSpace.rename"),
				value: rename.renameValue,
				setValue: rename.setRenameValue,
				error: rename.renameErrorMessage,
				ref: rename.renameInputRef,
				confirm: rename.handleRenameConfirm,
				cancel: rename.handleRenameCancel,
			}
		: virtualFolder.editingVirtualId
			? {
					title: t("userSpace.createFolder"),
					value: virtualFolder.virtualFolderName,
					setValue: virtualFolder.setVirtualFolderName,
					error: virtualFolder.errorMessage,
					ref: virtualFolder.virtualInputRef,
					confirm: virtualFolder.confirmVirtualFolder,
					cancel: virtualFolder.cancelVirtualFolder,
				}
			: virtualFile.editingVirtualId
				? {
						title: t("userSpace.createFile"),
						value: virtualFile.virtualFileName,
						setValue: virtualFile.setVirtualFileName,
						error: virtualFile.errorMessage,
						ref: virtualFile.virtualInputRef,
						confirm: virtualFile.confirmVirtualFile,
						cancel: virtualFile.cancelVirtualFile,
					}
				: null
	return (
		<>
			<Dialog
				open={Boolean(input)}
				onOpenChange={(open) => {
					if (!open && !actions.busy) input?.cancel()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{input?.title}</DialogTitle>
						<DialogDescription>{t("userSpace.nameDescription")}</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault()
							void input?.confirm()
						}}
					>
						<Input
							ref={input?.ref}
							value={input?.value ?? ""}
							disabled={actions.busy}
							onChange={(event) => input?.setValue(event.target.value)}
							aria-label={t("userSpace.name")}
						/>
						{input?.error && (
							<p role="alert" className="text-sm text-destructive">
								{input.error}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={actions.busy}
								onClick={() => input?.cancel()}
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
			<SelectDirectoryModal {...move.selectorConfig} />
			<Dialog
				open={move.failures.length > 0}
				onOpenChange={(open) => {
					if (!open) move.clearFailures()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("userSpace.partialResult")}</DialogTitle>
						<DialogDescription>
							{t("userSpace.partialDescription", {
								success: move.successCount,
								failed: move.failures.length,
							})}
						</DialogDescription>
					</DialogHeader>
					<ul className="max-h-64 space-y-2 overflow-auto text-sm">
						{move.failures.map(({ file, message }) => (
							<li key={file.file_id}>
								<span className="font-medium">{file.file_name ?? file.name}</span>
								<span className="ml-2 text-muted-foreground">{message}</span>
							</li>
						))}
					</ul>
					<DialogFooter>
						<Button onClick={move.clearFailures}>{t("common.confirm")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<DuplicateFileModal
				visible={upload.duplicateFileHandler.modalVisible}
				fileName={upload.duplicateFileHandler.currentFileName}
				totalDuplicates={upload.duplicateFileHandler.totalDuplicates}
				onCancel={upload.cancelDirectUpload}
				onReplace={upload.duplicateFileHandler.handleReplace}
				onKeepBoth={upload.duplicateFileHandler.handleKeepBoth}
			/>
			{actions.fileInfoPanel}
		</>
	)
}
