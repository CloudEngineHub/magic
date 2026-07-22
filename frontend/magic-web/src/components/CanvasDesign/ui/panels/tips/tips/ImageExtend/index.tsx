import { useCanvasDesignI18n } from "../../../../../app/providers/I18nProvider"
import { TipBarEscHint } from "../TipBarEscHint/index"

export default function ImageExtend() {
	const { t } = useCanvasDesignI18n()

	return (
		<TipBarEscHint
			tip={t("elementTools.imageExtend.tip", "进入图片扩展模式")}
			escHintSuffix={t("common.cancel", "取消")}
		/>
	)
}
