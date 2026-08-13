import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MagicBaseApi } from "@/apis"
import type { MagicBaseColumn, MagicBaseRow, MagicBaseTable } from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { Textarea } from "@/components/shadcn-ui/textarea"
import { buildMagicBaseSelect, getEnabledColumns, normalizeMagicBaseBooleanValue } from "./utils"

type RowEditorMode = "create" | "edit"

interface RowEditorDialogProps {
	open: boolean
	mode: RowEditorMode
	projectId: string
	table: MagicBaseTable | null
	row?: MagicBaseRow | null
	onOpenChange: (open: boolean) => void
	onSaved: () => void
}

type FormValues = Record<string, boolean | string>

function isBooleanColumn(column: MagicBaseColumn) {
	return column.data_type === "boolean"
}

function formatInitialValue(column: MagicBaseColumn, row?: MagicBaseRow | null): boolean | string {
	const value = row?.[column.column_key]
	if (isBooleanColumn(column)) return normalizeMagicBaseBooleanValue(value)
	if (value == null) return ""
	if (column.data_type === "datetime") {
		return String(value).replace(" ", "T").slice(0, 19)
	}
	if (column.data_type === "json") {
		if (typeof value === "string") return value
		try {
			return JSON.stringify(value, null, 2)
		} catch {
			return String(value)
		}
	}
	return String(value)
}

function parseColumnValue(column: MagicBaseColumn, value: boolean | string): unknown {
	if (isBooleanColumn(column)) return normalizeMagicBaseBooleanValue(value)
	const stringValue = String(value)
	if (stringValue.trim() === "" && !column.is_required) return null
	if (column.data_type === "number") return Number(stringValue)
	if (column.data_type === "datetime") return stringValue.replace("T", " ")
	if (column.data_type === "json") {
		if (stringValue.trim() === "") return column.is_required ? "" : null
		return JSON.parse(stringValue)
	}
	return stringValue
}

export default function RowEditorDialog({
	open,
	mode,
	projectId,
	table,
	row,
	onOpenChange,
	onSaved,
}: RowEditorDialogProps) {
	const { t } = useTranslation("super")
	const [values, setValues] = useState<FormValues>({})
	const [saving, setSaving] = useState(false)

	const columns = useMemo(
		() =>
			getEnabledColumns(table).filter(
				(column) => !column.system && column.source !== "system",
			),
		[table],
	)

	useEffect(() => {
		if (!open) return
		const nextValues: FormValues = {}
		columns.forEach((column) => {
			nextValues[column.column_key] = formatInitialValue(column, row)
		})
		setValues(nextValues)
	}, [columns, open, row])

	const setFieldValue = (field: string, value: boolean | string) => {
		setValues((current) => ({ ...current, [field]: value }))
	}

	const buildPayload = () => {
		const data: Record<string, unknown> = {}
		for (const column of columns) {
			const value = values[column.column_key]
			if (
				column.is_required &&
				!isBooleanColumn(column) &&
				String(value ?? "").trim() === ""
			) {
				throw new Error(
					t("microAppPage.databasePanel.rowFieldRequired", {
						field: column.column_name || column.column_key,
					}),
				)
			}
			try {
				data[column.column_key] = parseColumnValue(column, value ?? "")
			} catch {
				throw new Error(
					t("microAppPage.databasePanel.rowJsonInvalid", {
						field: column.column_name || column.column_key,
					}),
				)
			}
		}
		return data
	}

	const handleSave = async () => {
		if (!table || !projectId) return
		const recordId = row?.id ?? row?.record_id
		if (mode === "edit" && !recordId) return

		setSaving(true)
		try {
			const data = buildPayload()
			const request = {
				data,
				select: buildMagicBaseSelect(table),
			}
			if (mode === "create") {
				await MagicBaseApi.createRow(projectId, table.id, request)
				toast.success(t("microAppPage.databasePanel.rowCreateSuccess"))
			} else {
				await MagicBaseApi.updateRow(projectId, table.id, String(recordId), request)
				toast.success(t("microAppPage.databasePanel.rowUpdateSuccess"))
			}
			onSaved()
			onOpenChange(false)
		} catch (error) {
			const message = error instanceof Error ? error.message : ""
			toast.error(
				message ||
					t(
						mode === "create"
							? "microAppPage.databasePanel.rowCreateFailed"
							: "microAppPage.databasePanel.rowUpdateFailed",
					),
			)
		} finally {
			setSaving(false)
		}
	}

	const titleKey =
		mode === "create"
			? "microAppPage.databasePanel.rowCreateTitle"
			: "microAppPage.databasePanel.rowEditTitle"

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px]" style={{ zIndex: 1302 }}>
				<DialogHeader>
					<DialogTitle>{t(titleKey)}</DialogTitle>
					<DialogDescription>
						{table?.table_name ||
							table?.table_key ||
							t("microAppPage.databasePanel.loadingTable")}
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
					{columns.length === 0 ? (
						<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
							{t("microAppPage.databasePanel.rowNoEditableColumns")}
						</div>
					) : (
						columns.map((column) => {
							const field = column.column_key
							const label = column.column_name || field
							const value = values[field]
							return (
								<div key={field} className="space-y-2">
									<Label htmlFor={`magicbase-row-${field}`}>
										{label}
										{column.is_required ? (
											<span className="text-destructive">*</span>
										) : null}
									</Label>
									{isBooleanColumn(column) ? (
										<div className="flex h-9 items-center gap-2">
											<Checkbox
												id={`magicbase-row-${field}`}
												checked={Boolean(value)}
												onCheckedChange={(checked) =>
													setFieldValue(field, checked === true)
												}
											/>
											<span className="text-sm text-muted-foreground">
												{value
													? t("microAppPage.databasePanel.yes")
													: t("microAppPage.databasePanel.no")}
											</span>
										</div>
									) : column.data_type === "json" ? (
										<Textarea
											id={`magicbase-row-${field}`}
											value={String(value ?? "")}
											className="min-h-24 font-mono text-xs"
											placeholder='{"key":"value"}'
											onChange={(event) =>
												setFieldValue(field, event.target.value)
											}
										/>
									) : (
										<Input
											id={`magicbase-row-${field}`}
											type={
												column.data_type === "number"
													? "number"
													: column.data_type === "datetime"
														? "datetime-local"
														: "text"
											}
											step={column.data_type === "datetime" ? 1 : undefined}
											value={String(value ?? "")}
											onChange={(event) =>
												setFieldValue(field, event.target.value)
											}
										/>
									)}
									<p className="text-[11px] text-muted-foreground">
										{field} · {column.data_type}
									</p>
								</div>
							)
						})
					)}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						{t("common.cancel")}
					</Button>
					<Button
						type="button"
						onClick={handleSave}
						disabled={saving || columns.length === 0}
					>
						{saving ? <Loader2 className="size-4 animate-spin" /> : null}
						{t("microAppPage.databasePanel.rowSave")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
