# 多平台部署与迁移手册

本项目的同一套内容/API 可以运行在：

- **Netlify**（Next.js Runtime + Netlify Database；推荐小白）
- **Cloudflare Workers**（OpenNext；可用任意 Postgres，推荐 Hyperdrive）
- **Vercel**（Next.js 原生 + 任意 Postgres）
- **Railway / Render / Fly.io / VPS / Docker**（Node.js + 任意 Postgres）

不连接数据库也能完整打开 `/admin`：后台直接显示 mock data，编辑内容写入
浏览器 localStorage，并通过 BroadcastChannel 实时同步到首页。**不需要临时密码。**
数据库一旦成功连接，缓存草稿自动退出，后台切换为数据库数据和密码保护。

---

## 一、5 分钟部署到 Netlify（最适合第一次部署）

### 1. 推送代码

把整个项目推送到 GitHub。不要提交 `.env`（已被 `.gitignore` 忽略）。

### 2. 导入站点

1. 登录 <https://app.netlify.com>。
2. **Add new project → Import an existing project → GitHub**。
3. 选仓库后直接部署。项目根目录的 `netlify.toml` 已配置：
   - Build command：`npm run build`
   - Publish：`.next`
   - Next.js Runtime plugin

没数据库也不会失败；部署后 `/admin` 可直接查看和编辑，数据只在当前浏览器。

### 3. 创建 Netlify Database

推荐方式（CLI）：

```bash
npm install -g netlify-cli
netlify login
netlify link
netlify database init --yes
```

也可在站点控制台 **Data & Storage → Database → Create database**。

仓库已包含：

```text
netlify/database/migrations/20261029000100_portfolio_schema.sql
```

Netlify 在生产发布前自动执行该 migration。**不要对 `NETLIFY_DB_URL` 运行
`drizzle-kit push` 或手工 CREATE TABLE**，否则会破坏 Netlify 的迁移历史。

项目已安装 `@netlify/database`，Netlify 会自动配置当前生产/预览分支的
`NETLIFY_DB_URL`；不需要复制数据库密码。

### 4. 设置后台密码

两种方式任选一种：

- 不配置环境变量：首次打开 `/admin` 时输入两次新密码；哈希写入数据库。
- Netlify → **Environment variables** 添加：
  - `ADMIN_PASSWORD`：正式密码
  - `ADMIN_SECRET`：随机长字符串（推荐）

重新部署后，浏览器 mock data 自动废除。若演示阶段已编辑内容，先在
**Data → Download demo backup** 下载，再在正式后台 **Restore backup**。

### 5. 验证

打开 `/api/status`，应看到：

```json
{
  "mode": "postgres",
  "platform": "netlify",
  "connected": true
}
```

---

## 二、部署到 Cloudflare Workers

项目已包含并实际通过构建验证：

```text
open-next.config.ts
wrangler.jsonc
wrangler.hyperdrive.example.jsonc
```

### 方式 A：最简单（DATABASE_URL secret）

准备 Neon、Supabase、Railway Postgres 等连接串，然后：

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL
# 按提示粘贴 postgresql://... 连接串
npx wrangler secret put ADMIN_PASSWORD
npx opennextjs-cloudflare build
npx wrangler deploy
```

首次 API 请求会自动创建三张表。`pg` 通过 Cloudflare 的 Node compatibility
运行；项目锁定的 pg 版本满足 Workers 要求（>= 8.16.3）。

### 方式 B：Hyperdrive（生产推荐）

Hyperdrive 管理全球连接池，可避免数据库连接数爆满：

```bash
npx wrangler hyperdrive create braineno-portfolio-db \
  --connection-string="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
```

命令输出一个 Hyperdrive ID。然后：

1. 复制 `wrangler.hyperdrive.example.jsonc` 覆盖 `wrangler.jsonc`。
2. 把 `PASTE_YOUR_HYPERDRIVE_ID_HERE` 替换为刚得到的 ID。
3. 设置密码并部署：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx opennextjs-cloudflare build
npx wrangler deploy
```

运行时优先读取 `env.HYPERDRIVE.connectionString`；Hyperdrive 已经池化，应用侧
会自动把 pool 限制为 1 并让连接快速回收。

本地预览 Hyperdrive 时，修改 example 配置里的 `localConnectionString`。

### Cloudflare 验证命令

```bash
npx opennextjs-cloudflare build
npx wrangler deploy --dry-run
npx wrangler dev
```

本仓库已通过 OpenNext bundle 和 Wrangler dry-run（Worker 约 5.6MB，静态资源
47 个）。

---

## 三、Vercel

1. Vercel → **Add New → Project → Import Git Repository**。
2. Framework 自动识别 Next.js，Build command 用默认值。
3. Settings → Environment Variables 添加：
   - `DATABASE_URL`（Neon / Supabase / Vercel Postgres 等）
   - `ADMIN_PASSWORD`
   - `ADMIN_SECRET`（可选）
4. Redeploy。

程序会自动建表。若使用只允许 SSL 的数据库，连接层会自动启用 SSL。

---

## 四、Railway / Render / Fly.io / 普通 VPS

通用启动命令：

```bash
npm install
npm run build
npm start
```

必须/建议的环境变量：

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
ADMIN_PASSWORD=your-strong-password
ADMIN_SECRET=random-long-string
```

平台识别状态可在 `/api/status` 查看：`railway` / `render` / `fly` / `generic`。

### Docker/VPS 健康检查

```bash
curl https://your-domain.example/api/health
```

即使数据库未连接也返回应用健康状态，并用 `mode: demo` 明确说明；
数据库具体错误在 `/api/status` 的 `error` 字段。

---

## 五、支持的连接变量（按优先级）

```text
Cloudflare HYPERDRIVE.connectionString
DATABASE_URL
NETLIFY_DB_URL
NETLIFY_DATABASE_URL       # 旧 Netlify/Neon 兼容
POSTGRES_URL
POSTGRES_PRISMA_URL
SUPABASE_DB_URL
NEON_DATABASE_URL
RAILWAY_DATABASE_URL
```

所有连接与密码只在服务端读取，不会进入浏览器 bundle。

---

## 六、跨平台迁移（内容 + 图片）

无需 pg_dump，也无需理解 SQL：

1. 旧站 `/admin → Data → Download full backup`。
2. 新平台完成数据库连接，打开 `/api/status` 确认 `connected: true`。
3. 新站 `/admin → Data → Restore backup`。
4. 备份内含整站 JSON 和被引用的数据库图片；恢复时保留 media id，原
   `/api/media/<id>` 链接继续有效。

演示模式迁移到正式模式也完全相同：**Download demo backup → Restore backup**。

---

## 七、常见问题

| 问题 | 解决 |
|---|---|
| `/admin` 打不开/只显示加载圈 | 打开 `/api/session`；无数据库时应显示 `authenticated:true, mode:demo`。清 Netlify/Cloudflare 构建缓存后重部署 |
| 无数据库时为什么没有登录页 | 这是设计：数据只存在当前浏览器，没有服务器数据可保护；连库后自动恢复密码保护 |
| Netlify 连库但提示缺表 | migration 没执行。确认 migration 文件已提交，Clear cache and redeploy；不要手工 push |
| Cloudflare 提示找不到 pg-cloudflare | `next.config.ts` 已显式追踪其 `dist/esm` 文件；确认没有删除 `outputFileTracingIncludes` |
| Cloudflare 数据库连接很多 | 改用 Hyperdrive；项目会自动限制 Worker 侧 pool |
| 上传大图失败 | 跨平台上限为 4MB（兼容最低的 serverless 请求体限制）；先压成 WebP/JPEG 或填写 CDN 图片 URL |
| 换平台后图片 404 | 使用 Data 页的 full backup，而不是纯 content JSON；full backup 才包含数据库图片 |
| 连接数据库后演示改动不见了 | 正常：mock 自动废除。把演示 backup 恢复到数据库即可 |

更详细的内容编辑与本地运行：`docs/SETUP.md`；Netlify 专用入门：
`docs/NETLIFY_DEPLOY.md`；后续计划：`docs/ROADMAP.md`。
