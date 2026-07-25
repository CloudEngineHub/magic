import { useCanvasDesignI18n } from "../../../../../app/providers/I18nProvider"
import { TipBarEscHint } from "../TipBarEscHint/index"

export default function ImageEraser() {
	const { t } = useCanvasDesignI18n()

	return (
		<TipBarEscHint
			tip={t("elementTools.imageEraser.tip", "涂抹可擦除区域")}
			escHintSuffix={t("common.cancel", "取消")}
		/>
	)
}
