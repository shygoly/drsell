> **先做 E1 再写取数层。** 两条分支的实现完全不同，先写会白写一半。
> **本变更完成前不得打开 `SUBSCRIPTION_GATE_ENFORCE`**（见 design 的 R4）：
> 那等于按一份四个月未更新的镜像停服。

## 0. 先决实验（决定后续所有实现）

- [x] 0.1 在 `jade-shop-2024`（全新安装、无历史订阅）选定一个套餐 —— 2026-09-09 完成
- [x] 0.2 只读探针直查 Admin API，不写库
- [x] 0.3 **E1 通过**：`currentAppInstallation.activeSubscriptions` 读得到刚创建的
      App Pricing 订阅 —— `gid://shopify/AppSubscription/32657047769`，name `Basic`，
      status `ACTIVE`，**`test: false`**，createdAt `2026-09-09T14:09:22Z`（几分钟前、
      新体系创建），currentPeriodEnd `+7d`，trialDays 7。
      → **D3 走 Admin API**，不需要 Partner API，不需要新凭据；
      `syncFromShopify` 本身可用，缺的只是调用方
- [x] 0.4 不适用（E1 已通过）
- [x] 0.5 附带发现：新体系下开发店的订阅 **`test: false`**（文档：4-28 起改用
      no-charge testing，不再创建测试订阅）。故 `subscription-gating-and-expiry`
      的 D7「测试订阅豁免」**不再覆盖新装的开发店**——它们靠的是真实 ACTIVE 订阅，
      本就可服务；D7 仍需保留，因为遗留测试订阅（如 chatbotdomaintest）还在

## 1. 回跳即同步（D1）

- [ ] 1.1 在 Partner Dashboard 为每个套餐配置 redirection URL / welcome link，
      指向应用内一个我们处理的路径
- [x] 1.2 该路径收到回跳即触发同步；`plan_handle` 只当触发信号，不当权威值
- [x] 1.3 同步完成后把商家带到应用主界面，不停在一个中间页
- [x] 1.4 端点 `POST /api/shopify/subscription/sync` 落地；回跳落地即调
- [x] 1.5 实现层面不读 `plan_handle` 的值，只当触发信号——天然满足

## 2. 按陈旧度补同步（D2）

- [x] 2.1 `latestSubscription` 返回值带上「镜像有多旧」
- [x] 2.2 闸门判定时若超过 `MIRROR_STALE_AFTER`（6 小时）则**异步**触发同步，
      本次判定仍用当前镜像；同店冷却 5 分钟
- [x] 2.3 同店并发去重，活跃店铺每个陈旧窗口最多触发一次
- [x] 2.4 同步失败必须留痕可见，不静默吞掉
- [x] 2.5 单测：镜像陈旧 → 判定不被阻塞，且确实触发了一次同步
- [x] 2.6 单测：同店短时间多条消息只触发一次
- [x] 2.7 单测：同步抛错不影响判定结果

## 3. 安装后宽限（D5）

- [x] 3.1 定宽限时长 —— 已定：**7 天**（2026-09-09，用户确认）
- [x] 3.2 `evaluateServiceability` 增加「安装后宽限期内且无订阅」→ 可服务，
      判定原因与 `active` / `trial` 区分开
- [x] 3.3 单测：新装未选套餐 → 放行；宽限期过后仍无订阅 → 停
- [x] 3.4 单测：宽限期内选了套餐 → 判定切到正常路径

## 4. 商家端出口

- [ ] 4.1 验收 `c3b0736` 已落地的套餐页链接在真实店铺可点、可达
- [ ] 4.2 「已安装未选套餐」状态下横幅文案与链接措辞正确

## 5. 收尾

- [x] 5.1 更正 `ADR-14` 与相关注释里「webhook 是唯一知情途径」的断言
      （代码注释已在 `c3b0736` 更正，治理文档尚未）
- [x] 5.2 `pnpm test`（含 `pnpm spec`）全绿
- [x] 5.3 `openspec validate subscription-mirror-without-webhooks --strict` 通过
- [x] 5.4 部署后实测：`jade-shop-2024` 一条真实顾客对话触发 D2 补同步，
      镜像**从无到有**被正确建立（basic ACTIVE，isTest=f，
      currentPeriodEnd 2026-09-16 14:09:22），与 E1 里 Admin API 的返回完全一致。
      整条链路不再需要 webhook
- [ ] 5.5 确认后再回到 `subscription-gating-and-expiry` 的 3.3
