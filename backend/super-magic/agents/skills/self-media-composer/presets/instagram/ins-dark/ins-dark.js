/**
 * ins-dark.js
 * Instagram Dark Tech ECharts chart preset library
 */
(function (global) {
    'use strict';

    var _presets = {};

    _presets['neon-bar'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];

        return {
            grid: { left: 0, right: 0, top: 10, bottom: 0, containLabel: true },
            xAxis: {
                type: 'category', data: labels,
                axisLabel: { fontSize: 10, color: '#71717a', fontFamily: 'JetBrains Mono, monospace' },
                axisLine: { lineStyle: { color: '#27272a' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { fontSize: 10, color: '#3f3f46' },
                splitLine: { lineStyle: { color: '#1c1c2a' } }
            },
            series: [{
                type: 'bar', data: values,
                itemStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: '#22d3ee' },
                            { offset: 1, color: 'rgba(34,211,238,0.3)' }
                        ]
                    },
                    borderRadius: [4, 4, 0, 0]
                },
                barCategoryGap: '35%'
            }]
        };
    };

    var INSDarkPresets = {
        get: function (name, params) {
            if (!_presets[name]) throw new Error('[INSDarkPresets] Unknown preset: ' + name);
            return _presets[name](params || {});
        },
        add: function (name, fn) { _presets[name] = fn; }
    };

    global.INSDarkPresets = INSDarkPresets;
})(window);
