import { Loader2, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MagicBaseApi } from "@/apis"
import type {
	MagicBaseColumn,
	MagicBasePermissionsResponse,
	MagicBaseTable,
} from "@/apis/modules/magicBase"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea, ScrollBar } from "@/components/shadcn-ui/scroll-area"

interface PermissionPanelProps {
	projectId: string
	table: MagicBaseTable
	permissions?: MagicBasePermissionsResponse
	loading?: boolean
	columns: MagicBaseColumn[]
	onRefreshPermissions: () => void
}

type PermissionType = "table" | "column" | "row"

function getSubjectLabel(type: string, id?: string) {
	return id ? `${type}:${id}` : type
}

export default function PermissionPanel({
	projectId,
	table,
	permissions,
	loading,
	columns,
	onRefreshPermissions,
}: PermissionPanelProps) {
	const { t } = useTranslation("super")
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const dynamicColumns = useMemo(
		() => columns.filter((column) => column.source !== "system" && column.id),
		[columns],
	)

	const handleDelete = async (type: PermissionType, permissionId: string) => {
		setDeletingId(`${type}:${permissionId}`)
		try {
			await MagicBaseApi.deletePermission(projectId, table.id, type, permissionId)
			toast.success(t("microAppPage.databasePanel.permissionDeleteSuccess"))
			onRefreshPermissions()
		} catch (error) {
			toast.error(t("microAppPage.databasePanel.permissionDeleteFailed"))
		} finally {
			setDeletingId(null)
		}
	}

	const renderPermissionRow = (
		type: PermissionType,
		permissionId: string,
		subjectTypeValue: string,
		subjectIdValue: string,
		target: string,
		value: string,
	) => {
		const deleting = deletingId === `${type}:${permissionId}`
		return (
			<div
				key={`${type}:${permissionId}`}
				className="grid grid-cols-[96px_1fr_1fr_120px_40px] items-center gap-2 border-b border-border px-3 py-2 text-xs"
			>
				<Badge variant="outline" className="w-fit rounded-md">
					{t(`microAppPage.databasePanel.permissionType.${type}`)}
				</Badge>
				<span
					className="truncate"
					title={getSubjectLabel(subjectTypeValue, subjectIdValue)}
				>
					{getSubjectLabel(subjectTypeValue, subjectIdValue)}
				</span>
				<span className="truncate text-muted-foreground" title={target}>
					{target}
				</span>
				<span className="truncate text-muted-foreground" title={value}>
					{value}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={deleting}
					aria-label={t("microAppPage.databasePanel.permissionDelete")}
					onClick={() => handleDelete(type, permissionId)}
				>
					{deleting ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Trash2 className="size-3.5" />
					)}
				</Button>
			</div>
		)
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-between border-b border-border px-4 py-2">
				<span className="text-xs text-muted-foreground">
					{t("microAppPage.databasePanel.permissionExisting")}
				</span>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				{loading ? (
					<div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
						<Loader2 className="size-3.5 animate-spin" />
						{t("microAppPage.databasePanel.loading")}
					</div>
				) : (
					<div>
						{(permissions?.table_permissions || []).map((permission) =>
							renderPermissionRow(
								"table",
								permission.id,
								permission.subject_type,
								permission.subject_id,
								table.table_name || table.table_key,
								t(
									`microAppPage.databasePanel.permissionLevel.${permission.permission_level}`,
								),
							),
						)}
						{(permissions?.column_permissions || []).map((permission) => {
							const column = dynamicColumns.find(
								(item) => item.id === permission.column_id,
							)
							return renderPermissionRow(
								"column",
								permission.id,
								permission.subject_type,
								permission.subject_id,
								column?.column_name || permission.column_id,
								[
									permission.can_read &&
										t("microAppPage.databasePanel.permissionAction.read"),
									permission.can_edit &&
										t("microAppPage.databasePanel.permissionAction.edit"),
								]
									.filter(Boolean)
									.join(" / ") || "-",
							)
						})}
						{(permissions?.row_permissions || []).map((permission) =>
							renderPermissionRow(
								"row",
								permission.id,
								permission.subject_type,
								permission.subject_id,
								permission.record_id,
								[
									permission.can_read &&
										t("microAppPage.databasePanel.permissionAction.read"),
									permission.can_edit &&
										t("microAppPage.databasePanel.permissionAction.edit"),
									permission.can_delete &&
										t("microAppPage.databasePanel.permissionAction.delete"),
								]
									.filter(Boolean)
									.join(" / ") || "-",
							),
						)}
						{(permissions?.table_permissions || []).length === 0 &&
						(permissions?.column_permissions || []).length === 0 &&
						(permissions?.row_permissions || []).length === 0 ? (
							<div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
								{t("microAppPage.databasePanel.permissionEmptyList")}
							</div>
						) : null}
					</div>
				)}
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</div>
	)
}
