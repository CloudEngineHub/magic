import { Loader2 } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@magic-admin-v2/components/ui/alert-dialog"

export type ConfirmDialogVariant = "default" | "danger"

export type ConfirmDialogProps = {
	open: boolean
	title: ReactNode
	description: ReactNode
	children?: ReactNode
	onOpenChange: (open: boolean) => void
	onCloseAutoFocus?: ComponentProps<typeof AlertDialogContent>["onCloseAutoFocus"]
	onConfirm: () => void | Promise<void>
	variant?: ConfirmDialogVariant
	cancelLabel?: ReactNode
	confirmDisabled?: boolean
	confirmIcon?: ReactNode
	confirmLabel?: ReactNode
	isPending?: boolean
}

export function ConfirmDialog({
	open,
	title,
	description,
	children,
	onOpenChange,
	onCloseAutoFocus,
	onConfirm,
	variant = "default",
	cancelLabel,
	confirmDisabled = false,
	confirmIcon,
	confirmLabel,
	isPending = false,
}: ConfirmDialogProps) {
	const { t } = useTranslation()
	const isDanger = variant === "danger"

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && isPending) return
		onOpenChange(nextOpen)
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent aria-busy={isPending} onCloseAutoFocus={onCloseAutoFocus}>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{children}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>
						{cancelLabel ?? t("common.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						className={
							isDanger
								? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
								: undefined
						}
						disabled={confirmDisabled || isPending}
						onClick={(event) => {
							event.preventDefault()
							void onConfirm()
						}}
					>
						{isPending ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							confirmIcon
						)}
						{confirmLabel ?? t("common.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
