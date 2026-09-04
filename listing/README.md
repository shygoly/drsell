# listing/ — Shopify 上架素材

提交 Shopify App Store 所需的全部内容。**目的是不必重复生产**：
文案改这里、截图放这里，提交时照抄，不要每次重新写、重新截。

```
listing/
  LISTING.md      表单逐字段内容（唯一事实来源）
  screenshots/    1600x900，已按 Shopify 规格裁剪
  video/          演示视频与分镜脚本
```

## 什么时候必须重新生成截图

截图会过期，而过期的截图比没有截图更糟——审核员会拿它对照实际应用。
下列任一发生时，`screenshots/` 全部作废，重拍：

- 嵌入端 UI 有可见改动（导航、品牌、页面布局）
- 演示店铺的会话数据被清理或重建（Inbox 与 Dashboard 会直接对不上）
- 应用名、品牌名或配色调整

`01-dashboard` / `02-inbox` 还额外依赖演示店的会话数据，数据一动就必须重拍这两张。

## 怎么拍

1. Shopify admin 语言设为 **English**（在账户「首选语言」，不是店铺语言设置）
2. 浏览器 `navigator.language` 为 `en-*`（widget 按它切语言）
3. 打开 `https://admin.shopify.com/store/<store>/apps/drseller-alpha`
4. 截图后裁掉 Shopify 左侧导航与顶栏，等比缩放补边到 1600x900：

```bash
ffmpeg -i raw.jpg \
  -vf "crop=3100:1592:478:111,scale=1600:-2,pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=0xF6F8F9" \
  -q:v 2 out.jpg
```

裁剪参数对应 3584x1708 的原始截图。换分辨率要重新量边界。

## 已知约束

- 开发店前台**强制密码保护，关不掉**。审核员需要密码才能看到 widget，
  必须写进表单的 App testing information。
- Shopify 要求截图不含浏览器 UI、桌面背景与任何可识别个人信息。
