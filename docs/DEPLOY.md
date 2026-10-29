# 部署指南（VPS · Netlify · Cloudflare · Vercel · Railway/Render/Fly）

同一份代码适配所有平台：程序启动时**自动识别平台、自动找数据库连接串、自动建表**。
没配数据库也能部署成功——站点以演示模式运行，`/admin` 直接可用；配好后**重新部署/重启一次**即进入正式模式。

## 环境变量总表

| 变量 | 必需 | 说明 |
|---|---|---|
| `DATABASE_URL` | 否* | PostgreSQL 连接串 `postgresql://用户:密码@主机:5432/库名`。*不配 = 演示模式 |
| `NETLIFY_DB_URL` `POSTGRES_URL` `POSTGRES_PRISMA_URL` `SUPABASE_DB_URL` `NEON_DATABASE_URL` `RAILWAY_DATABASE_URL` | 否 | 平台自动注入的同类变量，任意一个即可（按此顺序在 `DATABASE_URL` 之后查找） |
| `DATABASE_SSL=false` | 否 | 内网/容器数据库关闭 TLS（`localhost`、`db` 这类无点主机名与 `sslmode=disable` 已自动关闭） |
| `ADMIN_PASSWORD` | 否 | 固定后台密码。留空：**第一个**打开 `/admin` 的人设置密码 → **部署后请立刻自己先打开一次 `/admin`** |
| `ADMIN_SECRET` | 否 | 会话 Cookie 签名密钥（随机长字符串；更换会让所有人退出登录） |
| `NEXT_PUBLIC_SITE_URL` | 建议 | 站点公网地址，用于 canonical、sitemap、分享图。Netlify/Vercel/Cloudflare Pages/Render 会自动识别 |

连接顺序：`DATABASE_URL → NETLIFY_DB_URL → NETLIFY_DATABASE_URL → POSTGRES_URL → …`；Cloudflare 优先用 `HYPERDRIVE` 绑定。

**怎么确认已连上？** 打开 `https://你的域名/api/health`：`"mode":"postgres","database":"connected"` 即正式模式；
`/api/status` 还会显示平台与连接来源。

---

## 1. VPS / 自有服务器（推荐：Docker）

要求：一台 Linux 服务器（1 核 1 GB 起）、能 SSH。**已含 PostgreSQL，数据在 Docker 卷里。**

### 一键（全新 Ubuntu / Debian，root）

```bash
# 有域名（先把域名 A 记录解析到服务器 IP）→ 自动 HTTPS
curl -fsSL https://raw.githubusercontent.com/BrainEno/portfolio-template/main/scripts/vps-install.sh | DOMAIN=example.com bash
# 没有域名 → 访问 http://服务器IP:3000
curl -fsSL https://raw.githubusercontent.com/BrainEno/portfolio-template/main/scripts/vps-install.sh | bash
```

### 已 clone 代码的机器

```bash
bash scripts/deploy.sh docker                     # http://IP:3000
DOMAIN=example.com bash scripts/deploy.sh docker  # https://example.com （Caddy 自动签证书）
```

脚本做的事：随机生成 `POSTGRES_PASSWORD`、`ADMIN_SECRET` 写入 `.env` → `docker compose up -d --build`（web + postgres [+ caddy]）。
然后**马上打开 `/admin` 设置密码**。

日常：`docker compose logs -f web` 看日志；更新：`git pull && docker compose up -d --build`；
整库备份：`docker compose exec db pg_dump -U portfolio portfolio > backup.sql`。

### 不用 Docker（Node + PM2 / systemd + Nginx）

```bash
bash scripts/deploy.sh node          # npm ci → build → PM2 启动在 3000 端口
```

数据库可用服务器本机 PostgreSQL 或云数据库，把 `DATABASE_URL` 写进 `.env`。
反向代理示例：`deploy/nginx.conf.example`（再 `certbot --nginx -d example.com` 上 HTTPS）；
systemd 示例：`deploy/portfolio.service.example`。

---

## 2. 本地 → 线上的最短路径

1. 本地 `npm run dev`，在 `/admin` 里编辑（演示模式或本地 Postgres 都行）。
2. Data → **Download full backup / demo backup**。
3. 线上部署完成、第一次进入 `/admin` 设好密码 → Data → **Restore backup**。

---

## 3. Netlify

1. 代码推到 GitHub → Netlify **Add new project → Import from Git**。`netlify.toml` 已写好（`npm run build` + `@netlify/plugin-nextjs`），直接 Deploy。
2. 站点 **Project configuration → Database**（或 Extensions → Netlify Database）→ **Enable / Create**。
   Netlify 会注入 `NETLIFY_DB_URL`，**无需复制连接串**。建表走仓库里的
   `netlify/database/migrations/*.sql`，部署时自动应用。
   （用 Neon/Supabase 等：改为添加环境变量 `DATABASE_URL`。）
3. **Deploys → Trigger deploy** 重新部署一次，访问 `/api/health` 确认 `connected`。
4. 打开 `/admin` 设置密码。

命令行方式：`bash scripts/deploy.sh netlify`。

## 4. Cloudflare Workers（OpenNext）

配置已就绪：`open-next.config.ts`、`wrangler.jsonc`（`nodejs_compat`，已验证 `opennextjs-cloudflare build` 与 `wrangler deploy --dry-run` 通过）。

```bash
npm install
npx wrangler login
npm run cf:preview     # 本地用 workerd 预览（可选）
npm run cf:deploy      # 构建并部署
```

连接 PostgreSQL（二选一）：

- **简单**：`npx wrangler secret put DATABASE_URL`（粘贴连接串；数据库须允许公网访问并启用 TLS，Neon / Supabase 均可）。
- **推荐（更快更稳）**：创建 Hyperdrive：`npx wrangler hyperdrive create portfolio-db --connection-string="postgresql://…"`，
  把返回的 id 按 `wrangler.hyperdrive.example.jsonc` 加到 `wrangler.jsonc`。程序自动优先使用 `HYPERDRIVE.connectionString`。

可选密钥：`npx wrangler secret put ADMIN_PASSWORD`，`npx wrangler secret put ADMIN_SECRET`。
Cloudflare **不能**连接 `localhost` 数据库；用云数据库或你 VPS 上暴露的 Postgres。
命令行一键：`bash scripts/deploy.sh cloudflare`。

## 5. Vercel / Railway / Render / Fly

| 平台 | 做法 |
|---|---|
| Vercel | 导入仓库（框架自动识别 Next.js）。Storage → 添加 Postgres（会注入 `POSTGRES_URL`）或自填 `DATABASE_URL`。`bash scripts/deploy.sh vercel` |
| Railway | New → Deploy from GitHub，再 **Add PostgreSQL**；把 `DATABASE_URL` 引用设为 `${{Postgres.DATABASE_URL}}`。仓库带 `Dockerfile`，也可直接用 |
| Render | New Web Service（Docker 或 Node：Build `npm ci && npm run build`，Start `npm start`），再建 PostgreSQL，把 *Internal Database URL* 填到 `DATABASE_URL` |
| Fly.io | `fly launch`（识别 Dockerfile），`fly postgres create && fly postgres attach`，`DATABASE_URL` 自动注入 |
| Coolify / CapRover / 宝塔 | 用 Dockerfile 或 `docker-compose.yml` 导入 |

---

## 6. 数据库迁移 / 备份

| 需求 | 方法 |
|---|---|
| 换平台、换库（含图片） | 后台 Data → Download full backup → 新站 Restore backup（图片 id 保持，`/api/media/<id>` 不变） |
| 整库 | `pg_dump "$DATABASE_URL" > backup.sql` / `psql "$NEW_DATABASE_URL" < backup.sql` |
| 手动建表（可选） | 程序自动建表；也可 `npm run db:push`，或执行 `netlify/database/migrations/*.sql` |
| 重置密码 | `psql "$DATABASE_URL" -c "delete from admin_settings where key='admin_password'"` |

三张表：`site_content`（整站 JSON）· `media_assets`（上传图 bytea）· `admin_settings`（密码哈希）。

## 7. 排错

| 现象 | 原因 / 处理 |
|---|---|
| 部署成功但 `/admin` 显示 Demo mode | 没读到连接串或连不上。看 `/api/status` 的 `error`；改完变量要**重新部署/重启** |
| `self-signed certificate` / SSL 报错 | 云库默认已兼容；若是内网库加 `DATABASE_SSL=false` |
| Netlify：`migrations have not created …` | 确认仓库里有 `netlify/database/migrations`，重新部署 |
| Cloudflare：连接超时 | 库不允许公网访问，或用了 `localhost`；改 Hyperdrive / 云库 |
| 上传返回 413 | 反向代理限制体积：Nginx 加 `client_max_body_size 16m;` |
| 更新后页面还是旧的 | Service Worker 缓存：硬刷新一次，或改 `public/sw.js` 里的 `VERSION` |
