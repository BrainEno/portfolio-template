# 搭建与配置手册（SETUP）

本文档覆盖：在真实环境从零跑起本项目、`.env` 全部配置项、
数据库初始化、本地开发、生产部署与常见故障排查。

## 1. 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 22.x | `nvm use`（仓库有 `.nvmrc`） |
| npm | 随 Node 22 | `npm install` 安装依赖 |
| PostgreSQL | 14+ | 存整站内容 JSON 与上传图片 |

Playwright/Chromium 仅用于开发期截图回归，非运行必需。

## 2. 准备 PostgreSQL（三选一）

**A. Docker（推荐，最省事）**

```bash
docker run -d --name portfolio-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_db \
  -p 5432:5432 postgres:16
```

**B. 本机安装**（Ubuntu/Debian 示例）

```bash
sudo apt install postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE app_db;"
```

**C. 云数据库**（Neon / Supabase / RDS 等）：建库后拿到连接串即可。

连通性自测：

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/app_db" -c "select 1;"
```

## 2.5 双模（演示 / 正式）—— 先看这里

| 模式 | 判定 | 密码 | 数据 |
|---|---|---|---|
| 演示 Demo | 没有可用连接串，或连不上 | 无需密码（直接进入） | **浏览器 localStorage 草稿**（自动保存 + 首页实时同步），连库后自动失效 |
| 正式 Live | 探测到 PostgreSQL 并成功读到表 | 首次 `/admin` 自设密码，或环境变量 `ADMIN_PASSWORD` | 数据库持久化 |

- 探测逻辑：`src/portfolio/server/db.ts` 的 `probeBackend()`，
  依次读取 `DATABASE_URL → NETLIFY_DB_URL → NETLIFY_DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL`。
- 成功连接后自动执行 `CREATE TABLE IF NOT EXISTS`（`site_content`、
  `media_assets`、`admin_settings`），**无需**手动迁移；之后才启用正式模式并
  废除临时密码与示例数据。
- `/api/status` 可直接查看当前模式；`/adam` 在演示模式下提供只读预览。

## 3. `.env` 配置（项目根目录）

```bash
# 必填：PostgreSQL 连接串
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db

# 可选：后台登录密码。留空时，正式模式会在首次访问 /admin 时要求设置密码；
# 演示模式不需要密码，会直接进入后台。
ADMIN_PASSWORD=

# 会话 cookie 签名密钥（可选）。
# 留空则由 ADMIN_PASSWORD 派生；如需轮换会话而不改密码，可单独设置：
# ADMIN_SECRET=一串至少32位的随机字符串
```

说明：

- 正式模式 + `ADMIN_PASSWORD` 为空 → 首次进入 `/admin` 会要求设置密码，
  以 scrypt 加盐哈希存入 `admin_settings`（表 `admin_settings`，键
  `admin_password`）。设置后临时密码永久失效。
- 演示模式（无数据库）→ 无需密码（直接进入），页面顶部有红色 Demo 提示条。
- 忘记密码：设 `ADMIN_PASSWORD` 重新部署，或
  `delete from admin_settings where key='admin_password';` 后重设。
- `ADMIN_SECRET` 修改后，已登录会话全部失效（需重新登录）。
- 会话 cookie 为 `HttpOnly + SameSite=Lax`，HTTPS 下自动加 `Secure`，
  有效期 7 天；后台可“Sign out”主动登出。

## 4. 初始化数据库

```bash
npx drizzle-kit push   # 可选：程序首次连库会自动建表，手动执行也可以
```

`drizzle-kit push` 与程序内自动建表等价（`src/db/schema.ts` ↔ `db.ts` 的
`SCHEMA_SQL`），无需手写 migration：

| 表 | 用途 |
|---|---|
| `site_content` | 整站内容（一行 JSON，`id='portfolio'`），后台发布即覆盖 |
| `media_assets` | 后台上传的图片（二进制 + MIME），通过 `/api/media/:id` 访问 |
| `admin_settings` | 后台密码哈希等站点级设置 |

备份：`/admin → Data → Download full backup`（内容 + 图片，可跨站恢复）；
恢复到新库：`/admin → Data → Restore backup`。API：`GET/POST /api/backup`。

核对：

```bash
psql "$DATABASE_URL" -c "\dt"
```

## 5. 本地运行

```bash
npm run dev      # 开发模式 http://localhost:3000
npm run build    # 生产构建
npm start        # 生产运行（默认 3000，可用 PORT=8080 npm start 改端口）
```

- 首页 `/`：服务端从库里读内容（库空则用 `src/portfolio/content/defaults.ts`
  默认值），首屏即最终文案，无加载闪烁。
- 临时预览 `/adam`：无数据库时只读查看后台结构，连库后自动变为 Live 提示页。
- 演示模式的草稿存于 `localStorage['pf.demo.content.v2']`，后台改动会自动缓存并实时
  同步到首页；`Data → Download demo backup` 可导出，连库后 `Restore backup` 导入。
- 后台 `/admin`：演示模式直接进入 / 正式模式密码登录→ 左侧 9 个页签编辑 →
  右上 **Publish** 发布 → 首页实时生效。`Ctrl/⌘+S` 快捷发布；
  未保存离开页面会有提示。
- 图片两种来源都支持：填 `/images/xxx.jpg`（`public/` 下的生产资料）、
  `https://…` 外链，或直接拖拽上传（≤4MB 的常见图片格式，存进数据库）。
- 左下角 **Download React Router project** 可下载 Netlify 版完整工程 zip。

## 6. 生产部署

### 方案 A：Netlify（静态站点式运维，推荐给纯展示场景）

1. 进 `/admin` 下载 `portfolio-react-router.zip`（或用本仓库
   `export/react-router/` 目录），推到 GitHub。
2. Netlify “Import project”：构建命令 `npm run build`，
   发布目录 `build/client`（`netlify.toml` 已写好）。
3. 环境变量必须设置 `ADMIN_PASSWORD`（建议同时设 `ADMIN_SECRET`
   为随机串）。
4. 上线后打开 `https://<站点>/admin` 登录、编辑、发布。
   内容与图片存在 Netlify Blobs（`portfolio-content` /
   `portfolio-media`，首次保存自动创建），不占仓库体积。
5. 本地预演 Netlify 版：解压后 `npm install` → 写 `.env`
  （演示模式不需要 ADMIN_PASSWORD）→ `npm run dev`（5173 端口）。

### 方案 B：VPS / 自有服务器（本 Next.js 工程直跑）

```bash
npm install && npx drizzle-kit push && npm run build
PORT=3000 npm start
```

配合 systemd 守护 + Nginx/Caddy 反向代理 + HTTPS 证书即可。
要点：

- 生产 `.env` 必须有真实的 `DATABASE_URL`、`ADMIN_PASSWORD`（强密码）、
  建议再加 `ADMIN_SECRET`。
- `media_assets` 存图片二进制，定期 `pg_dump` 即完成备份；
  文案另有后台 **Data → Export JSON** 可导出归档。
- `NODE_ENV=production` 下 Next.js 自动优化；健康检查 `GET /api/health`
 （连库成功返回 `{ok:true}`），可接入监控。

## 7. 故障排查

| 现象 | 排查 |
|---|---|
| `/admin` 登录页提示密码错误 | 无数据库时 `/admin` 直接进入；正式模式用 `ADMIN_PASSWORD` 或首次设置时输入的密码；输错会等约 0.6s 才返回（防爆破延时） |
| `/api/status` 显示 demo 但已配置数据库 | 连接串变量名必须是被识别的五个之一；改完环境变量需重启/重新部署；看 `error` 字段的具体报错 |
| `/admin` 登录后一直转圈 | 内容接口不可达：看页面错误提示 + 终端日志；确认 `DATABASE_URL` 连通且已 `npx drizzle-kit push`，点 Retry 重试 |
| 改了 `defaults.ts` 首页没变化 | 首页优先读数据库存量：进后台 Data 页 Publish，或 Restore defaults 后重发 |
| 登录后 Publish 报 `Storage unavailable` | `DATABASE_URL` 不通或表不存在：先 `psql` 自测，再 `npx drizzle-kit push` |
| 首页图片 404 | `public/` 下文件是否在（`ls public/images`）；后台上传的图走 `/api/media/:id`，确认登录态 cookie 正常写入（上传接口要登录） |
| `npm run build` 报 chunk/load 错误 | 删 `.next` 重 build；确认构建与运行是同一份 `.next`（不要旧服务进程 + 新构建目录混用） |
| 端口被占 | `PORT=xxx npm start`；或查占用进程后重启 |
| GSAP 动画不动 / 控台报错 | 先确认 `gsap` 版本为 3.15（`package.json` 已 pin）；移动端（<768px）是原生滚动 + 简化编排，属设计如此 |
| 忘记后台密码 | 服务器上改 `.env` 的 `ADMIN_PASSWORD` 并重启；无数据库时直接进入；正式模式可改 `ADMIN_PASSWORD` |

仍未解决？按 `docs/ROADMAP.md` 顶部的“问题反馈格式”记录现象、
复现路径与截图，便于定位。
