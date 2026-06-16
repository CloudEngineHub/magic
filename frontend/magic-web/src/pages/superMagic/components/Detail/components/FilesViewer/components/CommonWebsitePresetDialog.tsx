import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import type { WebsitePreset } from "../types"

export type CommonWebsitePresetFormValues = Pick<WebsitePreset, "title" | "url" | "description">

interface CommonWebsitePresetDialogProps {
	open: boolean
	mode: "add" | "edit"
	initialValues?: CommonWebsitePresetFormValues
	onOpenChange: (open: boolean) => void
	onSubmit: (values: CommonWebsitePresetFormValues) => void
}

const DEFAULT_VALUES: CommonWebsitePresetFormValues = {
	title: "",
	url: "",
	description: "",
}

function CommonWebsitePresetDialog({
	open,
	mode,
	initialValues,
	onOpenChange,
	onSubmit,
}: CommonWebsitePresetDialogProps) {
	const { t } = useTranslation("super")
	const [values, setValues] = useState<CommonWebsitePresetFormValues>(DEFAULT_VALUES)

	useEffect(() => {
		if (!open) return
		setValues({
			...DEFAULT_VALUES,
			...initialValues,
		})
	}, [open, initialValues])

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault()
		onSubmit({
			title: values.title?.trim() || "",
			url: values.url.trim(),
			description: values.description?.trim() || undefined,
		})
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[420px]" data-testid="common-website-preset-dialog">
				<form className="space-y-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{mode === "edit"
								? t("fileViewer.website.commonEditTitle")
								: t("fileViewer.website.commonAddTitle")}
						</DialogTitle>
						<DialogDescription>
							{t("fileViewer.website.commonDialogDescription")}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						<label className="block space-y-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								{t("fileViewer.website.commonTitleLabel")}
							</span>
							<input
								aria-label={t("fileViewer.website.commonTitleLabel")}
								value={values.title}
								onChange={(event) =>
									setValues((previous) => ({
										...previous,
										title: event.target.value,
									}))
								}
								className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
							/>
						</label>
						<label className="block space-y-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								{t("fileViewer.website.commonUrlLabel")}
							</span>
							<input
								aria-label={t("fileViewer.website.commonUrlLabel")}
								value={values.url}
								onChange={(event) =>
									setValues((previous) => ({
										...previous,
										url: event.target.value,
									}))
								}
								className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
							/>
						</label>
					</div>

					<DialogFooter>
						<button
							type="button"
							className="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
							onClick={() => onOpenChange(false)}
						>
							{t("fileViewer.website.commonCancel")}
						</button>
						<button
							type="submit"
							className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!values.url.trim()}
						>
							{t("fileViewer.website.commonConfirm")}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

export default CommonWebsitePresetDialog
