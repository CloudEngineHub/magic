import { useTranslation } from "react-i18next"

import type { MagicBaseFilterOperator } from "@/apis/modules/magicBase"

export default function useFilterOperatorLabel() {
	const { t } = useTranslation("super")
	return (operator: MagicBaseFilterOperator) => {
		if (operator === "eq") return t("microAppPage.databasePanel.filterOperatorEq")
		if (operator === "in") return t("microAppPage.databasePanel.filterOperatorIn")
		if (operator === "contains") return t("microAppPage.databasePanel.filterOperatorContains")
		if (operator === "gt") return t("microAppPage.databasePanel.filterOperatorGt")
		if (operator === "gte") return t("microAppPage.databasePanel.filterOperatorGte")
		if (operator === "lt") return t("microAppPage.databasePanel.filterOperatorLt")
		return t("microAppPage.databasePanel.filterOperatorLte")
	}
}
