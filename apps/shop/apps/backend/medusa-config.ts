import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: [
    // B2B 询价线索（自定义 module）。表建在 drsell_shop 库，见 DEPLOY.md §6。
    {
      resolve: "./src/modules/inquiry",
    },

    // ── 可靠投递基建（ADR-20）──────────────────────────────────────────
    // 不配这几个模块时，Medusa 会用**进程内内存**实现：
    //   · event-bus-local   —— 事件只在本进程内存里，进程一重启就丢，
    //                          失败无重放（这就是 DEPLOY.md §7 缺口 8.4）
    //   · workflow-engine-inmemory —— 长流程状态同样不持久
    // 后果不是「慢」，是**静默丢事件**：Medusa 改商品 → subscriber 没跑 →
    // drsell 库里没这行，而两边都不会报错。
    //
    // 生产用 Redis 实现。Redis 在 wjclaw 本机（systemd `redis-server`，
    // 127.0.0.1:6379），**不是 docker**；drsell 用 db2 + 前缀 drsellshop:
    // （db0 已被别的项目占用，见 ADR-20 / DEPLOY.md §6.1）。
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: process.env.EVENTS_REDIS_URL || process.env.REDIS_URL,
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: {
        redis: {
          redisUrl: process.env.REDIS_URL,
        },
      },
    },
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            resolve: "@medusajs/caching-redis",
            id: "caching-redis",
            is_default: true,
            options: {
              redisUrl: process.env.CACHE_REDIS_URL || process.env.REDIS_URL,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: {
              redisUrl: process.env.REDIS_URL,
            },
          },
        ],
      },
    },
  ],
  featureFlags: {
    // caching 模块需显式开启才生效
    caching: true,
  },
  admin: {
    // 后台经 medusa.szchada.top 反代访问；dev(vite) 会按 Host 白名单拦截，故放行该域名。
    // 生产已是 `medusa build` 预构建产物（见 scripts/deploy-shop.sh），
    // 保留此段是为了 `medusa develop` 本地开发时不撞 Host 检查。
    vite: () => ({
      server: {
        allowedHosts: ["medusa.szchada.top"],
      },
    }),
  },
})
