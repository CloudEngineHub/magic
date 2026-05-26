/**
 * ins-gradient.js
 * Instagram Gradient Glow ECharts chart preset library
 */
(function (global) {
    'use strict';

    var _presets = {};

    _presets['gradient-line'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];

        return {
            grid: { left: 0, right: 0, top: 20, bottom: 0, containLabel: true },
            xAxis: {
                type: 'category', data: labels,
                axisLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
            },
            series: [{
                type: 'line', smooth: true, data: values,
                lineStyle: { width: 4, color: '#ff6b6b' },
                itemStyle: { color: '#ff6b6b' },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(255,107,107,0.4)' },
                            { offset: 1, color: 'rgba(255,107,107,0)' }
                        ]
                    }
                }
            }]
        };
    };

    var INSGradientPresets = {
        get: function (name, params) {
            if (!_presets[name]) throw new Error('[INSGradientPresets] Unknown preset: ' + name);
            return _presets[name](params || {});
        },
        add: function (name, fn) { _presets[name] = fn; }
    };

    global.INSGradientPresets = INSGradientPresets;
})(window);
