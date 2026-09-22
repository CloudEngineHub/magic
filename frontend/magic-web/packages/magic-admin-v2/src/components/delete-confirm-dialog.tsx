import { Trash2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@magic-admin-v2/components/confirm-dialog";

export type DeleteConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: ComponentProps<typeof ConfirmDialog>["onCloseAutoFocus"];
  onConfirm: () => void | Promise<void>;
  cancelLabel?: ReactNode;
  confirmDisabled?: boolean;
  confirmIcon?: ReactNode;
  confirmLabel?: ReactNode;
  isPending?: boolean;
};

export function DeleteConfirmDialog({
  open,
  title,
  description,
  onOpenChange,
  onCloseAutoFocus,
  onConfirm,
  cancelLabel,
  confirmDisabled = false,
  confirmIcon,
  confirmLabel,
  isPending = false,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation();

  return (
		<ConfirmDialog
			open={open}
			title={title}
			description={description}
			onOpenChange={onOpenChange}
			onCloseAutoFocus={onCloseAutoFocus}
			onConfirm={onConfirm}
			variant="danger"
			cancelLabel={cancelLabel}
			confirmDisabled={confirmDisabled}
			confirmIcon={confirmIcon ?? <Trash2 className="size-4" aria-hidden="true" />}
			confirmLabel={confirmLabel ?? t("common.delete")}
			isPending={isPending}
		/>
	);
}
