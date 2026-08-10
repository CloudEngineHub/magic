import { IconChevronRight, IconOctahedron, IconBrain, IconShare3 } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import FlexBox from "@/components/base/FlexBox"
import { useStyles } from "./styles"
import { openLongTremMemoryModal } from "@/pages/superMagic/components/LongTremMemory"
import { openShareManagementModal } from "@/pages/superMagic/components/ShareManagement/openShareManagementModal"
import { observer } from "mobx-react-lite"
import { projectStore } from "@/pages/superMagic/stores/core"

interface MenuItemProps {
	icon: React.ReactNode
	title: string
	badge?: React.ReactNode
	onClick?: () => void
}

function MenuItem({ icon, title, badge, onClick }: MenuItemProps) {
	const { styles } = useStyles()

	return (
		<div className={styles.menuItem} onClick={onClick} data-testid="workspace-section">
			<FlexBox gap={8} align="center">
				<div className={styles.iconWrapper}>{icon}</div>
				<div className={styles.menuTitle}>{title}</div>
				{badge}
			</FlexBox>
			<IconChevronRight className={styles.arrow} />
		</div>
	)
}

export default observer(function WorkspaceSection({ toWorkspace }: { toWorkspace: () => void }) {
	const { styles } = useStyles()
	const { t } = useTranslation("super")

	const selectedProject = projectStore.selectedProject

	const workspaceIcon = (
		<div className={styles.workspaceIcon}>
			<IconOctahedron size={20} color="white" />
		</div>
	)

	const memoryIcon = (
		<div className={styles.memoryIcon}>
			<IconBrain size={20} color="white" />
		</div>
	)

	const shareIcon = (
		<div className={styles.shareIcon}>
			<IconShare3 size={20} color="white" />
		</div>
	)

	// const scheduleIcon = (
	// 	<div className={styles.scheduleIcon}>
	// 		<IconClockPlay size={20} />
	// 	</div>
	// )

	// const preferenceIcon = (
	// 	<div className={styles.preferenceIcon}>
	// 		<IconHeart size={20} />
	// 	</div>
	// )

	return (
		<div className={styles.container}>
			<MenuItem
				icon={workspaceIcon}
				title={t("mobile.navigate.workspace")}
				onClick={toWorkspace}
			/>
			<div className={styles.divider} />
			<MenuItem
				icon={memoryIcon}
				title={t("mobile.navigate.longTermMemory")}
				onClick={() => openLongTremMemoryModal()}
			/>
			{selectedProject && (
				<>
					<div className={styles.divider} />
					<MenuItem
						icon={shareIcon}
						title={t("mobile.navigate.shareManagement")}
						onClick={() => openShareManagementModal(selectedProject.id, true)}
					/>
				</>
			)}
			{/* <div className={styles.divider} />
			<MenuItem icon={scheduleIcon} title={t("mobile.navigate.scheduledTasks")} />
			<div className={styles.divider} />
			<MenuItem icon={preferenceIcon} title={t("mobile.navigate.preferences")} /> */}
		</div>
	)
})
