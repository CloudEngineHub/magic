/**
 * 内置插件注册顺序（面板展示顺序）。
 * 新增插件：创建插件目录后，在此追加文件夹名即可。
 */
export const BUILTIN_PLUGIN_SLUGS = [
	"virtual-tryon",
	"dress-up-tryon",
	"real-model-tryon",
	"boots-tryon",
	"scene-swap",
	"accessory-tryon",
	"face-swap",
	"model-swap",
	"pose-swap",
	"clothing-color-change",
	"product-image-set",
	"one-click-product",
	"product-background-swap",
	"clothing-variation-shots",
	"product-scene-composite",
	"luxury-brand-design",
	"garment-style-design",
	"image-translation",
	"hand-foot-repair",
	"clothing-repair",
	"footwear-repair",
] as const

export type BuiltinPluginSlug = (typeof BUILTIN_PLUGIN_SLUGS)[number]
