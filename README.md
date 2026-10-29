# 动态作品集 Portfolio — GSAP 滚动编排 · 可视化后台

单页滚动叙事 + 全站可视化编辑的个人作品集模板。设计语言继承
danielspatzek.com 式的表现主义排印：旋转标题、图像切片、肖像长卷、
电视机作品索引、电话亭联系收尾；所有文案、照片、作品、颜色都可以在
`/admin` 后台直接修改并发布，无需改代码。

- `/` — 预加载 → 主视觉 → 肖像 / 传记 / 画廊长卷（桌面端全屏 pin 编排，
  阅读停留按文案长度自适应）→ 电视机作品索引（行悬停点亮屏幕 → 玻璃上的
  电话号码 → 穿屏放大溶解）→ 联系方式。
- `/admin` — 密码保护的编辑后台：中英双语字段、图片上传或外链、画廊 /
  作品的增删排序、电视机玻璃位置校准、主题色、JSON 导入导出、一键发布。

技术栈：Next.js 16（App Router）· React 19 · TypeScript · GSAP 3
（ScrollTrigger + ScrollSmoother）· PostgreSQL（Netlify Database / 任意 Postgres）。

## 双模运行：演示 → 正式

| 模式 | 触发条件 | 密码 | 数据 |
|---|---|---|---|
| 演示 Demo | 没有可用数据库 | 无需密码（直接进入） | 示例内容 + 浏览器缓存草稿（自动保存，首页实时同步） |
| 正式 Live | 成功连接 PostgreSQL | 你自己设置的密码 / `ADMIN_PASSWORD` | 持久化在数据库 |

连上数据库后**临时密码与假数据自动停用**，程序自动建表，无需手动迁移。
`/adam` 是同一个后台的只读预览（不改数据），连库后自动改为 Live 页并指向 `/admin`。

后台 **Data** 页签支持一键备份与迁移：导出内容 + 全部引用图片，在另一个站
（或重置后的库）一键恢复。

- Netlify / Cloudflare / Vercel / Railway / Render / Fly 部署：`docs/PLATFORM_DEPLOY.md`
- Netlify Database 图文步骤：`docs/NETLIFY_DEPLOY.md`
- 本地运行 / 自建服务器 / 环境变量：`docs/SETUP.md`
- 已知问题与后续计划：`docs/ROADMAP.md`

## 快速开始

```bash
nvm use              # Node 22（见 .nvmrc）
npm install

# 1. 准备 PostgreSQL（任选其一：本地安装 / Docker / 云数据库），
#    然后配置 .env，详见 docs/SETUP.md
cp .env.example .env 2>/dev/null || true   # 本仓库直接编辑 .env 即可

# 2. 建表
npx drizzle-kit push

# 3. 启动
npm run dev          # http://localhost:3000 · /admin（演示模式直接进入）· /adam
```

> 没有数据库时 `/admin` 使用无需密码（直接进入）（演示模式，重启恢复）。
> 配置好 PostgreSQL 后临时密码自动失效，首次进入 `/admin` 会让你设置正式密码。

## 项目结构

```
src/
  app/
    page.tsx                 首页（服务端读取内容 → 客户端编排）
    admin/page.tsx           /admin 后台（演示模式直接进入 / 正式模式密码保护）
    adam/page.tsx            /adam 临时只读预览（连库后自动停用）
    api/status/route.ts      后端模式探测（demo / postgres）
    api/content|media|session|health  内容读写 / 图片上传 / 会话 / 健康检查
  portfolio/                 ★ 可整体复用，与框架无关的核心
    content/                 types 类型契约 · defaults 默认文案 · normalize 入库校验
    scroll/choreography.ts   全部 GSAP 时间线（桌面 / 移动端 / reduced-motion）
    ui/                      Portfolio 壳 + Hero/Journey/Works/Contact 四幕
    admin/AdminApp.tsx        后台编辑器（客户端组件）
    server/                  db.ts（Postgres/演示双模存储、自动建表、模式探测）
                             auth.ts（签名 cookie、scrypt 密码）+ api.ts（Web 标准处理函数）
    styles/                  portfolio.css · admin.css
  db/schema.ts               site_content · media_assets · admin_settings
public/images|fonts          生产资料（人物主视觉、肖像、作品图、电视机框…）
export/react-router/         可独立下载、本地运行、可部署 Netlify 的 React Router 8 工程
docs/SETUP.md                从零搭建、.env 配置、生产部署、故障排查
docs/ROADMAP.md              本轮修复记录与后续开发路线
scripts/build-export.mjs     把本工程打包成 export/react-router zip（含后台下载按钮）
```

内容模型只有一张“整站 JSON”：后台发布即覆盖 `site_content` 一行；
上传的图片存 `media_assets` 并以 `/api/media/:id` 提供，前端无需改动。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 本地开发 |
| `npm run build` / `npm start` | 生产构建 / 生产运行 |
| `npm run typecheck` | 类型检查 |
| `npx drizzle-kit push` | 按 `src/db/schema.ts` 同步表结构 |
| `node scripts/build-export.mjs` | 重新生成 `public/downloads/portfolio-react-router.zip` |

## 部署

- **Netlify**：用 `/admin` 左下角下载的 `portfolio-react-router.zip`
  （React Router 8 + PostgreSQL/Netlify Database 持久化），在 Netlify 导入、
  连接数据库即可上线。零基础步骤见 `docs/NETLIFY_DEPLOY.md`。
- **VPS / 自有服务器**：本 Next.js 工程 `npm run build && npm start`
  即可运行，配合 systemd + 反向代理；PostgreSQL 可放本机或云数据库。
  细节见 `docs/SETUP.md`。

## 文档

- `docs/PLATFORM_DEPLOY.md` — **多平台零基础部署**：Netlify、Cloudflare Hyperdrive、Vercel、Railway、Render、Fly。
- `docs/NETLIFY_DEPLOY.md` — Netlify + PostgreSQL、首次设密码、改 works、排错表。
- `docs/SETUP.md` — 环境搭建、`.env` 配置项、数据库、本地运行、自建服务器部署。
- `docs/ROADMAP.md` — 已知问题归纳与后续开发路线（含每轮修复记录）。
