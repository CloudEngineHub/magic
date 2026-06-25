/**
 * gradient-editorial.js
 * Gradient Editorial — ECharts chart preset library
 *
 * Design language: soft purple-blue gradients, clean white backgrounds,
 * rounded elements, purple accent color (#6C63FF).
 * Suited for AI/tech insight articles, product shares.
 *
 * Usage (in card HTML):
 *   <div class="ge-card ge-content"
 *        data-echarts-id="chart-id"
 *        data-preset="ge-bar-rank"
 *        data-preset-params="URL-encoded JSON params">
 *     ...
 *     <div id="chart-id" style="width:100%;height:200px;"></div>
 *   </div>
 *
 * Add a new preset: GEPresets.add('preset-name', function(params) { return echartsOption; })
 *
 * Exposes: window.GEPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   ge-bar-rank        Horizontal ranking bar chart (purple gradient bars)
 *   ge-line-trend      Line trend chart (purple line + soft area fill)
 *   ge-donut           Donut chart (purple + muted segments)
 *   ge-radar           Radar comparison chart (purple fill + outline)
 * ─────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────
 * gradient-editorial.css class quick-reference
 *
 * §1  Card Shell
 *   .ge-card           Base card shell (540×720)
 *   .ge-cover          Cover type (hero image bg, set via inline background-image)
 *   .ge-cover-bg       Optional inner div for background image layer
 *   .ge-content        Content type (white bg, flex column)
 *   .ge-content.gray-bg  Gray bg content variant
 *
 * §2  Cover Components
 *   .ge-brand          Top-left brand text (absolute positioned)
 *   .ge-cover-title    Large bold white title (bottom-aligned); .sm → smaller variant
 *   .ge-cover-quote    Subtitle with left border (semi-transparent)
 *   .ge-cover-tags     Tag row container
 *   .ge-cover-tag      Individual glassmorphism tag
 *   .ge-cover-meta     Meta text (author/date)
 *
 * §3  Content Components
 *   .ge-header         Top header with page number and title
 *   .ge-page-num       Purple badge page number
 *   .ge-header-title   Small gray header title
 *   .ge-section        Section heading (22px); .accented → left purple border; .sm → smaller
 *   .ge-para           Body paragraph; .sm → smaller/muted
 *   .ge-quote          Quote block (purple left border); .warm → red; .success → green
 *   .ge-quote-text     Quote inner text
 *   .ge-list           Bullet list container
 *   .ge-list-item      List item (auto purple dot)
 *   .ge-highlight-card  Rounded card; .accented → purple top; .gradient → purple gradient bg
 *   .ge-highlight-card-title  Card title
 *   .ge-highlight-card-body   Card body text
 *   .ge-step           Step container
 *   .ge-step-num       Purple circle step number
 *   .ge-step-content   Step right content
 *   .ge-step-title     Step title
 *   .ge-step-desc      Step description
 *   .ge-divider        Thin divider; .gradient → purple gradient
 *   .ge-footer         Bottom footer bar
 *   .ge-footer-left    Left muted text
 *   .ge-footer-right   Right purple text
 *   .ge-cta            CTA block (purple gradient bg, white text)
 *   .ge-cta-text       CTA main text
 *   .ge-cta-sub        CTA secondary text
 *
 * §4  Utilities
 *   .ge-text-purple / .ge-text-muted / .ge-text-dark / .ge-text-accent / .ge-text-success / .ge-text-white
 *   .ge-bg-purple / .ge-bg-warm / .ge-bg-success
 *   .ge-hl             Purple underline highlight
 *   .ge-hl-warm        Red underline highlight
 *   .ge-badge          Purple badge; .dark → dark variant
 *   .ge-tag            Gray outlined tag
 *   .ge-bold / .ge-em
 *
 * §5  Layout Helpers
 *   .ge-grid-2 / .ge-grid-3  Grid layouts
 *   .ge-row            Flex row
 *   .ge-col            Flex column
 *   .ge-spacer         Flex spacer
 *   .ge-center         Center alignment
 * ─────────────────────────────────────────────────────────────
 */
(function (global) {
    'use strict';

    /* ── Shared Tokens ── */
    var T = {
        purple: '#6C63FF',
        purpleLight: '#A78BFA',
        purpleMuted: '#C4B5FD',
        white: '#FFFFFF',
        gray1: '#F8F9FA',
        gray2: '#E9ECEF',
        gray3: '#6C757D',
        dark: '#1A1A2E',
        accent: '#FF6B6B',
        success: '#51CF66',
        fontSans: 'Noto Sans SC, PingFang SC, sans-serif'
    };

    var _presets = {};

    /* ════════════════════════════════════════
       Preset: ge-bar-rank
       Horizontal ranking bar chart with purple gradient bars
       params: {
         labels:    string[]  Item names (Y-axis)
         values:    number[]  Values
         heroIndex: number    Highlighted item (default 0)
         unit:      string    Optional unit suffix
       }
       ════════════════════════════════════════ */
    _presets['ge-bar-rank'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];
        var heroIdx = params.heroIndex != null ? params.heroIndex : 0;
        var unit = params.unit || '';

        var data = values.map(function (v, i) {
            var isHero = (i === heroIdx);
            return {
                value: v,
                itemStyle: {
                    color: isHero
                        ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: T.purple }, { offset: 1, color: T.purpleLight }] }
                        : '#E9ECEF',
                    borderRadius: [0, 4, 4, 0]
                },
                label: {
                    show: true,
                    position: 'right',
                    fontFamily: T.fontSans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: isHero ? T.purple : T.gray3,
                    formatter: '{c}' + unit
                }
            };
        });

        return {
            backgroundColor: 'transparent',
            grid: { top: 8, right: 60, bottom: 8, left: 8, containLabel: true },
            xAxis: {
                type: 'value',
                axisLabel: { show: false },
                axisLine: { show: false },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'category',
                data: labels,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    fontFamily: T.fontSans,
                    fontSize: 12,
                    color: T.dark
                }
            },
            series: [{
                type: 'bar',
                data: data,
                barWidth: 20,
                itemStyle: { borderRadius: [0, 4, 4, 0] }
            }]
        };
    };

    /* ════════════════════════════════════════
       Preset: ge-line-trend
       Line trend with purple line and soft purple area fill
       params: {
         labels:  string[]   X-axis labels
         values:  number[]   Y-axis values
         title:   string     Optional legend name
       }
       ════════════════════════════════════════ */
    _presets['ge-line-trend'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];
        var title = params.title || '';

        return {
            backgroundColor: 'transparent',
            grid: { top: 24, right: 16, bottom: 24, left: 16, containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: { lineStyle: { color: T.gray2 } },
                axisTick: { show: false },
                axisLabel: { fontFamily: T.fontSans, fontSize: 10, color: T.gray3 }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: T.gray2, type: 'dashed' } },
                axisLabel: { fontFamily: T.fontSans, fontSize: 10, color: T.gray3 }
            },
            series: [{
                name: title,
                type: 'line',
                data: values,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { color: T.purple, width: 2.5 },
                itemStyle: { color: T.purple, borderColor: '#fff', borderWidth: 2 },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(108, 99, 255, 0.25)' },
                            { offset: 1, color: 'rgba(108, 99, 255, 0.02)' }
                        ]
                    }
                }
            }]
        };
    };

    /* ════════════════════════════════════════
       Preset: ge-donut
       Donut chart with purple main segment
       params: {
         segments: [{name, value, color?}]  Segment data
         centerText: string  Center label text
       }
       ════════════════════════════════════════ */
    _presets['ge-donut'] = function (params) {
        var segments = params.segments || [];
        var centerText = params.centerText || '';
        var colors = [T.purple, T.purpleLight, T.purpleMuted, T.gray2, '#FFD93D', T.accent];

        var data = segments.map(function (s, i) {
            return {
                name: s.name,
                value: s.value,
                itemStyle: { color: s.color || colors[i % colors.length] }
            };
        });

        return {
            backgroundColor: 'transparent',
            graphic: centerText ? [{
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                    text: centerText,
                    fontSize: 18,
                    fontWeight: 'bold',
                    fontFamily: T.fontSans,
                    fill: T.dark,
                    textAlign: 'center'
                }
            }] : [],
            series: [{
                type: 'pie',
                radius: ['55%', '78%'],
                center: ['50%', '50%'],
                data: data,
                label: {
                    show: true,
                    fontSize: 11,
                    fontFamily: T.fontSans,
                    color: T.gray3
                },
                labelLine: { lineStyle: { color: T.gray2 } },
                itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 }
            }]
        };
    };

    /* ════════════════════════════════════════
       Preset: ge-radar
       Radar chart with purple fill
       params: {
         indicators: [{name, max}]   Axes
         values:     number[]         Values for each axis
         title:      string           Legend name
       }
       ════════════════════════════════════════ */
    _presets['ge-radar'] = function (params) {
        var indicators = params.indicators || [];
        var values = params.values || [];
        var title = params.title || '';

        return {
            backgroundColor: 'transparent',
            radar: {
                indicator: indicators,
                shape: 'polygon',
                axisName: { fontFamily: T.fontSans, fontSize: 11, color: T.gray3 },
                splitLine: { lineStyle: { color: T.gray2 } },
                splitArea: { areaStyle: { color: ['transparent'] } },
                axisLine: { lineStyle: { color: T.gray2 } }
            },
            series: [{
                type: 'radar',
                data: [{
                    name: title,
                    value: values,
                    lineStyle: { color: T.purple, width: 2 },
                    itemStyle: { color: T.purple },
                    areaStyle: { color: 'rgba(108, 99, 255, 0.2)' }
                }]
            }]
        };
    };

    /* ── Public API ── */
    var GEPresets = {
        get: function (name, params) {
            if (!_presets[name]) {
                console.warn('[GEPresets] Unknown preset: ' + name);
                return {};
            }
            return _presets[name](params || {});
        },
        add: function (name, fn) {
            _presets[name] = fn;
        },
        list: function () {
            return Object.keys(_presets);
        }
    };

    global.GEPresets = GEPresets;
})(window);
