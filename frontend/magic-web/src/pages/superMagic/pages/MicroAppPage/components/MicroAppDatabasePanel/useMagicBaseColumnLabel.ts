import { useTranslation } from "react-i18next"

import type { MagicBaseColumn } from "@/apis/modules/magicBase"

export default function useMagicBaseColumnLabel() {
	const { t } = useTranslation("super")

	return (column: MagicBaseColumn) => {
		switch (column.column_key) {
			case "id":
				return t("microAppPage.databasePanel.systemFieldName.id")
			case "organization_code":
				return t("microAppPage.databasePanel.systemFieldName.organizationCode")
			case "created_by":
				return t("microAppPage.databasePanel.systemFieldName.createdBy")
			case "created_at":
				return t("microAppPage.databasePanel.systemFieldName.createdAt")
			case "updated_at":
				return t("microAppPage.databasePanel.systemFieldName.updatedAt")
			default:
				return column.column_name || column.column_key
		}
	}
}
