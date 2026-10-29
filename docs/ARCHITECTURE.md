# 架构说明与本轮重构记录

## 1. 对原仓库（BrainEno/portfolio-template）的结构审查

| # | 发现 | 问题 | 处理 |
|---|---|---|---|
| 1 | `export/react-router/` 整套第二份工程 + `scripts/build-export.mjs` + 后台「下载 zip」 | 同一产品两套入口、`src/portfolio` 靠脚本拷贝，易漂移；Netlify 其实能直接跑 Next | **删除**，Next 工程原生适配 Netlify/Cloudflare/VPS |
| 2 | `/adam` 只读预览路由（笔误产生） | 与 `/admin` 重复、`preview` 分支污染 `AdminApp`/`ModeBar` | **删除**路由与全部 `preview` 分支；`/admin` 自身即演示入口 |
| 3 | `server/db.ts` 465 行 | 平台识别、连接串、DDL、Postgres 存储、演示存储、探测、密码全混在一起 | 拆为 `types / state / connection / storage / backend` |
| 4 | `server/api.ts` 314 行 | content、upload、media、session、backup、status 处理函数混写 | 拆为 `http / content-handlers / session-handlers / backup-handlers / status-handler`，`api.ts` 仅做出口，路由文件不变 |
| 5 | `admin/AdminApp.tsx` 972 行 | 字段组件、各页签、数据面板、登录、壳在一个文件 | 拆为 `shared / fields / editor / DataPanel / Login / AdminApp` |
| 6 | `src/db/index.ts` 无 `DATABASE_URL` 就 `throw` | 与「无数据库也能跑」矛盾，且运行时并未使用 drizzle 客户端 | 删除；`src/db/schema.ts` 保留为 drizzle-kit 的表定义来源 |
| 7 | `drizzle.config.json` 写死本机连接串 | 换机器就失效 | 改 `drizzle.config.ts`，读 `DATABASE_URL` |
| 8 | 字体：首页与后台各自 `@font-face`、Google Fonts `<link>` 阻塞渲染、`/fonts` 文件不存在导致 404 | 两处字体可能不一致 | 统一到 `globals.css` 的 `--font-sans/--font-serif/--font-cjk`；Inter / Inria Serif 用 `next/font` 构建期自托管 |
| 9 | 公共图片资源（`public/`）未提交 | 下载代码后图裂 | 补全 `public/images`（公开授权照片 + 矢量电视机/电话亭，生成脚本 `scripts/art`） |
| 10 | 在 Workers 之外也 `import("@opennextjs/cloudflare")` | Node 上白白加载 | 仅在 `navigator.userAgent === "Cloudflare-Workers"` 时导入 |
| 11 | 内网库（`db` 主机名 / `sslmode=disable`）会被强制 TLS | docker-compose 连不上 | 新增 `isPlainTcp` 判定 + `DATABASE_SSL=false` |
| 12 | 无 sitemap/robots/manifest/离线 | SEO、PWA 缺失 | 见第 3、4 节 |

保持不变（审查后认为合理）：`src/portfolio` 作为与路由解耦的领域模块；`content/` 作为唯一内容契约；
首页「服务端读内容 → 客户端编排」；运行时自动建表；Netlify 迁移文件。

## 2. 当前结构与数据流

```
浏览器 ── / ──► page.tsx ─ loadContent() ─► storage.readContent()
                              │                 ├─ Postgres(site_content)         [Live]
                              │                 └─ 内存默认值 defaultContent(mock) [Demo]
                              └► Portfolio(content, mode)
                                    └ Demo 模式下 useLiveContent 订阅 localStorage 草稿(BroadcastChannel)
/admin ──► AdminApp ─ /api/session ─► Live: Cookie 会话 · Demo: 直接放行(数据只在本浏览器)
          编辑 ─► Live: PUT /api/content (发布)   Demo: saveDemoContent (400ms 自动写缓存 → 首页实时变)
```

- **模式判定**（`server/backend.ts#probeBackend`，15 s 缓存）：能连库并读到表 → `postgres`；否则 `demo`。
  一旦 `postgres`，`getStorage()` 只返回数据库存储，浏览器草稿与 mock 不再被读取——即**自动废除假数据**。
- **连接解析**（`server/connection.ts`）：Cloudflare Hyperdrive → Cloudflare 变量 → `process.env` 多个键 → `@netlify/database`。
- **建表**（`server/storage.ts#ensureSchema`）：Netlify 校验迁移已执行；其他平台 `create table if not exists`。

## 3. SEO

- `layout.tsx`：`metadataBase`、title 模板、description、Open Graph / Twitter 卡片、`lang`（随默认语言 zh-Hans / en）、robots、canonical、`themeColor`。
- `page.tsx`：JSON-LD（WebSite + Person + 每个作品 CreativeWork）；内容经 SSR 输出，爬虫无需执行 JS 即可读取全部文案。
- `/works/[id]`：每个作品独立可收录页面（标题、详情介绍、详情图、BreadcrumbList）。
- `robots.txt`、`sitemap.xml`（含全部作品页）、`manifest.webmanifest`、`icon.svg`、`apple-icon.png`——均由数据库内容生成。
- `/admin`、`/api`、`/offline` 设为 noindex / Disallow。
- 站点 URL 自动取自 `NEXT_PUBLIC_SITE_URL` 或各平台注入变量（`seo/site.ts`）。

## 4. PWA / 离线

`public/sw.js`（无构建依赖）：

| 请求 | 策略 |
|---|---|
| `/_next/static`、`/images`、`/fonts`、`/icons`、`/api/media/*` | cache-first |
| 页面导航 | network-first → 缓存副本 → `/offline` |
| `/api/content`（GET）、manifest | network-first，离线读缓存 |
| `/admin`、其他 `/api/*`、非 GET | 不缓存 |

`PwaRegister` 仅在生产构建注册；开发模式反而会注销旧 SW。manifest 提供 192/512/maskable 图标与快捷方式，可安装为桌面应用。
更新缓存：修改 `sw.js` 的 `VERSION`。

## 5. 图片「画框」约定（换图不用管尺寸）

Hero、肖像（含重影层）、画廊、两张点缀图、电视封面、作品详情页的所有图片都放在**设计固定尺寸的容器**中，
`<img>` 绝对定位铺满、`object-fit: cover`、`max-width: none`，容器带 `overflow:hidden; contain: layout paint`。
因此任意比例/像素的新图都只会被裁切，不会改变容器尺寸、不会触发回流，GSAP 时间线的测量值不变。
电话亭为透明抠图，使用 `object-fit: contain`。

## 6. 转场与 Contact 区动效

**空白转场**：以前 `tv-exit-spacer` 结束后 contact 才进入，电视放大 + 白场阶段约 0.5 屏滚动是纯白空页。现在：

- `.contact` 用 `margin-top: -28vh`（移动端 -20vh）上拉，叠在电视退场段之上，带圆角前沿和上投影——像一张「纸」从下方升起盖住仍在放大的电视；
- 标题行 `.contact-line-text` 的入场触发点从 `top 78%` 提前到 `top 96%`，纸一露头就开始自下而上的 `yPercent` 入场；
- 电视的白场（whiteout）仍在后台完成，视觉上被上升的 contact 接管，不再有「等待」。

**电话亭 3D**（仅 Contact，`scroll/choreography.ts#contact`）：绑定滚动的 scrub 时间线——
从远处 `scale .55 · z -260 · rotationY -46° · rotationX 12°` 摆入，缓出到正面，随后轻微过冲（`scale 1.06 · rotationY 7°`）再停住；
接地阴影同步变宽，标题组做反向视差（`y 9vh → -3vh`）。鼠标拖拽的 perspective 旋转与悬停木纹保留在内层，互不冲突。
`prefers-reduced-motion` 下跳过 3D，仅静态显示。

## 7. 已知限制 / 后续

- 后台界面文案为英文（含少量中文提示）；多语言化可在 `admin/` 内集中处理。
- 电视机与电话亭为矢量原创插画，可在 Television 页签校准玻璃位置后替换为自己的照片。
- 首位访问 `/admin` 的人设置密码：生产环境请在部署后立即访问，或设置 `ADMIN_PASSWORD`。
- Aeonik 为商业字体，未随仓库分发；放入本机或自行添加 `@font-face` 源即可，缺省回退 Inter。
