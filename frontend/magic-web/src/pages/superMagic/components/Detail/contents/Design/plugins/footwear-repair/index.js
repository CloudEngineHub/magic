/* global MagicPluginKit, MagicPromptLocale, registerMagicCanvasPlugin */

const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const GENERATION_COUNT_GROUP_OPTIONS = GENERATION_COUNT_OPTIONS.map((count) => ({
    value: count,
    label: String(count),
}))

registerMagicCanvasPlugin({
    mount(ctx, root) {
        const t = (key, fallback) => ctx.i18n.t(key, fallback)
        const promptLocale = MagicPromptLocale.resolveLocale(ctx)

        return MagicPluginKit.mount(ctx, root, {
            panelClassName: "footwear-repair",
            initialState: {
                sourceImage: null,
                referenceProductImage: null,
                genCount: 1,
            },
            modelConfig: {
                autoLoad: true,
                defaultModelId: "gemini-3-pro-image-preview",
                showLoadErrors: true,
                noModelsMessage: t("error.noModels", "暂无可用 AI 模型"),
            },
            sections: [
                {
                    id: "sourceImage",
                    kind: "image-slot",
                    stateKey: "sourceImage",
                    title: t("section.sourceImage", "待修复图"),
                    uploadLabel: t("upload.sourceImage", "点击上传待修复图"),
                    alt: t("section.sourceImage", "待修复图"),
                    help: t(
                        "upload.sourceImage.help",
                        "上传需要修复鞋靴的模特图，AI 会在保留人物与场景的前提下修正鞋靴细节。",
                    ),
                },
                {
                    id: "referenceProductImage",
                    kind: "image-slot",
                    stateKey: "referenceProductImage",
                    title: t("section.referenceProductImage", "参考商品图"),
                    uploadLabel: t("upload.referenceProductImage", "点击上传参考商品图"),
                    alt: t("section.referenceProductImage", "参考商品图"),
                    help: t(
                        "upload.referenceProductImage.help",
                        "支持上传单张平铺图、独立展示图或模特穿着图，作为鞋靴款式或细节修复参考。",
                    ),
                },
                {
                    id: "modelSelect",
                    kind: "model-select",
                    title: t("section.modelSelect", "AI 模型"),
                },
                {
                    id: "resolution",
                    kind: "resolution-select",
                    title: t("section.resolution", "分辨率"),
                    deps: ["modelId", "modelOptions"],
                },
                {
                    id: "count",
                    kind: "option-group",
                    stateKey: "genCount",
                    title: t("section.count", "生成张数"),
                    options: GENERATION_COUNT_GROUP_OPTIONS,
                },
            ],
            generate: {
                buttonLabel: `✨ ${t("button.generate", "生成鞋靴修复图")}`,
                loadingLabel: t("button.generating", "生成中…"),
                getIdleHint: ({ state }) => {
                    if (!state.sourceImage) {
                        return t("empty.sourceImage", "请先上传 1 张待修复图")
                    }
                    if (!state.referenceProductImage) {
                        return t("empty.referenceProductImage", "请先上传 1 张参考商品图")
                    }
                    return ""
                },
                isDisabled: ({ state }) => !state.sourceImage || !state.referenceProductImage,
                validate: ({ state, helpers }) => {
                    if (!state.sourceImage) {
                        return t("empty.sourceImage", "请先上传 1 张待修复图")
                    }
                    if (!state.referenceProductImage) {
                        return t("empty.referenceProductImage", "请先上传 1 张参考商品图")
                    }
                    if (!state.modelId) {
                        return t("error.noModels", "暂无可用 AI 模型")
                    }
                    if (
                        helpers.collectReferenceIds([
                            state.sourceImage,
                            state.referenceProductImage,
                        ]).length !== 2
                    ) {
                        return t("error.references", "图片缺少可用于生成的资源标识")
                    }
                    const selectedSize = helpers.getSelectedSize(state)
                    if (!selectedSize?.genW || !selectedSize?.genH) {
                        return t("error.noSize", "当前模型缺少可用尺寸配置")
                    }
                    return null
                },
                buildRequest: ({ state, helpers }) => {
                    const selectedSize = helpers.getSelectedSize(state)
                    return buildFootwearRepairRequest({
                        state,
                        helpers,
                        locale: promptLocale,
                        selectedSize,
                    })
                },
                onSuccess: ({ ctx }) => {
                    ctx.ui.toast(t("toast.success", "鞋靴修复图生成成功！"), "success")
                    ctx.ui.close?.()
                },
            },
        })
    },
})

function buildFootwearRepairRequest({ state, helpers, locale, selectedSize }) {
    const width = selectedSize.genW
    const height = selectedSize.genH

    return {
        model_id: state.modelId,
        prompt: buildFootwearRepairPrompt({ locale }),
        reference_images: helpers.collectReferenceIds([
            state.sourceImage,
            state.referenceProductImage,
        ]),
        size: `${width}x${height}`,
        resolution: state.scale || undefined,
        width,
        height,
        count: state.genCount,
        select: false,
    }
}

function buildFootwearRepairPrompt({ locale }) {
    if (MagicPromptLocale.isChinese(locale)) {
        return (
            "读取参考图 1 作为待修复图，读取参考图 2 作为参考商品图。" +
            "请在保持参考图 1 中人物身份、姿势、构图、场景、背景和整体穿搭关系不变的前提下，重点修复人物脚部区域的鞋靴细节。" +
            "修复应以参考图 2 中的鞋靴款式为准，修正待修复图中鞋靴的款式轮廓、鞋型结构、材质纹理、鞋面细节、鞋底、鞋跟、鞋带、金属配件与整体上脚效果，使其与参考商品图更一致、真实、自然。" +
            "修复时须保持脚部与踝部的解剖结构合理、穿着关系自然、透视与比例正确，不要改变服装款式或场景设定，不要新增无关元素。" +
            "如待修复图中鞋靴信息不完整或局部质量较差，优先生成解剖结构正确、商业可用且与参考商品图高度一致的修复结果。"
        )
    }

    return (
        "Read reference image 1 as the image to repair and reference image 2 as the reference product image. " +
        "Preserve the person identity, pose, framing, scene, background, and overall outfit relationship from reference image 1 while focusing on repairing the footwear details on the model's feet. " +
        "Use reference image 2 as the footwear reference to correct the shoe/boot style silhouette, shape structure, material texture, upper details, sole, heel, laces, hardware, and overall on-foot appearance so the result aligns more faithfully with the product reference. " +
        "Ensure the feet and ankles are anatomically correct, the wearing relationship is natural, and perspective and proportions are accurate. Do not change the outfit style or scene, and do not add unrelated elements. " +
        "If footwear information in the repair image is incomplete or low quality, prioritize a commercially usable result that is anatomically correct and closely matches the reference product image."
    )
}