# SelfMedia UI 详细样式规范 (基于设计图提取与优化)

## 1. 色彩系统 (Color Palette)

### 1.1 背景色 (Backgrounds)

- **全局页面背景 (Page Background)**: 偏白色的中性浅灰，近似 `#F8F8F9`。带有轻微的径向渐变光晕，增加空间感。
- **浅色卡片背景 (Light Card)**: 纯白 `#FFFFFF`。
- **深色卡片背景 (Dark Card)**: 极深灰/黑色 `#18181B` (zinc-900)。
- **强调色卡片背景 (Accent Card)**: 浅灰色 `#E4E4E7` (zinc-200) (用于 OpsOverview)。
- **列表项/次要背景 (Item Background)**: 浅灰白色 `#F4F4F5` (zinc-100)。

### 1.2 文本色 (Typography Colors)

- **主标题/正文 (Primary Text)**: 极深灰/黑色 `#18181B` (zinc-900)。
- **次要/辅助文本 (Secondary Text)**: 中灰色 `#71717A` (zinc-500)。
- **深色背景上的文本 (Text on Dark)**: 纯白色 `#FFFFFF`。

### 1.3 强调色与图表色 (Accents & Data Colors)

- **黄色 (Yellow)**: `#FFD637` 或 `#FFD744`。用于数据气泡等点缀。
- **珊瑚红 (Coral/Red)**: `#FF776C`。用于数据气泡、进度条警告或次要高亮。
- **深色气泡 (Dark Bubble)**: `#3F3F46` / `#18181B`。

## 2. 形状与边框 (Shapes & Borders)

- **卡片圆角 (Card Border Radius)**: 非常圆润，通常为 `24px` 到 `28px` (`rounded-[24px]` 或 `rounded-[28px]`)。
- **按钮圆角 (Button Border Radius)**: 胶囊形状，完全圆角 `9999px` (`rounded-full`)。
- **内部元素圆角 (Inner Element Radius)**: 列表项或小模块通常为 `16px` 到 `20px`。

## 3. 阴影与深度 (Shadows & Depth)

- **卡片投影 (Card Drop Shadow)**: 柔和、扩散的阴影。例如 `0 20px 60px rgba(47, 43, 36, 0.12)`。
- **卡片内发光 (Card Inner Highlight)**: 顶部边缘的白色内阴影，营造微凸的玻璃/塑料质感。例如 `inset 0 1px rgba(255, 255, 255, 0.75)`。
- **按钮投影 (Button Shadow)**: 深色按钮带有明显的投影，例如 `0 18px 34px rgba(32, 35, 45, 0.18)`。

## 4. 排版 (Typography)

- **字体族 (Font Family)**: 现代几何无衬线字体 (Geometric Sans-Serif)。
- **字重 (Font Weights)**:
    - 大标题 (Greetings/Card Titles): `800` (ExtraBold) 或 `780`，高对比度。
    - 正文/副标题: `400` (Regular) 或 `500` (Medium)。
    - 按钮文本: `700` (Bold) 或 `800`。
- **行高 (Line Height)**: 标题行高较紧凑 (`1.05` - `1.2`)，正文行高较宽松 (`1.5` - `1.75`)。

## 5. 动效与特效 (Motion & Effects)

- **气泡呼吸动效 (Bubble Breathe)**: 缓慢的上下浮动和缩放。
    ```css
    @keyframes bubble-breathe {
    	from {
    		transform: translate3d(0, 0, 0) scale(0.985);
    	}
    	to {
    		transform: translate3d(0, -7px, 0) scale(1.018);
    	}
    }
    ```
- **气泡渐变 (Bubble Gradients)**: 径向渐变，中心亮，边缘融入背景，并带有同色系的模糊发光阴影 (`box-shadow`)。
- **悬停反馈 (Hover States)**: 卡片和按钮在悬停时有轻微的上浮 (`transform: translateY(-2px)`) 和阴影加深。

## 6. 布局结构 (Layout Structure - Homepage)

- **顶部 (Header)**: 左侧问候语和副标题，右侧全局搜索和主要行动按钮（Upgrade/新建）。
- **内容区 (Main Content)**: 采用 Grid 布局。
    - **数据概览 (OpsOverview)**: 占据主要视觉焦点，使用沙色背景和彩色发光气泡。
    - **文章列表 (Article List)**: 根据最新需求，不再使用侧边紧凑列表，而是**在底部平铺为卡片网格 (Card Grid)**，按平台分组展示。
    - **AI 卡片 (AI Cards)**: 作为辅助模块，可放置在数据概览下方或旁边。
