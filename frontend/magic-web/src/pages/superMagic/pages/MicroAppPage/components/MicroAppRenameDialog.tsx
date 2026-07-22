import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

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
import { shouldSuppressInputAutoFocusInMagicApp } from "@/utils/inputFocusPolicy"

interface MicroAppRenameDialogProps {
	open: boolean
	projectName?: string
	isSubmitting?: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (projectName: string) => Promise<boolean>
}

/** 微应用桌面端和移动端共用的项目名称编辑入口。 */
export default function MicroAppRenameDialog({
	open,
	projectName,
	isSubmitting = false,
	onOpenChange,
	onConfirm,
}: MicroAppRenameDialogProps) {
	const { t } = useTranslation("super")
	const [nameInput, setNameInput] = useState("")
	const shouldAutoFocusInput = !shouldSuppressInputAutoFocusInMagicApp()
	const trimmedName = nameInput.trim()
	const currentName = projectName?.trim() || ""
	const canSubmit = Boolean(trimmedName && trimmedName !== currentName && !isSubmitting)

	useEffect(() => {
		if (open) setNameInput(projectName || "")
	}, [open, projectName])

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!canSubmit) return

		const renamed = await onConfirm(trimmedName)
		if (renamed) onOpenChange(false)
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!isSubmitting) onOpenChange(nextOpen)
			}}
		>
			<DialogContent
				className="sm:max-w-[425px]"
				showCloseButton={!isSubmitting}
				data-testid="micro-app-rename-dialog"
				onOpenAutoFocus={(event) => {
					if (!shouldAutoFocusInput) event.preventDefault()
				}}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{t("microAppPage.rename.title")}</DialogTitle>
					<DialogDescription className="sr-only">
						{t("microAppPage.rename.description")}
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<label className="flex flex-col gap-2 text-sm text-muted-foreground">
						<span>{t("microAppPage.rename.nameLabel")}</span>
						<Input
							autoFocus={shouldAutoFocusInput}
							maxLength={100}
							value={nameInput}
							placeholder={t("microAppPage.rename.placeholder")}
							disabled={isSubmitting}
							onChange={(event) => setNameInput(event.target.value)}
							data-testid="micro-app-rename-input"
						/>
					</label>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={isSubmitting}
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="submit"
							disabled={!canSubmit}
							data-testid="micro-app-rename-confirm"
						>
							{isSubmitting ? t("common.loading") : t("common.confirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
