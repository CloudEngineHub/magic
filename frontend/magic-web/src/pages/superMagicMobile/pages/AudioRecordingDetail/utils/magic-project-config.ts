import { parseMagicProjectConfigContent } from "@/pages/superMagic/utils/magicProjectConfigParser"
import type { MagicProjectConfig } from "../types"

/** Reuses the shared safe parser so mobile detail matches desktop HTML bundle compatibility. */
export function parseMagicProjectConfig(content: string): MagicProjectConfig | null {
	return parseMagicProjectConfigContent(content) as MagicProjectConfig | null
}
