import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { MicroAppListItem } from "@/apis/modules/superMagic"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"

interface MicroAppListActionDialogsProps {
	renameTarget: MicroAppListItem | null
	deleteTarget: MicroAppListItem | null
	renaming: boolean
	deleting: boolean
	onCloseRename: () => void
	onCloseDelete: () => void
	onConfirmRename: (appName: string) => void
	onConfirmDelete: () => void
}

export default function MicroAppListActionDialogs({
	renameTarget,
	deleteTarget,
	renaming,
	deleting,
	onCloseRename,
	onCloseDelete,
	onConfirmRename,
	onConfirmDelete,
}: MicroAppListActionDialogsProps) {
	const { t } = useTranslation("super")
	const [appName, setAppName] = useState("")

	useEffect(() => {
		setAppName(renameTarget?.app_name ?? "")
	}, [renameTarget])

	const trimmedName = appName.trim()
	const renameDisabled = !trimmedName || trimmedName === renameTarget?.app_name.trim() || renaming

	return (
		<>
			<Dialog
				open={renameTarget !== null}
				onOpenChange={(open) => !open && !renaming && onCloseRename()}
			>
				<DialogContent className="sm:max-w-md" data-testid="micro-app-rename-dialog">
					<DialogHeader>
						<DialogTitle>{t("microAppsPage.actions.renameTitle")}</DialogTitle>
						<DialogDescription>
							{t("microAppsPage.actions.renameDescription")}
						</DialogDescription>
					</DialogHeader>
					<Input
						value={appName}
						onChange={(event) => setAppName(event.target.value)}
						placeholder={t("microAppsPage.actions.renamePlaceholder")}
						maxLength={100}
						autoFocus
						data-testid="micro-app-rename-input"
						onKeyDown={(event) => {
							if (event.key === "Enter" && !renameDisabled)
								onConfirmRename(trimmedName)
						}}
					/>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onCloseRename}
							disabled={renaming}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							disabled={renameDisabled}
							onClick={() => onConfirmRename(trimmedName)}
							data-testid="micro-app-rename-confirm"
						>
							{renaming ? t("microAppsPage.actions.renaming") : t("common.confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && !deleting && onCloseDelete()}
			>
				<AlertDialogContent data-testid="micro-app-delete-dialog">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("microAppsPage.actions.deleteTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("microAppsPage.actions.deleteDescription", {
								name: deleteTarget?.app_name || t("microAppsPage.unnamedApp"),
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>
							{t("common.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={(event) => {
								event.preventDefault()
								onConfirmDelete()
							}}
							data-testid="micro-app-delete-confirm"
						>
							{deleting
								? t("microAppsPage.actions.deleting")
								: t("microAppsPage.actions.deleteApp")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
