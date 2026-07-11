import { NodeType, type TreeNode } from "@dtyq/user-selector"
import { Loader2, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MagicBaseApi } from "@/apis"
import type {
	MagicBasePermissionSubjectType,
	MagicBaseTable,
	MagicBaseTablePermissionLevel,
} from "@/apis/modules/magicBase"
import MemberDepartmentSelector from "@/components/business/MemberDepartmentSelector"
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
import { userStore } from "@/models/user"
import { cn } from "@/lib/utils"

export type PermissionEditorMode = "table" | "row" | "column"

export interface PermissionEditorTarget {
	mode: PermissionEditorMode
	rowIds?: string[]
	columnIds?: string[]
	columnKeys?: string[]
}

interface PermissionEditorDialogProps {
	open: boolean
	projectId: string
	table?: MagicBaseTable | null
	target: PermissionEditorTarget | null
	onOpenChange: (open: boolean) => void
	onSaved: () => void
}

const SUBJECT_TYPES: MagicBasePermissionSubjectType[] = [
	"organization",
	"user",
	"department",
	"anonymous",
]
const TABLE_LEVELS: MagicBaseTablePermissionLevel[] = ["read", "insert", "manage"]

function getNodeId(node: TreeNode, type: MagicBasePermissionSubjectType): string {
	if (type === "user" && "user_id" in node) {
		return String((node as TreeNode & { user_id?: string }).user_id || node.id || "")
	}
	if (type === "department" && "department_id" in node) {
		return String(
			(node as TreeNode & { department_id?: string }).department_id || node.id || "",
		)
	}
	return String(node.id || "")
}

function getTargetCount(target: PermissionEditorTarget | null) {
	if (!target) return 0
	if (target.mode === "row") return target.rowIds?.length || 0
	if (target.mode === "column") return target.columnIds?.length || 0
	return 1
}

export default function PermissionEditorDialog({
	open,
	projectId,
	table,
	target,
	onOpenChange,
	onSaved,
}: PermissionEditorDialogProps) {
	const { t } = useTranslation("super")
	const organizationCode =
		userStore.user.organizationCode || userStore.user.userInfo?.organization_code || ""
	const [subjectType, setSubjectType] = useState<MagicBasePermissionSubjectType>("organization")
	const [subjectId, setSubjectId] = useState(organizationCode)
	const [subjectNode, setSubjectNode] = useState<TreeNode | null>(null)
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [tableLevels, setTableLevels] = useState<MagicBaseTablePermissionLevel[]>([])
	const [canRead, setCanRead] = useState(true)
	const [canEdit, setCanEdit] = useState(false)
	const [canDelete, setCanDelete] = useState(false)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (!open) return
		setSubjectType("organization")
		setSubjectId(organizationCode)
		setSubjectNode(null)
		setTableLevels([])
		setCanRead(true)
		setCanEdit(false)
		setCanDelete(false)
	}, [open, organizationCode])

	const handleSubjectTypeChange = (nextType: MagicBasePermissionSubjectType) => {
		setSubjectType(nextType)
		setSubjectNode(null)
		if (nextType === "organization") {
			setSubjectId(organizationCode)
			return
		}
		setSubjectId("")
	}

	const handleSelectorOk = (values: TreeNode[]) => {
		const matched = values.find((item) =>
			subjectType === "user"
				? item.dataType === NodeType.User || item.type === "User"
				: item.dataType === NodeType.Department || item.type === "Department",
		)
		if (!matched) {
			toast.error(t("microAppPage.databasePanel.permissionSelectSubjectFailed"))
			return
		}
		setSubjectNode(matched)
		setSubjectId(getNodeId(matched, subjectType))
		setSelectorOpen(false)
	}

	const toggleTableLevel = (level: MagicBaseTablePermissionLevel, checked: boolean) => {
		setTableLevels((current) =>
			checked ? [...new Set([...current, level])] : current.filter((item) => item !== level),
		)
	}

	const handleSave = async () => {
		if (!table || !target) return
		const resolvedSubjectId =
			subjectType === "organization"
				? organizationCode
				: subjectType === "anonymous"
					? ""
					: subjectId
		if (subjectType !== "anonymous" && !resolvedSubjectId) {
			toast.error(t("microAppPage.databasePanel.permissionSubjectRequired"))
			return
		}
		if (target.mode === "table" && tableLevels.length === 0) {
			toast.error(t("microAppPage.databasePanel.permissionEmpty"))
			return
		}
		if (target.mode === "row" && (target.rowIds || []).length === 0) {
			toast.error(t("microAppPage.databasePanel.permissionEmpty"))
			return
		}
		if (target.mode === "column" && (target.columnIds || []).length === 0) {
			toast.error(t("microAppPage.databasePanel.permissionNoDynamicColumns"))
			return
		}

		setSaving(true)
		try {
			await MagicBaseApi.batchSavePermissions(projectId, table.id, {
				subject_type: subjectType,
				...(subjectType === "anonymous" ? {} : { subject_id: resolvedSubjectId }),
				table_permissions: target.mode === "table" ? tableLevels : [],
				column_permissions:
					target.mode === "column"
						? [
								{
									column_ids: target.columnIds || [],
									can_read: canRead,
									can_edit: canEdit,
								},
							]
						: [],
				row_permissions:
					target.mode === "row"
						? [
								{
									record_ids: target.rowIds || [],
									can_read: canRead,
									can_edit: canEdit,
									can_delete: canDelete,
								},
							]
						: [],
			})
			toast.success(t("microAppPage.databasePanel.permissionSaveSuccess"))
			onSaved()
			onOpenChange(false)
		} catch (error) {
			toast.error(t("microAppPage.databasePanel.permissionSaveFailed"))
		} finally {
			setSaving(false)
		}
	}

	const targetCount = getTargetCount(target)
	const titleKey = target
		? `microAppPage.databasePanel.editorTitle.${target.mode}`
		: "microAppPage.databasePanel.permissionSave"

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-[520px]" style={{ zIndex: 1302 }}>
					<DialogHeader>
						<DialogTitle>{t(titleKey)}</DialogTitle>
						<DialogDescription>
							{t("microAppPage.databasePanel.editorTarget", { total: targetCount })}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<section className="space-y-2">
							<div className="text-xs font-medium text-foreground">
								{t("microAppPage.databasePanel.permissionSubject")}
							</div>
							<div className="grid grid-cols-4 gap-2">
								{SUBJECT_TYPES.map((type) => (
									<Button
										key={type}
										type="button"
										variant={subjectType === type ? "default" : "outline"}
										size="sm"
										className="h-8 justify-center text-xs"
										onClick={() => handleSubjectTypeChange(type)}
									>
										{t(`microAppPage.databasePanel.subjectType.${type}`)}
									</Button>
								))}
							</div>
							{subjectType === "user" || subjectType === "department" ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 w-full justify-start gap-2"
									onClick={() => setSelectorOpen(true)}
								>
									<Users className="size-3.5" />
									<span className="truncate">
										{subjectNode?.name ||
											t("microAppPage.databasePanel.permissionSelectSubject")}
									</span>
								</Button>
							) : (
								<div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
									{subjectType === "organization"
										? organizationCode || "-"
										: t("microAppPage.databasePanel.subjectAnonymous")}
								</div>
							)}
						</section>

						<section className="space-y-2">
							<div className="text-xs font-medium text-foreground">
								{t("microAppPage.databasePanel.permission")}
							</div>
							{target?.mode === "table" ? (
								<div className="flex flex-wrap gap-3">
									{TABLE_LEVELS.map((level) => (
										<label
											key={level}
											className="flex items-center gap-2 text-xs"
										>
											<Checkbox
												checked={tableLevels.includes(level)}
												onCheckedChange={(checked) =>
													toggleTableLevel(level, checked === true)
												}
											/>
											<span>
												{t(
													`microAppPage.databasePanel.permissionLevel.${level}`,
												)}
											</span>
										</label>
									))}
								</div>
							) : (
								<div className="flex flex-wrap gap-3">
									{(["read", "edit"] as const).map((action) => (
										<label
											key={action}
											className="flex items-center gap-2 text-xs"
										>
											<Checkbox
												checked={action === "read" ? canRead : canEdit}
												onCheckedChange={(checked) =>
													action === "read"
														? setCanRead(checked === true)
														: setCanEdit(checked === true)
												}
											/>
											<span>
												{t(
													`microAppPage.databasePanel.permissionAction.${action}`,
												)}
											</span>
										</label>
									))}
									{target?.mode === "row" ? (
										<label className="flex items-center gap-2 text-xs">
											<Checkbox
												checked={canDelete}
												onCheckedChange={(checked) =>
													setCanDelete(checked === true)
												}
											/>
											<span>
												{t(
													"microAppPage.databasePanel.permissionAction.delete",
												)}
											</span>
										</label>
									) : null}
								</div>
							)}
						</section>

						{target?.mode === "column" && target.columnKeys?.length ? (
							<div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
								<span className="line-clamp-2">{target.columnKeys.join(", ")}</span>
							</div>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={saving}
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							className={cn("min-w-20", saving && "gap-2")}
							disabled={saving}
							onClick={handleSave}
						>
							{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
							{t("microAppPage.databasePanel.permissionSave")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<MemberDepartmentSelector
				open={selectorOpen}
				onlyDepartment={subjectType === "department"}
				selectedValues={subjectNode ? [subjectNode] : []}
				title={t("microAppPage.databasePanel.permissionSelectSubject")}
				onOk={handleSelectorOk}
				onCancel={() => setSelectorOpen(false)}
				zIndex={1600}
				centered
			/>
		</>
	)
}
