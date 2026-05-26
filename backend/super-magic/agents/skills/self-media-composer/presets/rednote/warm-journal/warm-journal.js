/**
 * warm-journal.js
 * Warm Journal — 文艺手账/生活记录 辅助工具库
 *
 * 本模板以照片+手写排版为主，不依赖 ECharts 图表。
 * 本 JS 提供星级评分生成、布局辅助等工具函数。
 *
 * Usage:
 *   // 生成星级 HTML
 *   WarmJournalKit.stars(4, 5)
 *   // → '<span class="wj-stars"><span class="filled">⭐</span>×4 + empty×1</span>'
 *
 * Exposes: window.WarmJournalKit
 *
 * ─────────────────────────────────────────────────────────────
 * warm-journal.css class quick-reference
 *
 * Card shells:
 *   .wj-card              540×720 base
 *   .wj-card.wj-cover     封面（照片条+文字带）
 *   .wj-card.wj-dark-page 暗色电影感页
 *   .wj-card.wj-khaki-page 卡其散点页
 *   .wj-card.wj-photo-page 相框展示页
 *
 * Photo:
 *   .wj-strip             全出血横幅照片容器（flex:1）
 *   .wj-strip.wj-no-dim   不加暗角遮罩
 *   .wj-frame             白框相片（拍立得感）
 *   .wj-product-photo     散落产品图（absolute，需透明背景PNG抠图）
 *   .wj-product-photo.wj-blend  非透明图兜底（mix-blend-mode:multiply）
 *   .wj-rotate-l/r/sl/sr  旋转角度辅助
 *
 * Typography:
 *   .wj-hand              手写字体基类
 *   .wj-hand-xl/lg/md/sm  手写字号（44/34/24/18px）
 *   .wj-body-text         正文
 *   .wj-page-num          手写页码
 *   .wj-stars             星级评分容器
 *   .wj-num               序号圆圈
 *
 * Layout:
 *   .wj-text-band         封面奶油色文字条
 *   .wj-text-band .wj-sub 文字条副标题
 *   .wj-product-info      产品评价信息块
 *   .wj-product-title     产品标题
 *   .wj-rating-row        评分行（.label + .wj-stars）
 *   .wj-product-scene     适配场景
 *   .wj-product-exp       使用体验
 *   .wj-overlay-text      暗页叠加文字区
 *   .wj-scatter-header    卡其页标题区（含 .wj-intro）
 *   .wj-scatter-item      散点定位容器（absolute）
 *   .wj-frame-caption     相框下方说明
 *   .wj-brand-bar         底部品牌条
 *   .wj-dark-heading      暗页标题定位容器
 *
 * Utilities:
 *   .wj-abs/.wj-rel       定位
 *   .wj-z1/.wj-z5         层级
 *   .wj-flex/.wj-flex-col 弹性布局
 *   .wj-flex-1            flex:1
 *   .wj-gap-4/8/12/16     间距
 *   .wj-w-full            宽度100%
 *   .wj-color-light/muted 文字颜色
 */
(function (global) {
    'use strict';

    var Kit = {};

    /**
     * 生成星级评分 HTML
     * @param {number} filled - 实心星数量
     * @param {number} total  - 总星数（默认5）
     * @returns {string} HTML string
     */
    Kit.stars = function (filled, total) {
        total = total || 5;
        var html = '<span class="wj-stars">';
        for (var i = 0; i < total; i++) {
            if (i < filled) {
                html += '<span class="filled">⭐</span>';
            } else {
                html += '<span class="empty">☆</span>';
            }
        }
        html += '</span>';
        return html;
    };

    /**
     * 生成序号圆圈 HTML
     * @param {number|string} n - 序号
     * @returns {string} HTML string
     */
    Kit.num = function (n) {
        return '<span class="wj-num">' + n + '</span>';
    };

    /**
     * 生成评分行 HTML
     * @param {string} label - 标签文字
     * @param {number} score - 星数
     * @param {number} total - 总星数
     * @returns {string} HTML string
     */
    Kit.ratingRow = function (label, score, total) {
        return '<div class="wj-rating-row"><span class="label">' + label + '：</span>' + Kit.stars(score, total) + '</div>';
    };

    global.WarmJournalKit = Kit;

})(typeof window !== 'undefined' ? window : this);
