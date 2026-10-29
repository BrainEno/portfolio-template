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
电话亭改为 WebGL 模型（见第 6 节），模型未就绪时用透明抠图 `/images/phone-booth-cutout.png` 兜底，`object-fit: contain`。

## 6. 转场与 Contact 区动效

**电视退场 → 白场**（`scroll/choreography.ts#television` 的 `exitTl`，全部绑定滚动 scrub）：
`@BrainEno` 字样先放大（模拟镜头推进）并虚化消失，随后独立的 `.tv-scanlines` 条纹层淡出（条纹滤镜「消失」）、
玻璃光泽层 `.tv-glass` 退场，屏幕渐变切换到 `SCREEN.white`，`.tv-whiteout` 在第 30% 处开始铺满整屏。
白场在退场段 60% 前完成，而此时 contact 前沿还在视口下方约 30vh——交接是「白对白」，没有卡片滑动感。

**Contact 出现**：`.contact` 仍用 `margin-top: -28vh`（移动端 -20vh）上拉叠在退场段之上，但**不再有圆角前沿与上投影**
（原先那张「纸」的边界看起来割裂），`.contact` 与 `.contact-inner` 也不做 `overflow: hidden`——因为电话亭的起点在
section 上沿之外的电视屏幕里。

**电话亭（3D 模型）**：
- `public/gltfs/telephone.glb` 由 `scripts/optimize-booth-model.py` 从原始 `telephone.gltf`（38 MB，buffer 以 base64 内嵌）生成：
  几何数据原样保留，9 张 2048² PNG 纹理重编码为 baseColor 1024² / normal 1024² / metallicRoughness 512² JPEG，产物约 2.15 MB。
- `ui/PhoneBoothModel.tsx` 在 contact 进入前 1.5 屏时（IntersectionObserver + 动态 `import()`）才去加载 `three` 与模型，
  因此首屏不含 three；离开视口或标签页隐藏时暂停渲染循环；加载失败 / 无 WebGL 时回落到抠图。
- `three/booth.ts` 负责舞台：PMREM 房间环境光 + 三点布光、按包围盒归一化（脚底落在 y=0、高度缩放为 1）、
  缓慢自转（`0.42 rad/s`）、鼠标拖拽加减速、`ResizeObserver` 重新取景。
- `scroll/choreography.ts#contact` 的 scrub 时间线驱动外层 `.contact-booth`：起始 `scale .035 · z -420 · autoAlpha 0`，
  位置经 `fromScreen()` 计算到**视口中心**（即电视刚刚烧白的那个点），随后放大、一次性旋转 `-360°`（`rotationY` 全周）、
  落到右栏，再持续向左漂移 `-5vw`；标题组做反向视差。两者分工：GSAP 管外层变换，渲染器管内层自转与拖拽，互不打架。
- `prefers-reduced-motion` 下跳过入场时间线，模型静态显示且不自转。

## 7. 已知限制 / 后续

- 后台界面文案为英文（含少量中文提示）；多语言化可在 `admin/` 内集中处理。
- 电视外框为矢量原创插画，可在 Television 页签校准玻璃位置后替换为自己的照片；电话亭为上传的 glTF 模型。
- 仓库同时保留原始 `telephone.gltf`（38 MB）与优化后的 `.glb`（2.15 MB），只有 `.glb` 参与运行时加载；
  若不需要再修改模型，可移除原始 `.gltf` 以减小仓库体积。
- 首位访问 `/admin` 的人设置密码：生产环境请在部署后立即访问，或设置 `ADMIN_PASSWORD`。
- Aeonik 为商业字体，未随仓库分发；放入本机或自行添加 `@font-face` 源即可，缺省回退 Inter。
