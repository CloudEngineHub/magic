/**
 * neo-brutalism.js
 * Neo-Brutalism ECharts chart preset library
 *
 * Responsibility: Provide ECharts chart presets matching the Neo-Brutalism visual style,
 *                 referenced by card HTML via the data-preset attribute.
 *
 * Usage (in card HTML):
 *   <div class="xhs-card is-content"
 *        data-echarts-id="chart-id"
 *        data-preset="monthly-cost-bar"
 *        data-preset-params="URL-encoded JSON params">
 *     ...
 *     <div id="chart-id" style="width:100%;height:185px;"></div>
 *   </div>
 *
 * Add a new preset: NBPresets.add('preset-name', function(params) { return echartsOption; })
 *
 * Exposes: window.NBPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *
 *  Neo-Brutalism presets (light, high-contrast)
 *   monthly-cost-bar       Monthly cost bar chart (black actual + yellow forecast, with annotations)
 *   rank-bar-horizontal    Horizontal ranking bar chart (black/yellow alternating, with value labels)
 *   donut-ratio            Donut ratio chart (black main ring + yellow rest ring, center big text)
 *   line-trend             Line trend chart (black line + dots, with area fill)
 *
 *  Dark-Tech presets (dark background, gold accent — see dark-tech.css for component classes)
 *   dark-tech-compare-bar  Side-by-side comparison bar chart (dark bg, gold highlight bar)
 *   dark-tech-radar        Radar capability chart (dark bg, gold fill)
 *   dark-tech-line         Line trend chart (dark bg, gold line + glow area)
 * ─────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────
 * Companion style files
 *   neo-brutalism.css   Neo-Brutalism component library (light, high-contrast)
 *   dark-tech.css       Dark-Tech component library (dark bg, gold accent)
 *
 * neo-brutalism.css class quick-reference
 *
 * §1  Card Shell
 *   .xhs-card            Base card shell (540×720)
 *   .is-cover            Cover type (ruled-paper background)
 *   .is-content          Content type (light gray background)
 *
 * §1.1  Cover components
 *   .xhs-memo-cover      Cover main container
 *   .xhs-memo-body       Cover text area
 *   .q-line              Big headline question line (76px)
 *   .ans-line            Subtitle answer line (26px)
 *   .hl / .hl-g / .hl-r  Yellow / green / red underline highlight
 *   .rule                Horizontal rule divider
 *   .slogan-xhs          Bottom slogan container
 *   .slogan-inner-xhs    Slogan two-color block container
 *   .xhs-s-token         Slogan left block (yellow bg, black text)
 *   .xhs-s-bill          Slogan right block (red bg, white text)
 *   .xhs-author          Bottom-right author byline
 *
 * §2  Content Components
 *   .header-area         Header area container
 *   .page-tag            Page tag (red bg, white text)
 *   .page-tag-dark       Page tag variant (black bg, yellow text)
 *   .page-tag-yellow     Page tag variant (yellow bg, black text)
 *   .main-title          Main title (38px)
 *   .main-title-xl       Main title variant (46px)
 *   .main-title-sm       Main title variant (30px)
 *   .body-area           Body flex column container
 *
 *   .data-card           Data card (white bg, black border)
 *   .data-card.highlight Highlight card (heavy shadow)
 *   .data-card.danger    Danger card (red border)
 *   .data-card.success   Success card (green border)
 *   .dc-title            Card title
 *   .dc-value            Large number (52px)
 *   .dc-value.red/green/blue/amber  Number color variants
 *   .dc-sub              Card sub-text
 *
 *   .rank-row            Rank list row
 *   .rank-row.top1       TOP1 highlight row (yellow bg)
 *   .rank-row.compact    Compact row
 *   .rank-num            Rank number
 *   .rank-info           Info area
 *   .rank-name           Name
 *   .rank-desc           Description
 *   .rank-val            Right-side value
 *
 *   .bar-row             Bar chart container
 *   .bar-info            Bar chart header row
 *   .bar-name / .bar-val Bar name / value
 *   .bar-track           Progress track background
 *   .bar-fill            Progress fill (.yellow/.red/.green/.blue)
 *
 *   .footer-bubble       Bottom speech bubble
 *   .footer-bubble.dark  Bubble variant (black bg, red shadow)
 *   .footer-bubble.yellow Bubble variant (yellow bg)
 *   .bubble-text         Bubble main text
 *   .bubble-tag          Bubble hashtag line
 *
 *   .nb-img-block        Image block (bordered with shadow)
 *   .nb-img-caption      Image caption bar (.yellow/.red variants)
 *
 * §3  Utility Classes (nb-*)
 *   .nb-badge            Role badge next to a name
 *   .nb-tag              Tag (white bg, black text)
 *   .nb-tag-yellow       Tag (yellow bg, black text)
 *   .nb-tag-red          Tag (red tint, red text)
 *   .nb-tag-dark         Tag (black bg, yellow text)
 *   .nb-tag-green        Tag (green bg, white text)
 *   .nb-tag-blue         Tag (blue bg, white text)
 *
 *   .nb-inline           Inline highlight (black bg, white text)
 *   .nb-inline-red       Inline highlight (red bg, white text)
 *   .nb-inline-yellow    Inline highlight (yellow bg, black text)
 *   .nb-inline-green     Inline highlight (green bg, white text)
 *   .nb-inline-blue      Inline highlight (blue bg, white text)
 *   .nb-inline-purple    Inline highlight (purple bg, white text)
 *   .nb-inline-amber     Inline highlight (amber bg, black text)
 *
 *   .nb-card-yellow      Card variant (yellow bg)
 *   .nb-card-pink        Card variant (pink bg, red border)
 *   .nb-card-black       Card variant (black bg, yellow text)
 *   .nb-card-green       Card variant (green bg)
 *   .nb-card-blue        Card variant (blue bg)
 *   .nb-card-purple      Card variant (purple bg)
 *
 *   .text-red/yellow/green/blue/purple/gray/muted  Text colors
 *   .bg-yellow/red/green/blue/black                Inline background highlights
 *
 * §4  Layout Helpers
 *   .grid-2              Two-column equal-width grid
 *   .grid-3              Three-column equal-width grid
 *   .grid-3-2            Two-column 3:2 ratio grid
 *   .nb-divider          Horizontal divider (.dashed variant)
 *   .nb-step-num         Step number circle (.red/.yellow/.green)
 *   .nb-stat             Stat number + unit container
 *   .nb-stat-num         Large stat number (48px)
 *   .nb-stat-unit        Stat unit text
 *   .nb-stat-label       Stat label text
 * ─────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  var _presets = {};

  // ─────────────────────────────────────────
  // Monthly cost bar chart (actual vs forecast, with holiday annotations)
  // params: {
  //   labels:      string[]   X-axis month labels, e.g. ["Dec","Jan",...]
  //   values:      number[]   Monthly values (in wan, i.e. 10,000 units)
  //   isActual:    boolean[]  Whether each month is actual (true=black bar, false=yellow bar)
  //   markPoints:  [{xLabel, y, text}]  Holiday / special annotations
  // }
  // ─────────────────────────────────────────
  _presets['monthly-cost-bar'] = function (params) {
    var labels = params.labels || [];
    var values = params.values || [];
    var isActual = params.isActual || [];
    var marks = params.markPoints || [];

    var seriesData = values.map(function (v, i) {
      return {
        value: v,
        itemStyle: isActual[i]
          ? { color: '#111', borderColor: '#111', borderWidth: 1 }
          : { color: '#FFE566', borderColor: '#111', borderWidth: 1 }
      };
    });

    var markData = marks.map(function (m) {
      return {
        coord: [m.xLabel, m.y],
        label: {
          show: true, formatter: m.text,
          fontSize: 9, color: '#F59E0B', fontWeight: 'bold',
          position: 'top', offset: [0, -15]
        }
      };
    });

    return {
      grid: { left: 0, right: 0, top: 28, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          var p = params[0];
          return p.name + ' ' + (isActual[p.dataIndex] ? 'Actual' : 'Forecast') + ': ¥' + p.value + 'w';
        }
      },
      legend: {
        data: [
          { name: 'Actual', icon: 'rect', itemStyle: { color: '#111' } },
          { name: 'Forecast', icon: 'rect', itemStyle: { color: '#FFE566', borderColor: '#111', borderWidth: 1 } }
        ],
        right: 0, top: 0,
        textStyle: { fontSize: 10, fontWeight: 'bold', color: '#555' },
        itemWidth: 12, itemHeight: 8
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 9, color: '#555', interval: 0 },
        axisLine: { lineStyle: { color: '#111' } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value', min: 0,
        axisLabel: { fontSize: 9, color: '#999', formatter: function (v) { return v + 'w'; } },
        splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }
      },
      series: [{
        type: 'bar', barCategoryGap: '35%',
        data: seriesData,
        label: {
          show: true, position: 'top',
          fontSize: 8, fontWeight: 'bold', color: '#555',
          formatter: function (p) { return String(p.value); }
        },
        markPoint: {
          symbol: 'circle', symbolSize: 0,
          data: markData
        }
      }]
    };
  };

  // ─────────────────────────────────────────
  // Horizontal ranking bar chart
  // params: {
  //   labels:  string[]  Item names
  //   values:  number[]  Item values
  //   unit:    string    Value unit, e.g. 'w' / '%'
  //   colors:  string[]  Optional per-bar colors (default: black/yellow alternating)
  // }
  // ─────────────────────────────────────────
  _presets['rank-bar-horizontal'] = function (params) {
    var labels = (params.labels || []).slice().reverse();
    var values = (params.values || []).slice().reverse();
    var unit = params.unit || '';
    var defaultColors = ['#111', '#FFE566', '#111', '#FFE566', '#111'];
    var colors = params.colors
      ? params.colors.slice().reverse()
      : labels.map(function (_, i) { return defaultColors[i % 2]; });

    return {
      grid: { left: 0, right: 48, top: 4, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'none' },
        formatter: function (p) { return p[0].name + ': ' + p[0].value + unit; }
      },
      xAxis: {
        type: 'value',
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 11, color: '#111', fontWeight: 'bold' },
        axisLine: { lineStyle: { color: '#111', width: 2 } },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar', barCategoryGap: '30%',
        data: values.map(function (v, i) {
          var c = colors[i] || '#111';
          return {
            value: v,
            itemStyle: { color: c, borderColor: '#111', borderWidth: 2 }
          };
        }),
        label: {
          show: true, position: 'right',
          fontSize: 11, fontWeight: 'bold', color: '#111',
          formatter: function (p) { return p.value + unit; }
        }
      }]
    };
  };

  // ─────────────────────────────────────────
  // Donut ratio chart (center big text)
  // params: {
  //   value:      number    Main ratio (0~100)
  //   label:      string    Center label text
  //   centerText: string    Center display text (defaults to value%)
  //   colorMain:  string    Main color (default #111)
  //   colorRest:  string    Remainder color (default #FFE566)
  // }
  // ─────────────────────────────────────────
  _presets['donut-ratio'] = function (params) {
    var val = params.value != null ? params.value : 75;
    var label = params.label || '';
    var centerTxt = params.centerText || (val + '%');
    var colorMain = params.colorMain || '#111';
    var colorRest = params.colorRest || '#FFE566';

    return {
      graphic: [{
        type: 'text',
        left: 'center', top: 'middle',
        style: {
          text: centerTxt,
          fontSize: 32, fontWeight: 'bold',
          fill: colorMain,
          textAlign: 'center'
        }
      }],
      tooltip: { show: false },
      series: [{
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '50%'],
        startAngle: 90,
        itemStyle: { borderColor: '#111', borderWidth: 2 },
        label: { show: false },
        data: [
          { value: val, name: label, itemStyle: { color: colorMain } },
          { value: 100 - val, name: '', itemStyle: { color: colorRest } }
        ]
      }]
    };
  };

  // ─────────────────────────────────────────
  // Line trend chart (with area fill)
  // params: {
  //   labels:     string[]   X-axis labels
  //   values:     number[]   Data series
  //   unit:       string     Value unit
  //   color:      string     Line color (default #111)
  //   smooth:     boolean    Smooth curve (default false)
  //   markMax:    boolean    Annotate max value (default true)
  // }
  // ─────────────────────────────────────────
  _presets['line-trend'] = function (params) {
    var labels = params.labels || [];
    var values = params.values || [];
    var unit = params.unit || '';
    var color = params.color || '#111';
    var smooth = params.smooth != null ? params.smooth : false;
    var markMax = params.markMax != null ? params.markMax : true;

    var markData = [];
    if (markMax) {
      markData.push({ type: 'max', label: { fontSize: 10, fontWeight: 'bold', color: '#FF2442' } });
    }

    return {
      grid: { left: 0, right: 8, top: 20, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter: function (p) { return p[0].name + ': ' + p[0].value + unit; }
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 9, color: '#555', interval: 0 },
        axisLine: { lineStyle: { color: '#111', width: 2 } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 9, color: '#999',
          formatter: function (v) { return v + unit; }
        },
        splitLine: { lineStyle: { color: '#eee', type: 'dashed' } }
      },
      series: [{
        type: 'line',
        data: values,
        smooth: smooth,
        symbol: 'circle', symbolSize: 6,
        lineStyle: { color: color, width: 3 },
        itemStyle: { color: color, borderColor: '#111', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + '33' },
              { offset: 1, color: color + '05' }
            ]
          }
        },
        label: {
          show: true, position: 'top',
          fontSize: 9, fontWeight: 'bold', color: '#555',
          formatter: function (p) { return String(p.value); }
        },
        markPoint: markData.length
          ? { symbol: 'pin', symbolSize: 28, data: markData }
          : undefined
      }]
    };
  };

  // ═════════════════════════════════════════════════════════════
  // Dark-Tech preset family
  // Visual language: deep black bg (#080808), gold accent (#c8a96e),
  // thin borders, no hard shadows — inspired by DJI Pocket review cards.
  // ═════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────
  // dark-tech-compare-bar
  // Side-by-side comparison bar chart for two products.
  // params: {
  //   specs:    string[]   Spec names (Y-axis labels)
  //   valA:     number[]   Values for product A (left / muted)
  //   valB:     number[]   Values for product B (right / gold highlight)
  //   nameA:    string     Product A name (default 'A')
  //   nameB:    string     Product B name (default 'B')
  //   unit:     string     Value unit (default '')
  //   maxVal:   number     Optional fixed X-axis max
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-compare-bar'] = function (params) {
    var specs = (params.specs || []).slice().reverse();
    var valA = (params.valA || []).slice().reverse();
    var valB = (params.valB || []).slice().reverse();
    var nameA = params.nameA || 'A';
    var nameB = params.nameB || 'B';
    var unit = params.unit || '';
    var maxVal = params.maxVal || null;

    var DT = {
      bg: '#080808',
      surface: '#111111',
      gold: '#c8a96e',
      goldL: '#e2c98a',
      white: '#f0f0f0',
      muted: '#888888',
      border: '#2e2e2e'
    };

    return {
      backgroundColor: DT.bg,
      grid: { left: 0, right: 56, top: 32, bottom: 0, containLabel: true },
      legend: {
        data: [
          { name: nameA, icon: 'rect', itemStyle: { color: DT.muted } },
          { name: nameB, icon: 'rect', itemStyle: { color: DT.gold } }
        ],
        top: 4, right: 0,
        textStyle: { fontSize: 10, color: DT.muted },
        itemWidth: 10, itemHeight: 6
      },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'none' },
        backgroundColor: DT.surface,
        borderColor: DT.border,
        textStyle: { color: DT.white, fontSize: 11 },
        formatter: function (p) {
          return p[0].name + '<br/>'
            + nameA + ': ' + p[0].value + unit + '<br/>'
            + nameB + ': ' + p[1].value + unit;
        }
      },
      xAxis: {
        type: 'value',
        max: maxVal || null,
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: DT.border, type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'category', data: specs,
        axisLabel: { fontSize: 10, color: DT.muted },
        axisLine: { lineStyle: { color: DT.border } },
        axisTick: { show: false }
      },
      series: [
        {
          name: nameA, type: 'bar',
          barGap: '20%', barCategoryGap: '35%',
          data: valA,
          itemStyle: { color: DT.muted, opacity: 0.6 },
          label: {
            show: true, position: 'right',
            fontSize: 10, color: DT.muted,
            formatter: function (p) { return p.value + unit; }
          }
        },
        {
          name: nameB, type: 'bar',
          data: valB,
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: DT.gold + '99' },
                { offset: 1, color: DT.goldL }
              ]
            }
          },
          label: {
            show: true, position: 'right',
            fontSize: 10, fontWeight: 'bold', color: DT.goldL,
            formatter: function (p) { return p.value + unit; }
          }
        }
      ]
    };
  };

  // ─────────────────────────────────────────
  // dark-tech-radar
  // Radar capability chart — dark bg, gold fill.
  // params: {
  //   indicators: [{name, max}]   Radar axes
  //   valA:       number[]        Values for product A
  //   valB:       number[]        Values for product B
  //   nameA:      string          Product A name
  //   nameB:      string          Product B name
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-radar'] = function (params) {
    var indicators = params.indicators || [];
    var valA = params.valA || [];
    var valB = params.valB || [];
    var nameA = params.nameA || 'A';
    var nameB = params.nameB || 'B';

    var DT = {
      bg: '#080808',
      gold: '#c8a96e',
      goldL: '#e2c98a',
      white: '#f0f0f0',
      muted: '#888888',
      border: '#2e2e2e'
    };

    return {
      backgroundColor: DT.bg,
      legend: {
        data: [nameA, nameB],
        bottom: 4, left: 'center',
        textStyle: { fontSize: 10, color: DT.muted },
        itemWidth: 10, itemHeight: 6
      },
      tooltip: {
        backgroundColor: '#111',
        borderColor: DT.border,
        textStyle: { color: DT.white, fontSize: 11 }
      },
      radar: {
        indicator: indicators,
        center: ['50%', '48%'],
        radius: '62%',
        axisName: { color: DT.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: DT.border } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.01)', 'rgba(255,255,255,0.02)'] } },
        axisLine: { lineStyle: { color: DT.border } }
      },
      series: [{
        type: 'radar',
        data: [
          {
            name: nameA,
            value: valA,
            lineStyle: { color: DT.muted, width: 1.5 },
            areaStyle: { color: DT.muted + '22' },
            itemStyle: { color: DT.muted }
          },
          {
            name: nameB,
            value: valB,
            lineStyle: { color: DT.gold, width: 2 },
            areaStyle: { color: DT.gold + '33' },
            itemStyle: { color: DT.goldL },
            symbol: 'circle', symbolSize: 5
          }
        ]
      }]
    };
  };

  // ─────────────────────────────────────────
  // dark-tech-line
  // Line trend chart — dark bg, gold line with glow area.
  // params: {
  //   labels:   string[]   X-axis labels
  //   valA:     number[]   Series A values (muted, optional)
  //   valB:     number[]   Series B values (gold highlight)
  //   nameA:    string     Series A name
  //   nameB:    string     Series B name
  //   unit:     string     Value unit
  //   smooth:   boolean    Smooth curve (default true)
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-line'] = function (params) {
    var labels = params.labels || [];
    var valA = params.valA || [];
    var valB = params.valB || [];
    var nameA = params.nameA || 'A';
    var nameB = params.nameB || 'B';
    var unit = params.unit || '';
    var smooth = params.smooth != null ? params.smooth : true;

    var DT = {
      bg: '#080808',
      gold: '#c8a96e',
      goldL: '#e2c98a',
      white: '#f0f0f0',
      muted: '#666666',
      border: '#2e2e2e'
    };

    var series = [];

    if (valA.length) {
      series.push({
        name: nameA, type: 'line',
        data: valA, smooth: smooth,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { color: DT.muted, width: 1.5 },
        itemStyle: { color: DT.muted },
        areaStyle: { color: DT.muted + '18' },
        label: { show: false }
      });
    }

    series.push({
      name: nameB, type: 'line',
      data: valB, smooth: smooth,
      symbol: 'circle', symbolSize: 6,
      lineStyle: { color: DT.gold, width: 2.5 },
      itemStyle: { color: DT.goldL },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: DT.gold + '44' },
            { offset: 1, color: DT.gold + '05' }
          ]
        }
      },
      label: {
        show: true, position: 'top',
        fontSize: 9, fontWeight: 'bold', color: DT.goldL,
        formatter: function (p) { return p.value + unit; }
      },
      markPoint: {
        symbol: 'circle', symbolSize: 10,
        data: [{ type: 'max', itemStyle: { color: DT.gold } }],
        label: { fontSize: 9, color: '#000', fontWeight: 'bold' }
      }
    });

    return {
      backgroundColor: DT.bg,
      grid: { left: 0, right: 8, top: 28, bottom: 0, containLabel: true },
      legend: valA.length ? {
        data: [nameA, nameB],
        top: 4, right: 0,
        textStyle: { fontSize: 10, color: DT.muted },
        itemWidth: 10, itemHeight: 6
      } : { show: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#111',
        borderColor: DT.border,
        textStyle: { color: DT.white, fontSize: 11 },
        formatter: function (p) {
          var s = p[0].name + '<br/>';
          p.forEach(function (item) { s += item.seriesName + ': ' + item.value + unit + '<br/>'; });
          return s;
        }
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 9, color: DT.muted, interval: 0 },
        axisLine: { lineStyle: { color: DT.border } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 9, color: DT.muted,
          formatter: function (v) { return v + unit; }
        },
        splitLine: { lineStyle: { color: DT.border, type: 'dashed' } }
      },
      series: series
    };
  };

  // ─────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────

  function add(key, fn) {
    _presets[key] = fn;
  }

  function get(key, params) {
    if (!_presets[key]) {
      console.warn('[NBPresets] preset not found:', key);
      return {};
    }
    return _presets[key](params || {});
  }

  global.NBPresets = {
    get: get,
    add: add
  };

})(window);
