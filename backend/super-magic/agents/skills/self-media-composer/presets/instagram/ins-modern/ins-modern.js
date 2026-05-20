/**
 * ins-modern.js
 * Instagram Modern ECharts chart preset library
 *
 * Responsibility: Provide ECharts chart presets matching the Instagram Modern visual style,
 *   referenced by card HTML via the data-preset attribute or called through INSPresets.get().
 *
 * Usage (in card HTML):
 *   <div class="ins-card ins-content"
 *        data-echarts-id="chart-id"
 *        data-preset="monthly-cost-bar"
 *        data-preset-params="URL-encoded JSON params">
 *     ...
 *     <div id="chart-id" style="width:100%;height:185px;"></div>
 *   </div>
 *
 *   // In card <script>:
 *   var option = INSPresets.get('monthly-cost-bar', params);
 *   echarts.init(el).setOption(option);
 *
 * Add a new preset: INSPresets.add('preset-name', function(params) { return echartsOption; })
 *
 * Exposes: window.INSPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   monthly-cost-bar  Monthly cost bar chart (black actual bars + yellow forecast bars, with holiday annotations)
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
          : { color: '#ffd166', borderColor: '#111', borderWidth: 1 }
      };
    });

    var markData = marks.map(function (m) {
      return {
        coord: [m.xLabel, m.y],
        label: {
          show: true, formatter: m.text,
          fontSize: 9, color: '#ffd166', fontWeight: 'bold',
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
          { name: 'Forecast', icon: 'rect', itemStyle: { color: '#ffd166', borderColor: '#111', borderWidth: 1 } }
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

  // Add more presets here as needed:
  // _presets['weekly-trend-line'] = function(params) { ... };
  // _presets['model-cost-pie']    = function(params) { ... };

  // ─────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────

  function add(key, fn) {
    _presets[key] = fn;
  }

  function get(key, params) {
    if (!_presets[key]) {
      console.warn('[INSPresets] preset not found:', key);
      return {};
    }
    return _presets[key](params || {});
  }

  global.INSPresets = {
    get: get,
    add: add
  };

})(window);
