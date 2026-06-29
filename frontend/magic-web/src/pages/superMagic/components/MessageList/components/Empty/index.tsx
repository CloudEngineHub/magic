import { useTranslation } from "react-i18next"
import { useStyles } from "./style"

export default function Empty() {
	const { styles } = useStyles()
	const { t } = useTranslation("common")
	return (
		<div className={styles.emptyContainer}>
			<div className={styles.emptyIcon}>👋🏻</div>
			<div className={styles.emptyTitle}>{`Hello, 我是${t("platform.name")}`}</div>
			<div className={styles.emptyText}>我能为您做些什么？</div>
		</div>
	)
}
