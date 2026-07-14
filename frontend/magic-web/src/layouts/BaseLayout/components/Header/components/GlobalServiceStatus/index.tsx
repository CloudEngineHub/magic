import MagicIcon from "@/components/base/MagicIcon"
import { interfaceStore } from "@/stores/interface"
import { IconWifiOff, IconLoader2 } from "@tabler/icons-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useStyles } from "./styles"
import { useNetwork } from "ahooks"

function GlobalServiceStatus() {
	const { t } = useTranslation("interface")
	const { styles } = useStyles()
	const isWebSocketConnecting = interfaceStore.isConnecting
	const showReloadButton = interfaceStore.showReloadButton

	const { online } = useNetwork()

	// Network offline status has highest priority
	if (!online || showReloadButton) {
		return (
			<div className={styles.offlineContainer} onClick={() => window.location.reload()}>
				<MagicIcon
					component={IconWifiOff}
					size={16}
					color="currentColor"
					className={styles.offlineIcon}
				/>
				<span className={styles.offlineText}>
					{t("globalServiceStatus.networkOffline")}
				</span>
			</div>
		)
	}

	// WebSocket connecting status
	if (isWebSocketConnecting) {
		return (
			<div className={styles.connectingContainer}>
				<MagicIcon
					component={IconLoader2}
					size={16}
					color="currentColor"
					className={styles.connectingIcon}
				/>
				<span className={styles.connectingText}>
					{t("globalServiceStatus.networkConnecting")}
				</span>
			</div>
		)
	}

	return null
}

export default observer(GlobalServiceStatus)
