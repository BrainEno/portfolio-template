# 开发路线（ROADMAP）

本文档归纳当前已知问题与后续开发方向。优先级：P0（上线前必须）→
P1（体验与健壮性）→ P2（长期演进）。反馈新问题时请附：现象截图、
复现路径（URL/滚动位置/语言/桌面或移动端）、控台报错原文。

## 本轮已交付（第六轮，2026-10-29）

1. **多平台运行时数据库解析器**
   - Netlify：官方 `@netlify/database` + `NETLIFY_DB_URL`，使用 committed migration；
   - Cloudflare：OpenNext `getCloudflareContext` 读取 `HYPERDRIVE.connectionString`，
     也支持 `wrangler secret put DATABASE_URL`；Hyperdrive 下 pg pool 自动缩至 1；
   - Vercel / Railway / Render / Fly / generic Node：识别常见 Postgres 变量并自动建表；
   - `BackendStatus` 新增 platform 字段，`/api/status` 可见真实运行平台。
2. **Netlify migration-first**：新增
   `netlify/database/migrations/20261029000100_portfolio_schema.sql`；
   Netlify 环境不再在运行时 DDL，而是验证 migration 已建表，避免 Netlify 迁移历史漂移。
3. **Cloudflare 可部署配置且真实构建通过**：新增 `open-next.config.ts`、
   `wrangler.jsonc`、`wrangler.hyperdrive.example.jsonc`；修复 Next standalone
   漏追踪 `pg-cloudflare/dist/index.js` 的问题（`outputFileTracingIncludes`）。
   `opennextjs-cloudflare build` 与 `wrangler deploy --dry-run` 均通过。
4. **无数据库 `/admin` 直接进入**：`GET /api/session` 在 demo mode 返回
   `authenticated:true`，不再有临时密码门槛；草稿仍只在本浏览器，因此没有服务器数据暴露。
   连库后自动恢复密码保护并忽略 mock/localStorage。
5. **Contact 伪 3D**（仅 contact）：电话亭分成 GSAP 入场 / idle float /
   Pointer Events 拖拽三层 transform；鼠标拖动产生 perspective rotateX/rotateY，
   松手以缓动归正。hover 叠加红木色电话亭副本与 mask 木纹层；标题 hover 改为
   accent 扫描带 + 文字中段错位切片，不再使用整行填红。
6. **任意比例图片稳定层**：hero、肖像、gallery rail、accent image 均由
   固定 frame + `object-fit:cover` + `contain:layout paint` 接管尺寸；用 10:1、1:10、
   1:1 三种测试图替换后，三个 frame 的像素尺寸前后一致。
7. **文档**：新增 `docs/PLATFORM_DEPLOY.md`，覆盖 Netlify、Cloudflare、Vercel、
   Railway、Render、Fly/VPS 与跨平台备份迁移。

## 本轮已交付（第五轮，2026-10-29）

1. **无数据库也能完整用 `/admin`（浏览器缓存演示模式）**
   `src/portfolio/client/demo-store.ts`：草稿写入 `localStorage`，变更通过
   `BroadcastChannel` + `storage` 事件广播；`useLiveContent` 让首页在演示模式下
   渲染草稿并在编辑时实时重渲染（滚动编排按 revision 重算）。
   图片上传在演示模式转为 data URL（单张 ≤1.4MB，超出提示改用链接）。
   连库后首页与后台都改读数据库，演示缓存自动被忽略（已用“陈旧草稿”实测）。
2. **`/adam` 调整为只读预览**
   不写数据、不需要正式密码，用于纯结构查看；连库后变 Live 提示页并引导 `/admin`。
3. **works 条目扩展 + 一键备份迁移**
   `Work` 新增 `url`（项目/仓库链接）、`description`（中英项目详情）、
   `detailImages[]`（详情图）；后台 Works 页签可直接编辑。
   新增 `GET/POST /api/backup`：导出内容 + 所有被引用图片（base64），
   `POST` 时用原 id 写回 `media_assets`，`/api/media/<id>` 链接保持有效，
   实现跨站迁移。`__proto__`/未知字段在 `normalizeContent` 中前向兼容保留。
4. **身份字段补齐**：`identity.siteName`（浏览器标题后缀 / 站点名）可在后台编辑；
   用户名称、电话/联系方式、邮箱、两段简介均可在 Identity / Biography / Contact 编辑。
5. **全站繁体 → 简体**：内容、导航、后台文案（Identity/Nav/设置密码等）全部简体化；
   用繁体专属字表扫描 `src/**/*.{ts,tsx}` 结果为 0 命中。
6. **Contact 区动效增强（仅 contact）**
   - 电话亭：`booth-float` 呼吸浮动 + 接地椭圆阴影（随浮动缩放）+ 玻璃高光扫过；
     指针悬停标题/跑马灯时电话亭轻微倾身（`#contact:has(...)`）。
   - `CALL ME / FOR THE / MARQUEE MOON`：悬停行描边转 accent 并实心化，
     其余行淡出到 0.3，词内 `::after` 重影上移 + 斜切微位移；
     全部 transform 落在 `.contact-line-word`，GSAP 持有的 `.contact-line-text` 不受影响。
   - 修复：JPEG 不透明背景上的 `drop-shadow` 会画出矩形光晕，已移除；
     装饰描边环与画框风格冲突，已删除；`booth-shadow` 改用独立 `scale` 属性，
     避免动画覆盖 hover 位移。

## 本轮已交付（第四轮，2026-10-29）

1. **Netlify Postgres 后端适配（双模）**
   `src/portfolio/server/db.ts` 新增统一数据层：连接串解析（`DATABASE_URL` /
   `NETLIFY_DB_URL` / `NETLIFY_DATABASE_URL` / `POSTGRES_URL` / `POSTGRES_PRISMA_URL`）、
   连通性探测、**自动建表**（`site_content` / `media_assets` / `admin_settings`）、
   Postgres 与内存演示两套 `PortfolioStorage` 实现。
   自动建表意味着技术小白也不需要跑 migration。
2. **连库自动废除临时密码与假数据**
   探测成功 → `mode: "postgres"`：`123456` 立即失效；首次进 `/admin` 走
   “设置正式密码”（scrypt 加盐哈希写 `admin_settings`），或直接用
   `ADMIN_PASSWORD` 环境变量。探测失败/无连接串 → `mode: "demo"`：
   临时密码 + 内存示例数据，顶栏红色 Demo 提示条。
   `/api/status` 暴露当前模式、连接来源、库名与错误，便于排查。
3. **`/adam` 临时预览页**
   演示模式：只读后台结构（示例数据 + `123456` 门禁 + 右下角 Read-only 徽标），
   用于在没有任何数据库时验证 UI；一旦连上 Postgres，`/adam` 自动变为 Live
   提示页并引导到 `/admin`。Next 与 React Router 导出工程各实现一份。
4. **后台视觉与首页统一**
   `admin.css` 引入与首页相同的 Aeonik 字体、纯黑舞台、`#e55139` 强调色、
   白底胶囊选中态、发丝分割线；新增模式条（Demo/Live）、Live 徽标、设置密码面板。
5. **内容替换（不改动任何 UI 与动画）**
   身份 Sydney Zhao → **BrainEno**；hero 三个词换成长度接近的
   Web / Flutter 术语（Web Performance · Flutter · Widget；中文 前端工程 · 跨端 · 組件）；
   两段介绍文案改写为“前端工程师 / UI 设计师 / 自由职业 vibe coder”与
   “AI 时代的品味与取舍”；works 换成 2026 年提交数最高的五个仓库
   （lyric-forge-ktv 569、no-wave 543、remix-partfolio 280、ScribeForge 257、
   win7-book-management 218），日期为仓库开始日期，日期后为技术栈；
   邮箱 → `nodeman24@outlook.com`；联系 handle → `@BrainEno`；版权/署名为 BrainEno。
   works 配图使用各仓库 GitHub OG 卡片（统一处理成显像管色调）。
6. **文档**：新增 `docs/NETLIFY_DEPLOY.md`（零基础部署/首次设密码/改 works/排错表），
   同步更新 `README.md`、`docs/SETUP.md`、`.env.example`。

### 内容替换清单（已生效，均可在 `/admin` 再改）

- 身份：Sydney Zhao → **BrainEno**（左上角、浏览器标题、Page title、版权、署名、肖像署名）。
- Hero 三个旋转词（保持同字族、同字号、同动效，长度与词性尽量对齐原词）：
  `Performance Art → Web Performance`、`Movie → Flutter`、`Drama → Widget`；
  中文：`行為藝術 → 前端工程`、`電影 → 跨端`、`戲劇 → 組件`。
- 简介两段：改为前端工程师 / UI 设计师 / 自由职业 vibe coder，以及
  “AI 时代品味与取舍”的论述（中英同步改写）。
- Works：2026 年提交数最高的五个仓库（数据来自 GitHub API，日期=仓库开始日期，
  分隔符后=技术栈）：lyric-forge-ktv（2026.04.22 / Flutter·Dart·本地优先，569 commits）、
  no-wave（2026.10.24 / TypeScript·pnpm·Node，543）、remix-partfolio
  （2022.11.11 / React Router·GSAP·Netlify，280）、ScribeForge
  （2026.10.02 / Python·Flutter·LLM，257）、win7-book-management
  （2026.09.29 / C#·.NET·WinForms，218）。配图为各仓库 GitHub OG 卡片，
  已统一处理为显像管色调（`public/images/works/*.webp`）。
- 联系：邮箱 → `nodeman24@outlook.com`；原电话号码位 → `@BrainEno`
  （非纯数字时自动改为指向 GitHub 的外链，不再生成错误的 `tel:` 链接）。

> 注意：示例照片（肖像、画廊、联系页电话亭）仍是模板占位素材，
> 未随文字替换——请在 `/admin` 的 Biography / Gallery / Contact 页签替换成自己的图。
> 之所以不在代码里硬改，是为了保留“照片全部可配置”这一设计。

### 已知限制（下一轮候选）

- 演示模式的上传图片只存在内存，重启即失效（正式模式存 `media_assets`）。
- 数据库模式探测缓存 15 秒；改环境变量后仍建议重启/重新部署。
- works 条目暂无可点击外链字段（当前 UI 无链接入口），若要“点作品跳 GitHub”
  需同时加字段与交互，留待 P1。

## 本轮已修复（第三轮，2026-10-29 验证通过）

> 基线：上一轮版本一代码；版本一的显像管滤镜（`.tv-glass` 常驻玻璃层、
> 扫描线、磷光 tint、`.tv-cover` 浓郁调色）完整保留。

1. **滚动黑场 + 照片层级（用户图1、图3）**：上一轮把肖像盒起点藏到
   `-98vh`，导致 pin 开始时照片完全在画面外，hero 走后约 500px 滚动行程
   是纯黑空舞台（无头 Chromium 在 scroll 1300/1600 逐帧复现）。
   → 改回**自然入场**：起点 `-14vh`，pin 起点照片已在画面内上部，
   settle 拍只做归位 + 反灰 + 转正 + 展宽；肖像盒 `z-index: 3 → 5`
   明确为场景最高。pin 前露出的小截读作正常的内容入场，不再像图层错乱。
   位置：`src/portfolio/scroll/choreography.ts`（journeyDesktop）、
   `src/portfolio/styles/portfolio.css`（`.story-photo-box`）。
2. **电视机放大时左侧缝隙（用户图2）**：像素级扫描 `tv-bg.webp`
   第 1110 行，玻璃真实起点 x=1102，而 overlay 矩形左缘在 x=1110，
   8px 偏差在 zoom 下被放大成左侧一整条“穿帮”亮边。
   → 矩形左缘移到 x=1098（`left 43.3594% → 42.8906%`，
   `width 12.8125% → 13.2813%`），4px  bleed 塞进黑色内边框底下，
   上层 darken 混合的边框照片负责遮住；右缘/上下不动。
   注意：首页渲染优先读数据库存量，本轮已把库里旧矩形同步为新值；
   后台 Television 页签也可手动微调。
   位置：`src/portfolio/content/defaults.ts`（`works.tv.screen`）。
3. **`/admin` 进不去**：本轮用 curl + 无头浏览器复测：`/admin` 200、
   会话接口正常、`123456` 登录返回 `authenticated:true`、
   登录→编辑→发布→登出全链路通过——接口层无阻塞。
   之前“进不去”的真实风险点只有两个，已补：①发布接口（PUT）缺 DB
   容错，库不可用时抛 500 白页 → 补 503 JSON（与上传接口一致）；
   ②后台内容加载失败无 `.catch`，会无限转圈 → 补错误面板 + Retry。
   默认密码保持 `123456`（`ADMIN_PASSWORD` 为空时生效），登录页明示；
   补齐根目录 `.env.example` 与导出工程的 `.env.example`
  （此前文档引用了但文件缺失）。
   位置：`src/portfolio/server/api.ts`、`src/portfolio/admin/AdminApp.tsx`、
   `.env.example`、`export/react-router/.env.example`。

## 上轮已修复（2026-10-28 验证通过）

1. **Hero/肖像图层泄漏（用户图1）**：桌面端 journey 肖像盒初始位移
   `-52vh` 藏不住 64vh 高的照片盒，pin 开始前约 270px 照片残块露在
   hero 底部，看似图层错乱。→ 初始位改为 `-98vh`（整块藏到舞台上方），
   肖像盒 `z-index` 明确为场景最高；无头 Chromium 按滚动位置逐像素核验
   pin 前零泄漏、settle 拍干净入场。
   位置：`src/portfolio/scroll/choreography.ts`（journeyDesktop）、
   `src/portfolio/styles/portfolio.css`（`.story-photo-box`）。
2. **电视机屏幕发白失真（用户图2）**：作品图用 `mix-blend-mode: screen` +
   `brightness(1.22)` 被洗成惨白投影。→ 改正常混合 +
   `saturate(1.12) contrast(1.06) brightness(0.88)` 浓郁调色，并加重扫描线、
   磷光 tint 与边缘压暗，作品图回到“显像管里的照片”质感。
3. **电视机放大黑洞（用户图3）**：退出时间线把屏幕变量 scrub 到纯黑，
   zoom 时屏幕是死黑矩形。→ 关机色改为带质感的暗磷光
   `#2b2f29→#1b1e1a→#0f1110`，并新增常驻 `.tv-glass` 层（扫描线 + 高光 +
   边缘衰减，不随 showreel 淡出），phone/exit 全程玻璃质感不断。
4. **`/admin` 可用性与默认密码**：路由与接口本身正常（200 + 会话 401 恰当），
   真实障碍是默认密码 `admin` 从未文档化。→ 默认密码改为 `123456`，
   登录页与顶栏横幅明示；内容/上传写路径加 503 JSON 容错（DB 不可用不再
   白页）；Playwright 实测登录→编辑→发布→首页生效→还原全链路。
   位置：`src/portfolio/server/auth.ts`、`src/portfolio/server/api.ts`、
   `src/portfolio/admin/AdminApp.tsx`。生产必须设置 `ADMIN_PASSWORD`
  （见 `docs/SETUP.md`）。

## P0 — 上线前

- [ ] 生产环境 `ADMIN_PASSWORD` / `ADMIN_SECRET` 检查清单化：部署脚本在缺失
      强密码时阻断或告警（现状仅后台横幅提醒）。
- [ ] 登录防爆破升级：IP 级速率限制 + 失败计数锁定（现状仅 600ms 延时）。
- [ ] 备份流程文档化并演练一次：`pg_dump` 定时任务 + 后台 Data 页 JSON 导出归档。
- [ ] 真机回归：iOS Safari / Android Chrome 全链路走一遍（pin、smoother、
      中文断行、上传），留截图存档。

## P1 — 体验与健壮性

- [ ] 电视机玻璃校准交互升级：后台 Television 页签已有数值 + 红色 overlay
      预览，可加拖拽调框（`works.tv.screen` 百分比）。
- [ ] 移动端 CRT 质感与桌面拉齐（扫描线/压暗在小屏的强度复核）。
- [ ] `prefers-reduced-motion` 全覆盖复核（时间线仍 scrub 的段落 aired）。
- [ ] 图片性能：`next/image` 响应式尺寸 + AVIF、`tv-bg.webp` 预算（现 ~0.65MB）
      与首屏 preload 策略复核。
- [ ] SEO 收尾：`metadataBase`、OG 图绝对地址、sitemap/robots。
- [ ] E2E 进 CI：把本次手跑的 Playwright 脚本（hero 泄漏 / TV 四态 / exit /
      admin 发布）固化为回归用例。
- [ ] 首次登录强制改密：`usingDefaultPassword()` 为 true 时引导设置新密码
     （替代现在的横幅提醒）。

## P2 — 长期演进

- [ ] 视频作品支持：`media { src, poster }` + 移动端 `preload="metadata"`、
      不自动播放（v1 曾有该内容模型，可参考移植）。
- [ ] archive / lists 文化档案是否移植：v1 有书/音/影索引，本模板 v2 未收录；
      若要做，与动画运行时保持隔离（archive 路由不初始化 GSAP）。
- [ ] 多用户与审计日志（谁、何时、发布了什么）。
- [ ] 主题扩展：字族/字号/行距可配；暗白双舞台以外的第三配色。
- [ ] 工程结构：`export/react-router` 与主工程共用 `src/portfolio` 双份拷贝，
      改为构建期单向同步校验（现状 `scripts/build-export.mjs`），或抽成独立包。

## 技术债备忘

- `scrollIntoView` 与 ScrollSmoother 共存时个别调用不滚动（验证中发现一次，
  导航统一走 `smoother.scrollTo` 暂避）：需最小复现并决定修或绕。
- 旧构建服务进程 + 新 `.next` 目录混用会导致 chunk 404/500：排查手册已记入
  `docs/SETUP.md`，CI 构建与运行同源即可避免。
- 数据库存量优先于 `defaults.ts`：改默认文案/矩形后，若库里有旧内容，
  首页不会变化——需进后台 Data 页 Publish 或 Restore defaults。
  本轮 TV 矩形即先踩中此坑，已手动同步库值。P1 可做版本号比对提示。
