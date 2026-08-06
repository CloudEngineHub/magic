import { IconChevronRight } from "@tabler/icons-react"
import { cx } from "antd-style"
import { Flex } from "antd"
import { useTranslation } from "react-i18next"
import { IconLight } from "@/enhance/tabler/icons-react"
import { openLongTremMemoryModal, preloadLongTremMemoryModal } from "../LongTremMemory"
import { useStyles } from "./styles"

function LongMemoryButton() {
	const { styles } = useStyles()
	const { t } = useTranslation("super")

	const handleClick = () => {
		openLongTremMemoryModal()
	}

	return (
		<div
			className={cx(styles.longMemoryContainer)}
			onClick={handleClick}
			onMouseEnter={preloadLongTremMemoryModal}
			data-testid="handle-click"
		>
			<IconLight size={16} />
			<Flex align="center" gap={4}>
				{t("longMemory", { ns: "super/longMemory" })}
			</Flex>
			<IconChevronRight size={16} color="currentColor" />
		</div>
	)
}

export default LongMemoryButton
