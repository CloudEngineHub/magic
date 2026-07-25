import { useTranslation } from "react-i18next"
import type { MagicBaseColumn } from "@/apis/modules/magicBase"
import { Badge } from "@/components/shadcn-ui/badge"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/shadcn-ui/table"

interface StructureTableProps {
	columns: MagicBaseColumn[]
}

export default function StructureTable({ columns }: StructureTableProps) {
	const { t } = useTranslation("super")

	if (columns.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t("microAppPage.databasePanel.noColumns")}
			</div>
		)
	}

	return (
		<Table>
			<TableHeader className="sticky top-0 z-10 bg-background">
				<TableRow>
					<TableHead>{t("microAppPage.databasePanel.columnName")}</TableHead>
					<TableHead>{t("microAppPage.databasePanel.columnKey")}</TableHead>
					<TableHead>{t("microAppPage.databasePanel.dataType")}</TableHead>
					<TableHead>{t("microAppPage.databasePanel.source")}</TableHead>
					<TableHead>{t("microAppPage.databasePanel.required")}</TableHead>
					<TableHead>{t("microAppPage.databasePanel.status")}</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{columns.map((column) => (
					<TableRow key={column.id || column.column_key}>
						<TableCell className="font-medium">{column.column_name}</TableCell>
						<TableCell className="font-mono text-xs text-muted-foreground">
							{column.column_key}
						</TableCell>
						<TableCell>{column.data_type}</TableCell>
						<TableCell>
							<Badge
								variant={column.source === "system" ? "secondary" : "outline"}
								className="rounded-md"
							>
								{column.source === "system"
									? t("microAppPage.databasePanel.systemField")
									: t("microAppPage.databasePanel.schemaField")}
							</Badge>
						</TableCell>
						<TableCell>
							{column.is_required
								? t("microAppPage.databasePanel.yes")
								: t("microAppPage.databasePanel.no")}
						</TableCell>
						<TableCell>
							<Badge variant="outline" className="rounded-md">
								{column.status || "-"}
							</Badge>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
