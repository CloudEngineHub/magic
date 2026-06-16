# Rednote Hashtag Library

Load this reference before filling `meta.tags` for a `rednote` post, or when the user asks to optimize Xiaohongshu/Rednote tags.

Use the library as candidate vocabulary, not as a substitute for the post's real topic. Final tags must match the article angle, audience, material, and card copy.

## Hashtag Pyramid

| Layer | Field | Count | Purpose |
| --- | --- | --- | --- |
| Category anchor | `core` | 1-2 | Broad category words that place the note in a major traffic pool. |
| Search intent | `mid` | 2-3 | Scenario, style, method, or subcategory words users actively search. |
| Precision longtail | `longtail` | 2-3 | Audience, pain point, body type, location, budget, tool, or use-case terms. |
| Current trend | `trend` | 0-1 | Current trend or official activity tags with platform momentum. |

Total: 5-8 tags. Hard cap: 10.

Output order: `core -> mid -> longtail -> trend`.

## General Formula

```text
1 category anchor
+ 1-2 scenario/style subcategory tags
+ 1-2 target-audience tags
+ 1 function, pain-point, or concrete qualifier tag
+ 0-1 current trend tag
```

## Fashion

| Layer | Candidates |
| --- | --- |
| `core` | `穿搭`, `今日穿搭`, `ootd` |
| `mid` | `通勤穿搭`, `显瘦穿搭`, `日常穿搭`, `约会穿搭`, `海边穿搭` |
| `longtail` | `小个子穿搭155`, `梨形身材显瘦`, `女大学生穿搭`, `微胖穿搭`, `显高穿搭` |
| Style words | `辣妹风`, `甜妹风`, `韩系穿搭`, `氛围感穿搭`, `少年感`, `Lolita` |
| `trend` | `多巴胺穿搭`, `美拉德风格`, `老钱风` |

Example:

```text
#穿搭 #通勤穿搭 #显瘦穿搭 #梨形身材显瘦 #职场穿搭
```

## Food

| Layer | Candidates |
| --- | --- |
| `core` | `美食`, `家常菜`, `美食分享` |
| `mid` | `家常菜谱`, `懒人食谱`, `下饭菜`, `快手菜`, `减脂餐` |
| `longtail` | `空气炸锅食谱`, `一人食`, `15分钟快手菜`, `宿舍美食`, `高蛋白食谱` |
| Scenario words | `早餐食谱`, `午餐便当`, `晚餐食谱`, `夜宵` |
| `trend` | `低卡美食`, `蛋白质食谱` |

Example:

```text
#美食 #懒人食谱 #快手菜 #一人食 #15分钟快手菜
```

## Travel

| Layer | Candidates |
| --- | --- |
| `core` | `旅行`, `旅游攻略`, `出行攻略` |
| `mid` | `周末游`, `国内旅游`, `小众景点`, `自驾游`, `亲子游` |
| `longtail` | `[城市名]旅游攻略`, `学生穷游攻略`, `一个人旅行`, `情侣旅行`, `[景区名]攻略` |
| Audience words | `solotrip`, `穷游`, `背包客`, `亲子旅行` |
| `trend` | `citywalk`, `特种兵旅游`, `反向旅游` |

Travel rule: include a concrete city, area, route, or attraction tag. Pure generic tags are not enough.

Example:

```text
#旅行 #旅游攻略 #杭州旅游攻略 #citywalk #一个人旅行
```

## Skincare

| Layer | Candidates |
| --- | --- |
| `core` | `护肤`, `护肤分享`, `skincare` |
| `mid` | `护肤routine`, `极简护肤`, `平价护肤`, `护肤干货` |
| `longtail` | `油皮护肤`, `干皮秋冬护肤`, `敏感肌护肤`, `油皮平价护肤`, `学生党护肤` |
| Function words | `美白护肤`, `祛痘护肤`, `抗老护肤`, `屏障修护`, `补水保湿` |
| `trend` | `成分党`, `早C晚A`, `防晒攻略` |

Example:

```text
#护肤 #平价护肤 #油皮护肤 #油皮平价护肤 #学生党护肤
```

## Fitness

| Layer | Candidates |
| --- | --- |
| `core` | `健身`, `减肥`, `运动` |
| `mid` | `新手健身`, `居家健身`, `减脂`, `塑形` |
| `longtail` | `新手女生健身`, `睡前瘦手臂`, `跑步机减肥`, `腹部减脂`, `无器械健身` |
| Body-part words | `瘦腿`, `瘦手臂`, `瘦腰`, `马甲线`, `翘臀` |
| `trend` | `跑步机爬坡`, `普拉提`, `有氧运动` |

Example:

```text
#健身 #居家健身 #瘦腿 #新手女生健身 #无器械健身
```

## Placement

Preferred card rendering:

1. Natural in-copy use for 1-2 core or mid tags when the sentence remains readable.
2. Final card footer for the full tag set.
3. No repeated full hashtag block on every card.

Footer format:

```text
#穿搭 #通勤穿搭 #显瘦穿搭 #梨形身材显瘦 #155穿搭日记 #多巴胺穿搭
```

## Anti-Patterns

| Do not | Use instead |
| --- | --- |
| Stack 15-20 tags. | Keep 5-8, hard cap 10. |
| Use only broad tags such as `穿搭` and `美食`. | Mix broad, search-intent, longtail, and trend layers. |
| Add unrelated viral tags for traffic. | Remove off-topic tags; relevance beats reach. |
| Reuse the exact same tag set for every post. | Keep 2-3 stable anchors and vary the rest by topic. |
| Publish a travel post without a location tag. | Add city, area, route, or attraction. |
| Keep stale trend tags forever. | Refresh `trend` tags during later edits. |
