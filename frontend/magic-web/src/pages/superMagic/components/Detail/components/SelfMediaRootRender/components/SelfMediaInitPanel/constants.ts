import type { SelfMediaInitData } from "./types"

export const STEPS = [
    { key: "brand", titleKey: "detail.selfMedia.initPanel.steps.brand" },
    { key: "topics", titleKey: "detail.selfMedia.initPanel.steps.topics" },
    { key: "confirm", titleKey: "detail.selfMedia.initPanel.steps.confirm" },
]

export const PLATFORM_FETCH_TIMEOUT_MS = 3 * 60 * 1000

export function createEmptyInitData(): SelfMediaInitData {
    return {
        global: {
            author: "",
            brandPosition: "",
            targetAudience: "",
            brandImages: [],
        },
        articles: [],
    }
}
