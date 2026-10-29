# 零基础部署指南（Netlify + PostgreSQL）

这份文档面向**第一次部署网站的人**。照着做即可上线，全程不需要写代码，
也不需要在本机安装数据库。

部署完成后你会得到：

| 页面 | 作用 |
|---|---|
| `/` | 作品集首页（滚动动画、电视机作品列表） |
| `/admin` | 后台：改文案、改 works 条目、改图片链接、上传图片、发布 / 备份 |
| `/adam` | 同一个后台的**只读**预览：不登录、不改数据，只看结构；连库后自动改为 Live 提示页 |

---

## 0. 先理解三个概念（30 秒）

1. **临时演示模式（浏览器缓存）**：没有连数据库时，后台用示例数据（mock）
   启动，无需密码（直接进入）。你在 `/admin` 里的每处改动都会自动存进**本浏览器的
   localStorage**，并立刻同步到首页（同标签页用状态、跨标签页用
   BroadcastChannel/storage 事件），所以可以直接看到实时效果，刷新也不丢。
   但数据只在这台设备这个浏览器里；换设备/清缓存会消失。
2. **正式模式**：一旦检测到可用的 PostgreSQL（成功连接 + 读到表），
   浏览器 mock data **自动失效**，示例假数据 **自动退场**，所有内容改为从数据库读取。
3. **自动建表**：程序第一次成功连库时会自己创建需要的三张表
   （`site_content` / `media_assets` / `admin_settings`），
   你**不需要**执行任何 SQL 或迁移命令。

---

## 1. 把代码放到 GitHub（约 3 分钟）

- 新建一个空仓库（Private 也可以）。
- 把本项目完整上传（网页上传或 `git push` 均可）。
- **不要**上传 `node_modules` 和 `.env`（仓库里的 `.gitignore` 已忽略它们）。

---

## 2. 在 Netlify 创建站点（约 3 分钟）

1. 打开 <https://app.netlify.com>，用 GitHub 账号登录。
2. 点 **Add new project → Import an existing project → GitHub**，
   选中你刚推上去的仓库。
3. 构建设置保持默认（仓库里的 `netlify.toml` 已经写好）：
   - Build command：`npm run build`
   - Publish directory：`build/client`
4. 先点 **Deploy**。首次部署即使没有数据库也能成功——站点会以演示模式运行。

> 说明：本仓库里 `export/react-router/` 是 Netlify 专用的 React Router 版本。
> 想直接用它部署，就把该目录作为仓库根目录（或把它单独推一个仓库），
> 步骤与本文件完全一致，构建命令同样是 `npm run build`，发布目录 `build/client`。

---

## 3. 给站点加一个 PostgreSQL 数据库（约 2 分钟）

### 方案 A（推荐，最简单）：Netlify Database

1. 打开你的站点 → **Project configuration**（或 Site configuration）。
2. 左侧找到 **Database**（部分界面在 **Extensions → Netlify Database**）。
3. 点 **Create database / Enable**，等状态变成 **Active**。
4. **不需要**复制任何连接串——Netlify 会在运行时自动注入
   `NETLIFY_DB_URL`，本项目会自动读取它。
5. 回到 **Deploys** 点 **Deploy site / Trigger deploy** 重新部署一次。

> Netlify Database 会在部署时准备好数据库。首次访问 `/admin` 时，
> 程序会自动建表；如果提示连接失败，等 30 秒再刷新（数据库刚创建需要预热）。

### 方案 B：任意 PostgreSQL（Neon / Supabase / RDS / 自己的服务器）

1. 在服务商后台创建一个空数据库，拿到连接串，形如：
   `postgresql://user:password@host:5432/dbname?sslmode=require`
2. Netlify 站点 → **Project configuration → Environment variables → Add a variable**
   - Key：`DATABASE_URL`
   - Value：上面那串连接串
3. 重新部署一次。

程序按以下顺序读取连接串，**任意一个存在即可**：

```
DATABASE_URL → NETLIFY_DB_URL → NETLIFY_DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL
```

> 云数据库注意：连接串里如果没写 `sslmode=require`，
> 程序对非本机地址会自动启用 SSL（`rejectUnauthorized: false`）。

### 判断是否已连接

浏览器打开：

```
https://你的域名/api/status
```

看到 `"mode": "postgres"`、`"connected": true` 就说明已进入正式模式。

---

## 4. 设置后台密码（约 1 分钟）

正式模式下有两种设置方式，任选其一：

### 方式 1：首次进入时直接设置（适合新手）

1. 打开 `https://你的域名/admin`。
2. 页面会显示 **Set password & enter**：输入两次新密码（≥6 位）。
3. 密码会以加盐哈希存入数据库的 `admin_settings` 表，之后用它登录。
4. 从这一刻起，后台开始使用正式密码保护。

### 方式 2：用环境变量（适合多环境/团队）

Netlify → **Environment variables** 新增：

| Key | Value | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 你的强密码 | 设置后，数据库内的密码被忽略 |
| `ADMIN_SECRET` | 一串随机字符串（可选） | 用于签名登录 Cookie，修改后所有人需重新登录 |

然后重新部署。

> 忘记密码怎么办？
> - 如果用的是 `ADMIN_PASSWORD`：在 Netlify 改这个变量即可。
> - 如果用的是方式 1：在数据库执行
>   `delete from admin_settings where key = 'admin_password';`
>   然后重新打开 `/admin`，会再次出现设置密码界面。

---

## 5. 开始编辑内容（这就是你的日常）

打开 `https://你的域名/admin`，左侧 9 个页签：

| 页签 | 能改什么 |
|---|---|
| Identity | 名字、浏览器标题、SEO 描述、顶部导航文案（中英双语） |
| Hero | 首页三个旋转大词、主视觉图片 |
| Biography | 简介标题、肖像图、肖像署名、两段正文 |
| Gallery | 画廊横滑图片（可增删、排序） |
| Works | **作品条目**：标题、年份/开始日期、技术栈、电视机里显示的图片 |
| Television | 电视机素材、画面宽高、**玻璃位置校准**（红色框对齐屏幕） |
| Contact | 邮箱、联系方式、三行大字、跑马灯、电话亭图片、版权、署名 |
| Theme | 舞台底色、强调色 |
| Data | 导出/导入 JSON、恢复默认内容 |

**改 works 条目（你最常用的）**

1. 左侧点 **Works**。
2. 每个条目可改：`Title`（中/英）、`Year`（这里是仓库开始日期，如 `2026.04.22`）、
   `Credit / venue`（这里是技术栈，如 `Flutter · Dart · 本地優先`）、`Slug`（唯一 ID）。
3. `Image shown on the television`：
   - 点缩略图 → 选本地图片上传（≤4MB，png/jpg/webp/gif/avif/svg）；
   - 或直接在输入框填链接：`/images/works/xxx.webp`（仓库内文件）
     或 `https://…`（外部图床）。
4. 右上角 **Publish**（或 `Ctrl/⌘ + S`）保存。刷新首页即可看到效果。

> 数据去哪了？
> - 正式模式：`site_content` 表（内容）+ `media_assets` 表（上传的图片二进制）。
>   换浏览器、换设备、清缓存都不会丢。
> - 演示模式：内存，重启即恢复示例内容。

**图片建议**：电视机画面是横屏 16:9 ~ 4:3 之间最稳；
建议宽度 1200–1600px、WebP/JPEG。上传的图片通过 `/api/media/<id>` 提供，
带一年缓存头。

---

## 6. 上线前检查清单

- [ ] `/api/status` 返回 `"mode":"postgres"`、`"connected":true`
- [ ] `/admin` 已设置你自己的密码（已设置自己的正式密码）
- [ ] `/adam` 已显示 **Live** 且暂时预览停用
- [ ] 首页三段文字、五个 works 条目、联系方式都是你的信息
- [ ] 手机打开一次，确认横向画廊与电视机动画正常
- [ ] （可选）`ADMIN_SECRET` 已设置，团队/多设备登录更安全

---

## 7. 排错表

### 浏览器缓存演示模式要记住三点

1. 数据在 `localStorage` 的 `pf.demo.content.v2`，换浏览器/设备看不到。
2. 演示模式上传图片会转成 data URL 内嵌，单个上限约 1.4MB；更大请用图片链接，
   或直接连数据库。
3. 连上 PostgreSQL 的瞬间，演示缓存**自动失效**（首页与后台都改读数据库），
   所以在正式上线前，请先在 **Data → Download demo backup** 下载备份，
   连库后在 **Data → Restore backup** 一键导入，内容不会丢。

---

## 6.5 一键备份与迁移

后台 **Data** 页签提供四种能力：

| 按钮 | 说明 |
|---|---|
| **Download full backup / Download demo backup** | 生成 `portfolio-backup-YYYY-MM-DD.json`：包含整站内容 + 数据库里所有被引用的图片（base64 内嵌）。演示模式只含内容（图片本身已是内联 data URL） |
| **Restore backup** | 上传备份文件：正式模式写回数据库（含图片，`/api/media/<id>` 链接保持有效），演示模式写回浏览器缓存 |
| **Export content JSON** | 只导出文案结构，适合人工比对/版本管理 |
| **Import content JSON** | 导入纯内容 JSON（图片仍需链接有效） |

迁移到另一个 Netlify 站的流程：

1. 旧站 `/admin → Data → Download full backup`。
2. 新站连好数据库（下一节），打开 `/admin` 设好密码。
3. `Data → Restore backup` 选择刚才的文件 → 完成，图文一起搬过去。

备份文件名带日期；建议每次大改前下载一份，等同版本快照。

---

| 现象 | 原因与处理 |
|---|---|
| `/api/status` 里 `mode` 还是 `demo` | 没有读到连接串：方案 A 确认数据库状态 Active 并**重新部署**；方案 B 确认变量名是 `DATABASE_URL` 且已 redeploy（环境变量改动必须重新部署才生效） |
| `connected: true` 但 `error` 有内容 | 数据库可达但建表被拒：确认数据库用户有 `CREATE TABLE` 权限；托管数据库请关闭「仅允许 IP 白名单」或加入 Netlify 出口 |
| 打开 `/admin` 一直转圈 | 打开 `/api/status` 看错误；点页面上的 Retry；查看 Netlify → Deploys → Functions 日志 |
| 登录提示密码错误 | 无数据库时不需要密码；正式模式使用 `ADMIN_PASSWORD` 或首次设置时输入的密码；忘了见第 4 节 |
| 发布报 `Storage unavailable` | 连接串失效/数据库暂停（免费套餐会休眠）。恢复数据库后重试 |
| 上传图片失败 | 图片 >4MB 或格式不支持；换图或压缩后重试 |
| 改了文案首页没变化 | 首页读数据库存量。确认点过 Publish，并确认改的是当前站点对应的数据库 |
| `/adam` 变成 Live 页面 | 这是预期行为：连库后临时预览自动停用，请改用 `/admin` |

需要更细的本地运行/自建服务器说明：见 `docs/SETUP.md`；
后续功能计划与已知问题：见 `docs/ROADMAP.md`。
