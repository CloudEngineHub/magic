# Admin reference multiplier preview

Shared, dependency-free preview utilities for both admin interfaces. This module does not calculate actual charges, route models, load platform prices, or provide business defaults.

## API contract

`model_billing_multiplier` contains:

- `enabled`: display switch.
- `input_price_cny`, `output_price_cny`: nullable decimal strings, CNY per million tokens. Each may be zero; their combined reference amount must be positive when enabled.
- `usd_to_cny_rate`: nullable decimal string. Defaults are supplied by the backend.
- `base_price_cny`: backend-calculated CNY amount for 10,000 input + 1,000 output tokens. The UI preserves this response field; editing never writes a computed preview into it.

The API must persist the new token prices and return the calculated `base_price_cny`. Previously saved reference amounts remain usable until both token prices are supplied; the UI does not infer input/output prices from an old amount. Deploy backend support before releasing this interface.

## Price examples

Official prices checked on 2026-10-15 are static explanatory snapshots, not live quotes, platform selling prices or an availability list. Source links are recorded next to each model. Context tiers are equally averaged; DeepSeek uses peak uncached prices without off-peak discounts. Adjusting the benchmark only changes example multipliers; adjusting the display exchange rate also changes CNY amounts.

# 管理端参考倍率预览

两个管理端共用无依赖的预览与校验逻辑，不处理扣费、模型路由、平台售价或业务默认值。

输入、输出基准单价以人民币/百万 token 的十进制字符串保存；后端负责默认值与最终参考金额。前端只预览，不将计算结果覆盖到 `base_price_cny`。旧金额无法反推两项单价，未填写新单价时保留历史配置。

发布前需要后端支持保存 `input_price_cny`、`output_price_cny`，并返回重新计算的 `base_price_cny`。示例为标注日期的官方价格快照；各档等权平均，不代替平台实际售价。
