import { useCanvasDesignI18n } from "../../../../../app/providers/I18nProvider"
import { TipBarEscHint } from "../TipBarEscHint/index"

export default function ImageCrop() {
	const { t } = useCanvasDesignI18n()

	return (
		<TipBarEscHint
			tip={t("elementTools.imageCrop.tip", "拖拽调整裁剪区域")}
			escHintSuffix={t("common.cancel", "取消")}
		/>
	)
}
