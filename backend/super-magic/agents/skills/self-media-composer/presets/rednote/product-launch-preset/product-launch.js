/**
 * product-launch.js
 * Product Launch ECharts preset library
 *
 * Design language: 白底极简，#E63946 强调红，黑色主文字，无阴影无渐变
 *
 * Usage (in card HTML):
 *   <div id="chart-id" style="width:100%;height:200px;"></div>
 *   <script>
 *     var el = document.getElementById('chart-id');
 *     var option = ProductLaunchPresets.get('product-launch-bar', {
 *       categories: ['A','B','C'],
 *       values: [120, 200, 150],
 *       highlightIndex: 1
 *     });
 *     echarts.init(el).setOption(option);
 *   </script>
 *
 * Exposes: window.ProductLaunchPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   product-launch-bar      竖向柱状图（高亮单根柱）
 *   product-launch-line     折线趋势图（面积填充）
 *   product-launch-donut    环形比例图（中心数字）
 *   product-launch-hbar     横向条形图（排名/对比）
 *   product-launch-radar    雷达图（多维能力对比）
 * ─────────────────────────────────────────────────────────────
 *
 * CSS quick-reference (product-launch.css)
 *
 * §1 Card Shell
 *   .pl-card            540×720 基础卡片容器
 *   .pl-cover           封面卡变体
 *   .pl-content         内容卡变体
 *
 * §2 Components
 *   .pl-topbar          顶部 6px 红线
 *   .pl-header          主内容区容器（flex-col，含内边距）
 *   .pl-badge           黑底白字 badge（步骤/说明）
 *   .pl-badge-red       红底白字 badge（核心/彩蛋）
 *   .pl-title           卡片主标题（32px 900）
 *   .pl-title-xl        封面大标题（46px 900）
 *   .pl-title .pl-accent / .pl-title-xl .pl-accent   红色高亮
 *   .pl-lead            副标题说明（16px muted）
 *   .pl-lead-sm         封面副标题（15px muted）
 *   .pl-data-card       单个指标块（flex-col center）
 *   .pl-data-card .pl-data-num    指标数字（22px 900 红）
 *   .pl-data-card .pl-data-label  指标标签（12px faint）
 *   .pl-stats-row       三列指标横排容器
 *   .pl-stats-divider   指标间分割线（1px 32px）
 *   .pl-img-box         图片/截图容器（圆角10px 边框）
 *   .pl-img-box.is-flex 撑满剩余高度
 *   .pl-img-box.is-fixed 固定高度 340px
 *   .pl-list-row        功能列表行
 *   .pl-list-row.is-highlight  高亮行（红色 icon + 标题）
 *   .pl-cta-box         结尾互动引导区
 *   .pl-cta-box .pl-cta-title  引导标题
 *   .pl-cta-box .pl-cta-sub    引导说明
 *   .pl-divider         水平分割线
 *   .pl-note            底部品牌栏
 *   .pl-note.no-border  无上边框版本
 *   .pl-mascot          封面装饰图（绝对定位，右上角旋转）
 *
 * §3 Utilities
 *   .pl-tag / .pl-tag-accent     标签芯片
 *   .pl-text-accent/muted/faint/positive/negative/bold
 *   .pl-bg-accent/surface/surface2
 *   .pl-hl                       红色下划线高亮
 *
 * §4 Layout
 *   .pl-row/col/spacer/center
 *   .pl-gap-xs/sm/md/lg
 *   .pl-px-card / .pl-pt-card / .pl-pb-card / .pl-p-card
 */
(function (global) {
  'use strict';

  /* ── Design Tokens ── */
  var T = {
    bg:        '#FFFFFF',
    surface:   '#F5F5F7',
    surface2:  '#EBEBEB',
    accent:    '#E63946',
    accentL:   '#FF6B74',
    text:      '#111111',
    muted:     '#666666',
    faint:     '#999999',
    border:    '#EBEBEB',
    positive:  '#2DC653',
    negative:  '#E63946',
    fontDisplay: "'Noto Sans SC', sans-serif",
    fontBody:    "'Noto Sans SC', sans-serif"
  };

  var _presets = {};

  function add(name, fn) { _presets[name] = fn; }
  function get(name, params) {
    if (!_presets[name]) {
      console.warn('[ProductLaunchPresets] unknown preset:', name);
      return {};
    }
    return _presets[name](params || {});
  }

  /* ════════════════════════════════════════
     Preset: product-launch-bar
     竖向柱状图，高亮指定柱
     params: { categories, values, highlightIndex, title, unit }
     ════════════════════════════════════════ */
  add('product-launch-bar', function (p) {
    var cats  = p.categories || [];
    var vals  = p.values     || [];
    var hiIdx = p.highlightIndex != null ? p.highlightIndex : 0;
    var unit  = p.unit || '';
    return {
      backgroundColor: 'transparent',
      title: p.title ? {
        text: p.title,
        textStyle: { fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.text },
        top: 4, left: 0
      } : undefined,
      grid: { top: p.title ? 36 : 16, right: 8, bottom: 20, left: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: cats,
        axisLabel: { fontFamily: T.fontBody, fontSize: 11, color: T.muted },
        axisLine: { lineStyle: { color: T.border } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontFamily: T.fontBody, fontSize: 10, color: T.muted },
        splitLine: { lineStyle: { color: T.border, type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        barMaxWidth: 48,
        data: vals.map(function (v, i) {
          return {
            value: v,
            itemStyle: {
              color: i === hiIdx ? T.accent : T.surface2,
              borderRadius: [3, 3, 0, 0]
            }
          };
        }),
        label: {
          show: true,
          position: 'top',
          fontFamily: T.fontBody,
          fontSize: 11,
          fontWeight: 700,
          color: T.text,
          formatter: function (params) { return params.value + unit; }
        }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: product-launch-line
     折线趋势图，面积填充
     params: { xData, yData, smooth, areaOpacity, title, unit }
     ════════════════════════════════════════ */
  add('product-launch-line', function (p) {
    var smooth = p.smooth != null ? p.smooth : true;
    var alpha  = p.areaOpacity != null ? p.areaOpacity : 0.12;
    var unit   = p.unit || '';
    return {
      backgroundColor: 'transparent',
      title: p.title ? {
        text: p.title,
        textStyle: { fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.text },
        top: 4, left: 0
      } : undefined,
      grid: { top: p.title ? 36 : 16, right: 12, bottom: 20, left: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: p.xData || [],
        axisLabel: { fontFamily: T.fontBody, fontSize: 11, color: T.muted },
        axisLine: { lineStyle: { color: T.border } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontFamily: T.fontBody, fontSize: 10, color: T.muted },
        splitLine: { lineStyle: { color: T.border, type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'line',
        smooth: smooth,
        data: p.yData || [],
        lineStyle: { color: T.accent, width: 2.5 },
        itemStyle: { color: T.accent },
        symbol: 'circle',
        symbolSize: 6,
        label: {
          show: true,
          position: 'top',
          fontFamily: T.fontBody,
          fontSize: 10,
          color: T.muted,
          formatter: function (params) { return params.value + unit; }
        },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(230,57,70,' + alpha + ')' },
              { offset: 1, color: 'rgba(230,57,70,0)' }
            ]
          }
        }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: product-launch-donut
     环形比例图，中心显示数字
     params: { value, total, label, unit, centerLabel }
     ════════════════════════════════════════ */
  add('product-launch-donut', function (p) {
    var value  = p.value || 0;
    var total  = p.total || 100;
    var rest   = Math.max(0, total - value);
    var unit   = p.unit || '%';
    var center = p.centerLabel || (value + unit);
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['50%', '50%'],
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: value, name: p.label || '',
            itemStyle: { color: T.accent } },
          { value: rest, name: '',
            itemStyle: { color: T.surface2 } }
        ]
      }],
      graphic: [{
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: center,
          font: '900 28px ' + T.fontDisplay,
          fill: T.text,
          textAlign: 'center'
        }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: product-launch-hbar
     横向条形图（功能对比/排名）
     params: { categories, values, highlightIndex, title, unit }
     ════════════════════════════════════════ */
  add('product-launch-hbar', function (p) {
    var cats  = (p.categories || []).slice().reverse();
    var vals  = (p.values     || []).slice().reverse();
    var hiIdx = p.categories ? (p.categories.length - 1 - (p.highlightIndex != null ? p.highlightIndex : 0)) : 0;
    var unit  = p.unit || '';
    return {
      backgroundColor: 'transparent',
      title: p.title ? {
        text: p.title,
        textStyle: { fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.text },
        top: 4, left: 0
      } : undefined,
      grid: { top: p.title ? 36 : 8, right: 48, bottom: 8, left: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'category',
        data: cats,
        axisLabel: { fontFamily: T.fontBody, fontSize: 12, color: T.text },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        barMaxWidth: 20,
        data: vals.map(function (v, i) {
          return {
            value: v,
            itemStyle: {
              color: i === hiIdx ? T.accent : T.surface2,
              borderRadius: [0, 3, 3, 0]
            }
          };
        }),
        label: {
          show: true,
          position: 'right',
          fontFamily: T.fontBody,
          fontSize: 11,
          fontWeight: 700,
          color: T.text,
          formatter: function (params) { return params.value + unit; }
        }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: product-launch-radar
     雷达图（多维能力对比）
     params: { indicators, values, title }
     indicators: [{ name, max }]
     values: number[]
     ════════════════════════════════════════ */
  add('product-launch-radar', function (p) {
    var indicators = p.indicators || [];
    var vals       = p.values     || [];
    return {
      backgroundColor: 'transparent',
      title: p.title ? {
        text: p.title,
        textStyle: { fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.text },
        top: 4, left: 0
      } : undefined,
      radar: {
        indicator: indicators,
        center: ['50%', '55%'],
        radius: '60%',
        axisName: { fontFamily: T.fontBody, fontSize: 11, color: T.muted },
        splitLine: { lineStyle: { color: T.border } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: T.border } }
      },
      series: [{
        type: 'radar',
        data: [{
          value: vals,
          areaStyle: { color: 'rgba(230,57,70,0.12)' },
          lineStyle: { color: T.accent, width: 2 },
          itemStyle: { color: T.accent }
        }]
      }]
    };
  });

  /* ── Export ── */
  global['ProductLaunchPresets'] = { add: add, get: get };

}(window));
