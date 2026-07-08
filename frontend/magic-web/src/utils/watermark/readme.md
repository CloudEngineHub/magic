## Watermark

当前水印能力统一从 `src/lib/watermark/index.ts` 导出：

```ts
import {
  WATERMARK_CONFIG,
  blendWatermarkColors,
  watermarkService,
} from '@/lib/watermark'
```

### 生成配置

水印由 **文字底衬（背景）+ 文字颜色** 两层组成，Canvas 先画圆角底衬，再叠文字。

| 字段 | 说明 |
|------|------|
| `backgroundColor` | 文字底衬颜色 |
| `textColor` | 文字颜色 |
| `useBackground` | **默认开启**。不传或传 `true` 均画底衬；**仅**显式 `useBackground: false` 时关闭 |
| `patchPaddingX` / `patchPaddingY` | 底衬相对文字的 padding |
| `patchRadius` | 底衬圆角 |

默认见 `WATERMARK_CONFIG`。窄屏（宽度 ≤ `768px`）挂载时会合并 `WATERMARK_MOBILE_CONFIG`（更密间距、更小字号），挂载时判定一次，不监听 resize。

### mount

把水印挂到指定容器上。默认水印标识是 `magic-watermark`，也可以传 `id` 自定义。

```ts
// 最简：底衬默认开启，无需传 useBackground
watermarkService.mount({
  container: document.body,
  text: 'user_zhangsan_10086',
})

// 完整配置
watermarkService.mount({
  container: document.body,
  text: 'user_zhangsan_10086',
  id: 'magic-watermark',
  config: {
    textColor: 'rgba(0, 0, 0, 0.02)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    rotate: -12,
    gapX: 60,
    gapY: 140,
  },
  onTamper: (info) => {
    console.log('watermark tampered', info)
  },
})

// 仅当不要底衬时显式关闭
watermarkService.mount({
  container: document.body,
  text: 'user_zhangsan_10086',
  config: { useBackground: false },
})

// 窄屏也使用桌面间距
watermarkService.mount({
  container: document.body,
  text: 'user_zhangsan_10086',
  config: { denseOnMobile: false },
})

watermarkService.updateText('new_text')
watermarkService.destroy()
```

`mount()` 会插入一个重复背景水印，并监听水印节点被删除或 `style/class` 被篡改；发现后会自动重建。

### 解析配置

推荐模式：**配置通道提取**（`reverse-layer`）。按生成时的 RGB 方向在截图里找水印，**不依赖透明度 α**。

解析需传入与生成一致的颜色：

| 字段 | 对应生成 | 作用 |
|------|---------|------|
| `backgroundColor` | 底衬 | 检测底衬区域（如白底衬 → 局部变亮） |
| `textColor` | 文字 | 检测笔画（如黑字 → 局部变暗） |
| `overlayColor` | 合成色 | 检测「字压在底衬上」的区域；默认由 `blendWatermarkColors(textColor, backgroundColor)` 算出，可手调 |
| `useBackground` | 底衬开关 | 默认开启；仅 `false` 时不走底衬通道 |

三路对每个像素各算一条通道残差，**取最大值** 合并。

```ts
import { blendWatermarkColors } from '@/lib/watermark'

const textColor = 'rgba(0, 0, 0, 0.02)'
const backgroundColor = 'rgba(255, 255, 255, 0.03)'

await watermarkService.extractContrastViewByMode(file, 'reverse-layer', {
  textColor,
  backgroundColor,
  overlayColor: blendWatermarkColors(textColor, backgroundColor),
})
```

灵敏度可调 `WATERMARK_EXTRACT_CONFIG` 或传入同名覆盖字段：

| 参数 | 说明 |
|------|------|
| `gain` | 通道增益，宜 1～6 |
| `bgRadius` | 局部背景估计半径（px） |
| `noisePercentile` | 噪声底分位，越低越显淡纹 |
| `signalGamma` | 弱信号提升，<1 抬高淡纹 |

### extractContrastViews

从图片里提取水印增强视图。支持 `File`、`Blob`、`data:image/...base64` 和纯 base64 字符串。

```ts
const result = await watermarkService.extractContrastViews(file, {
  textColor: WATERMARK_CONFIG.textColor,
  backgroundColor: WATERMARK_CONFIG.backgroundColor,
})

console.log(result.views)
```

当前会输出四类视图：配置通道提取、局部差分、暗纹增强、亮纹增强。

### Debug 注意事项

- 先确认水印节点在 DOM 里：搜索 `data-wm-id="magic-watermark"`。
- 看不到水印时，先临时把 `textColor` / `backgroundColor` 透明度调高，比如 `0.1`。
- 截图解析失败时，先确认截图里真的包含水印区域。
- 解析颜色须与生成一致；叠加色一般保持默认合成值即可。
- 白底上的暗色水印可试「暗纹增强」；黑底上的亮色水印可试「亮纹增强」；背景复杂时可对照「局部差分」。

### 注意事项

- 这些 API 依赖浏览器 DOM、Canvas、ImageBitmap，因此只能在 client component 或浏览器环境中使用。
- 某些 iPhone 下透明度小于 `0.015` 的 canvas 可能无法显示，当前默认透明度已避开这个区间。
- 相关问题参考：https://github.com/zhensherlock/watermark-js-plus/issues/898#issuecomment-2351301350
