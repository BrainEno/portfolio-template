# 零基础快速上手

> 目标：下载代码 → 本机跑起来 → 进后台改内容。不需要会写代码。

## 1. 准备

只需要 **Node.js 22**（<https://nodejs.org> 下载安装，一路下一步）。
（可选）Docker Desktop：有它可以一条命令得到本地 PostgreSQL；没有也完全能用。

## 2. 跑起来

```bash
git clone https://github.com/BrainEno/portfolio-template.git
cd portfolio-template
bash scripts/setup.sh            # macOS / Linux / Windows(Git Bash 或 WSL)
```

脚本会：安装依赖 → 生成 `.env` → 有 Docker 就启动本地 Postgres → 自检 → 启动开发服务器。

不想用数据库：`bash scripts/setup.sh --no-db`。
不想用脚本：`npm install`，复制 `.env.example` 为 `.env`，`npm run dev`。

Windows 没有 bash？依次运行 `npm install`、`copy .env.example .env`、`npm run dev` 即可。

打开：
- 首页 <http://localhost:3000>
- 后台 <http://localhost:3000/admin>

## 3. 演示模式 vs 正式模式

| | 演示模式（没有数据库） | 正式模式（连上 PostgreSQL） |
|---|---|---|
| 判断方式 | 页面顶部显示 *Demo mode · browser cache* | 显示 *PostgreSQL connected* |
| 进后台 | 直接进入，不要密码 | 第一次：设置密码（≥6 位）；之后用该密码登录 |
| 数据位置 | 浏览器缓存，修改**立刻**反映在首页（可开两个标签页对比） | 数据库，点 **Publish** 发布 |
| mock 数据 | 使用 | **自动作废**（数据库里没有内容时首页用默认模板，一旦发布就只读数据库） |

> 小提示：本地 `.env` 里的 `DATABASE_URL` 连不上时，站点不会报错，而是自动回到演示模式。
> `npm run doctor` 会用人话告诉你当前是哪种模式、缺什么。

### 本地数据库（可选，一条命令）

```bash
docker compose up -d db          # 127.0.0.1:5432，用户/库名 portfolio，密码 portfolio
```

`.env.example` 里的 `DATABASE_URL` 默认就指向它。已有自己的 Postgres？把连接串填进 `.env` 的 `DATABASE_URL` 即可。
**不需要**手动建表——第一次连上时程序自己建（`site_content` / `media_assets` / `admin_settings`）。

## 4. 在后台能改什么

| 页签 | 内容 |
|---|---|
| Identity | 用户名、网站名（浏览器标题）、页面标题、SEO 描述、默认语言 |
| Hero | 首屏三行大标题、主视觉图 |
| Biography | 肖像、**两段简介**（中英） |
| Gallery | 横向画廊图片（增删排序） |
| **Works** | **作品条目：标题 / 日期 / 技术栈 / 电视机里的封面图链接 / 项目链接 / 项目详情介绍 / 详情图片链接**（增删排序） |
| Television | 电视机玻璃位置校准（换电视图时用） |
| Contact | **电话 / 联系方式、邮箱**、联系区标题与跑马灯、电话亭图 |
| Theme | 主题色 |
| Data | **一键备份 / 恢复 / 恢复默认** |

图片字段可以填**链接**（`https://…` 或 `/images/xxx.jpg`），也可以**上传**（正式模式存进数据库，`/api/media/<id>`）。
每个作品都会生成可被搜索引擎收录的详情页：`/works/<id>`。

### 换图不用管尺寸

首页所有图片都放在**固定尺寸的画框**里，用 `object-fit: cover` 裁切：
竖图、横图、方图、超宽图都不会撑开布局或变形，动画和版式保持不变。
想控制裁切重点，选主体居中的图即可。

## 5. 备份与迁移

后台 → **Data**：
- **Download full backup**（演示模式叫 *Download demo backup*）：下载一个 JSON，包含全部内容 + 所有上传到数据库的图片。
- **Restore backup**：在任何一个站点（本机 / Netlify / VPS / Cloudflare）导入，图片链接保持有效。
- 演示模式下做的草稿同样可以导出，再在正式站导入——结构与数据库完全一致。

命令行备份整库：`pg_dump "$DATABASE_URL" > backup.sql`；恢复：`psql "$DATABASE_URL" < backup.sql`。

## 6. 离线查看（PWA）

生产构建（`npm run build && npm start` 或线上）下，浏览器会自动安装 Service Worker：
访问过一次的首页、作品页、图片、字体可离线打开；地址栏出现「安装」图标即可安装为桌面应用。
开发模式（`npm run dev`）不启用，避免缓存干扰调试。

## 7. 常见问题

| 现象 | 处理 |
|---|---|
| `/admin` 要密码但我没设过 | 正式模式第一次会让你**设置**密码；若 `.env` 设了 `ADMIN_PASSWORD`，就用它 |
| 忘记密码 | `psql "$DATABASE_URL" -c "delete from admin_settings where key='admin_password'"`，再访问 `/admin` 重设 |
| 想回到演示模式 | 把 `.env` 里的 `DATABASE_URL` 清空并重启 |
| 端口被占用 | `npm run dev -- -p 3001` |
| 上传提示太大 | 正式模式单图 ≤ 12 MB；演示模式 ≤ 1.4 MB（超出请用图片链接） |
