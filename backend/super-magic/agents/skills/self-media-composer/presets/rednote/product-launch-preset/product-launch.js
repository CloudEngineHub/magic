/**
 * product-launch.js
 * Product Launch ECharts preset library
 *
 * Design language: minimal white base, #E63946 accent red, black primary text, no shadows or gradients
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
 *   product-launch-bar      Vertical bar chart (single highlighted bar)
 *   product-launch-line     Line trend chart (area fill)
 *   product-launch-donut    Donut ratio chart (center number)
 *   product-launch-hbar     Horizontal bar chart (ranking/comparison)
 *   product-launch-radar    Radar chart for multi-dimensional capability comparison
 * ─────────────────────────────────────────────────────────────
 *
 * CSS quick-reference (product-launch.css)
 *
 * §1 Card Shell
 *   .pl-card            540×720 Base card container
 *   .pl-cover           Cover card variant
 *   .pl-content         Content card variant
 *
 * §2 Components
 *   .pl-topbar          Top 6px red line
 *   .pl-header          Main content container (flex-column with padding)
 *   .pl-badge           Black badge with white text (step/explanation)
 *   .pl-badge-red       Red badge with white text (core/bonus)
 *   .pl-title           Main card title (32px 900)
 *   .pl-title-xl        Large cover title (46px 900)
 *   .pl-title .pl-accent / .pl-title-xl .pl-accent   Red highlight
 *   .pl-lead            Subtitle explanation (16px muted)
 *   .pl-lead-sm         Cover subtitle (15px muted)
 *   .pl-data-card       Single metric block (flex-column center)
 *   .pl-data-card .pl-data-num    Metric number (22px 900 red)
 *   .pl-data-card .pl-data-label  Metric label (12px faint)
 *   .pl-stats-row       Three-column metric-row container
 *   .pl-stats-divider   Divider between metrics (1px 32px)
 *   .pl-img-box         Image/screenshot container (10px radius with border)
 *   .pl-img-box.is-flex Fill remaining height
 *   .pl-img-box.is-fixed Fixed height 340px
 *   .pl-list-row        Feature list row
 *   .pl-list-row.is-highlight  Highlighted row (red icon + title)
 *   .pl-cta-box         Ending interaction CTA area
 *   .pl-cta-box .pl-cta-title  CTA title
 *   .pl-cta-box .pl-cta-sub    CTA description
 *   .pl-divider         Horizontal divider
 *   .pl-note            Bottom brand bar
 *   .pl-note.no-border  No-top-border variant
 *   .pl-mascot          Cover decorative image (absolute positioned, rotated top-right)
 *
 * §3 Utilities
 *   .pl-tag / .pl-tag-accent     Tag chip
 *   .pl-text-accent/muted/faint/positive/negative/bold
 *   .pl-bg-accent/surface/surface2
 *   .pl-hl                       Red underline highlight
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
     Vertical bar chart with a specified highlighted bar
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
     Line trend chart with area fill
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
     Donut ratio chart with center number
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
     Horizontal bar chart for feature comparison/ranking
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
     Radar chart for multi-dimensional capability comparison
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
