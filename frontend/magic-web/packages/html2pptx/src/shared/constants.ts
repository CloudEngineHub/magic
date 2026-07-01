/** 像素转点数的比例 (1px = 0.75pt) */
export const PX_TO_PT_RATIO = 0.75
/** 默认 DPI */
export const DEFAULT_DPI = 96
/** 文本框水平安全边距 (px) */
export const TEXT_SAFETY_MARGIN_X = 4
/** 文本框垂直安全边距 (px) */
export const TEXT_SAFETY_MARGIN_Y = 2

/** 判断单行文本的行高阈值 (倍数) */
export const LINE_HEIGHT_THRESHOLD = 1.5

/** 判断是否需要换行的阈值 (倍数) */
export const WRAP_THRESHOLD = 1.15

// 渲染阶段时间参数（毫秒）：
// - RENDER_TIMEOUT_MS: 整体渲染硬超时上限
// - READY_STATE_FALLBACK_MS: readyState 长时间不 complete 时的兜底等待时长
// - READY_STATE_POLL_MS: 轮询 document 就绪状态的间隔
// - NATIVE_LOAD_WAIT_MS: 等待原生 load 事件收敛的窗口
// - EXTERNAL_RESOURCE_TIMEOUT_MS: 等待外链 script/style 收敛的窗口
// 如需调优，建议优先调整 fallback 与整体超时，再微调轮询参数。
export const RENDER_TIMEOUT_MS = 30000
export const READY_STATE_FALLBACK_MS = 6000
export const READY_STATE_POLL_MS = 50
export const NATIVE_LOAD_WAIT_MS = 1500
export const EXTERNAL_RESOURCE_TIMEOUT_MS = 30000
/** 外链 script/style 收敛后判定空闲的窗口 */
export const DEFAULT_EXTERNAL_RESOURCE_IDLE_MS = 500
/** 单个静态资源（script/style/img/video）的加载超时时长 */
export const RESOURCE_LOAD_TIMEOUT_MS = 50000
/** 单个静态资源加载超时后的最大重试次数，超过则跳过该资源 */
export const RESOURCE_MAX_RETRIES = 3
/** 含 canvas 的页面额外等待绘制完成的时长 */
export const CANVAS_DELAY_MS = 2000

/** 图片绝对像素上限：再大对 PPT/HTML 视觉无可见收益，但内存爆炸 */
export const IMAGE_ABSOLUTE_MAX_DIMENSION = 2560
/** 低内存设备（≤4GB）图片像素上限 */
export const IMAGE_LOW_MEM_MAX_DIMENSION = 1024

/** 伪元素图标渲染的超采样倍数，提升清晰度 */
export const ICON_SCALE_FACTOR = 4

/** 页面切片时的浮点容差，避免边界值误判多出一页 */
export const SLICE_EPSILON = 1e-6

