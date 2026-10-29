# Portfolio Template · 动态作品集

单页滚动叙事 + 可视化后台的个人作品集模板：旋转标题、肖像长卷、电视机作品索引、电话亭联系收尾。
所有文案、照片、作品条目都能在 `/admin` 里改，**数据存 PostgreSQL**，一键备份 / 迁移。

技术栈：Next.js 16（App Router）· React 19 · TypeScript · GSAP（ScrollTrigger + ScrollSmoother）· PostgreSQL（`pg`，表结构见 `src/db/schema.ts`）。

## 30 秒跑起来

```bash
git clone https://github.com/BrainEno/portfolio-template.git && cd portfolio-template
bash scripts/setup.sh          # 装依赖、生成 .env、(有 Docker 就顺手起 Postgres)、启动 dev
# 没有 Docker / 不想装数据库：bash scripts/setup.sh --no-db   （演示模式，照样能用 /admin）
```

打开 <http://localhost:3000>（首页）和 <http://localhost:3000/admin>（后台）。
手动方式：`npm install && cp .env.example .env && npm run dev`。出问题先跑 `npm run doctor`。

## 两种运行模式（自动切换，无需配置）

| 模式 | 触发条件 | /admin | 数据 |
|---|---|---|---|
| **演示 Demo** | 没有可用的 PostgreSQL | 直接进入，无需密码 | 内置 mock 数据；你的修改保存在**本浏览器缓存**（localStorage + BroadcastChannel），首页实时同步 |
| **正式 Live** | 成功连上 PostgreSQL | 首次访问设置密码（或用 `ADMIN_PASSWORD`） | 全部存数据库；**mock 数据与浏览器草稿自动失效** |

mock 数据与数据库表使用**同一份 JSON 结构**，Data 页签里的「备份」可把演示草稿 / 一个站的内容（含图片）一键迁到另一个站。

## 部署（小白也能成）

| 目标 | 一条命令 / 入口 | 文档 |
|---|---|---|
| 自己的 VPS（含数据库，自动 HTTPS） | `DOMAIN=你的域名 bash scripts/deploy.sh docker` | [docs/DEPLOY.md](docs/DEPLOY.md#1-vps--自有服务器推荐docker) |
| 全新 Ubuntu 服务器一键 | `curl -fsSL …/scripts/vps-install.sh \| DOMAIN=x.com bash` | 同上 |
| Netlify | 导入仓库 + 添加 Netlify Database | [docs/DEPLOY.md](docs/DEPLOY.md#3-netlify) |
| Cloudflare Workers | `npm run cf:deploy`（Hyperdrive / secret 两种连库方式） | [docs/DEPLOY.md](docs/DEPLOY.md#4-cloudflare-workersopennext) |
| Vercel / Railway / Render / Fly | 导入仓库，加 `DATABASE_URL` | [docs/DEPLOY.md](docs/DEPLOY.md#5-vercel--railway--render--fly) |

## 文档

- [docs/QUICKSTART.md](docs/QUICKSTART.md) — 本地运行、第一次进后台、改内容、换图片、备份恢复（零基础）
- [docs/DEPLOY.md](docs/DEPLOY.md) — 各平台部署、环境变量表、数据库迁移、排错
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 代码结构审查与重构记录、SEO / PWA / 图片框架 / 动效设计说明

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` / `build` / `start` | 开发 / 构建 / 生产运行 |
| `npm run setup` · `npm run doctor` | 一键本地准备 · 配置自检 |
| `npm run deploy` | 交互式部署菜单（docker / node / netlify / cloudflare / vercel） |
| `npm run cf:preview` · `cf:deploy` | Cloudflare 本地预览 · 部署 |
| `npm run db:push` | （可选）用 drizzle-kit 同步表结构；应用自身首次连库时也会自动建表 |
| `npm run art` | 重新生成电视机 / 电话亭矢量插画 |

## 目录结构

```
src/app/                 路由层（薄）：/ · /admin · /works/[id] · /offline · /api/* · robots/sitemap/manifest
src/portfolio/
  content/               types · defaults(mock) · normalize —— 内容契约，前后端共用
  server/                connection(平台识别+连接串) · storage(Postgres/演示存储) · backend(探测/鉴权配置)
                         auth · http · *-handlers(content/session/backup/status) · api(统一出口)
  client/                demo-store(浏览器缓存草稿) · useLiveContent(首页实时订阅)
  scroll/choreography.ts 全部 GSAP 时间线
  ui/                    Portfolio 壳 · 四幕 sections · PwaRegister
  admin/                 AdminApp(壳) · editor · fields · DataPanel · Login · shared
  seo/site.ts            站点 URL / JSON-LD / 标题规则
  styles/                portfolio.css · admin.css · work-detail.css
src/db/schema.ts         drizzle 表定义（site_content · media_assets · admin_settings）
public/sw.js             离线缓存 Service Worker
scripts/                 setup.sh · deploy.sh · vps-install.sh · doctor.mjs · art/
Dockerfile · docker-compose.yml · netlify.toml · wrangler.jsonc · open-next.config.ts · deploy/
```
