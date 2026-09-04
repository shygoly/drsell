# 演示视频

**状态：未录制。**

## 分镜脚本

14 个镜头、目标时长 5:20、三幕一镜到底，含开录前检查清单与「绝不能入画」清单：
https://claude.ai/code/artifact/5b1b5a07-c133-41a9-a62c-0dbe6d5e60be

## 录制前必须为真

1. Shopify admin 语言为 English（账户「首选语言」）
2. 浏览器 `navigator.language` 为 `en-*`
3. 已知道演示店前台密码（开发店关不掉密码保护）
4. 应用已从演示店卸载——第一幕要拍真实安装
5. 干净的浏览器配置，无个人书签与多余标签页
6. 演示店有商品与订单数据

## 第一幕（安装）的前置风险

卸载后必须能重装。本仓自带的 legacy OAuth 入口 `/api/auth` 目前返回 **500**，
不能当兜底——该应用走 Shopify managed installation，安装链路不经过它。
**先确认一条可用的重装 URL，再卸载。**

## 第二幕（配置向导）如何重放

向导状态存在 `BotSetting.onboardingStep`，卸载重装**不会**重置它。
需要显式 PATCH：

```
PATCH /api/backend/shopify/onboarding?shop=<domain>
Authorization: Bearer <shop JWT>
{"step":"1"}
```

恢复：同一端点 `{"complete":true}`。

成片放在本目录。
