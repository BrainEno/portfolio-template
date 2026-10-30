# 开发路线（ROADMAP）

本文档是这份模板的开发日志 + 待办。优先级：P0（上线前必须）→ P1（体验与健壮性）
→ P2（长期演进）。反馈新问题时请附：现象截图、复现路径（URL / 滚动位置 / 语言 /
桌面或移动端）、控台报错原文。

**当前形态**：纯静态站。`npm run build:static` → `out/`，任何静态托管都能跑。
没有数据库、没有 API、没有 `/admin`、没有登录——内容在仓库里，构建即发布。
下面所有待办都以此为前提；带服务器/数据库/后台的旧条目已随第七轮一起删除，
只在「历史」一节留一句说明它们为什么不在。

---

## 本轮已交付（第九轮，2026-10-30）

### 结论：Next.js 支持 GitHub Pages，不需要迁移框架

排查顺序先是「能不能不迁移」。答案是可以：`output: "export"` 已经把整站变成文件，
Pages 只是一个发文件的服务器。**代价不在框架，而在于子路径**——项目站挂在
`/<repo>/` 下，而 Next 的 `basePath` 只作用于路由和 `_next/` 资源，**不会**改写内容里
手写的 `/images/…`、`/gltfs/…`。

所以没有迁移到 Astro / React Router 7：那需要重写 GSAP 滚动编排（`choreography.ts`
约 500 行）、three.js 电话亭、ScrollSmoother 的 pin/scrub 结构，风险与工作量都远超
「给十几个路径加前缀」。真要迁，动因应该是**想去掉框架**，而不是想去 Pages。

### 修掉的子路径问题（每一条都会在线上裂开）

| 位置 | 症状 | 修法 |
|---|---|---|
| `<img src>` / `srcSet` | 全站图片 404（HTML/CSS/JS 却正常） | 新增 `seo/asset.ts#asset()`，`ui/Img.tsx` 统一调用 |
| 电视封面 `TvShowreel` | 换台后画面 404 | `asset(shown.src)` |
| 电话亭模型 | 3D 不出、退化成兜底图又 404 | `BOOTH_MODEL_SRC = asset(...)` |
| 电话亭兜底抠图 | 同上 | `asset(fallback)` |
| `manifest.webmanifest` | 安装后打开 `github.io` 根、图标 404 | `id` / `start_url` / `scope` / icons 走 `BASE_PATH` |
| `robots.txt` | `Disallow: /offline` 少了前缀（等于没屏蔽） | `Disallow: /portfolio-template/offline` |
| Service Worker | 子路径下**直接不注册**，PWA/离线全失效 | scope 与脚本都带前缀；`sw.js` 从 `registration.scope` 反推 `BASE` |
| `sitemap.xml` | 作品页少了尾斜杠，与 canonical 不一致（多一次 301） | 与 `trailingSlash` 对齐 |

### 让这类问题不可能再悄悄上线

- `preview.mjs` 支持 `MOUNT`，并**自动读取构建产物里的 `out/build-meta.json`**：
  按子路径构建后，预览直接开在 `http://localhost:3300/<repo>/`，前缀之外一律 404。
  （否则很容易「用带前缀的产物去测根路径服务器」——现象和站点全坏一模一样。）
- `smoke.mjs` 在子路径模式下会额外断言 manifest scope、前缀外不可访问，
  并**逐页检查 78 个资源 URL**；顺手暴露了两个真问题：sitemap 尾斜杠、`preconnect` 误报。
- CI 的 `verify` 现在**两种路径各构建一次并各跑一次 smoke**，全绿才允许发布。

### 部署收敛到 GitHub Pages

- 删除 `netlify.toml`（不再维护第二条部署路径，避免出现「文档说支持、实际没测过」）；
  `docs/STATIC_EXPORT.md` 重写为 Pages 口径，其他静态托管留一节说明。
- `.github/workflows/static.yml`：`verify`（PR + push）→ `build` → `deploy`，仅 `main` 发布。
- 首次部署仍需在仓库 Settings → Pages → Source 选 “GitHub Actions”（一次性，无法由代码完成）。

## 本轮已交付（第八轮，2026-10-30）

### 1. 图片管线：一张图不再等于一张 4K 图

- 新增 `scripts/build-images.mjs`（`npm run images`，构建前自动跑，按 mtime 增量）：
  扫描 `public/images/**`，用 `sharp` 生成 480 / 800 / 1200 三档 WebP（不超过原图宽度，
  相邻档位差距 <15% 的自动省略），写到 `public/images/opt/`，并生成
  `src/portfolio/content/image-manifest.json`。
- 新增 `src/portfolio/ui/Img.tsx`：整站唯一的 `<img>`，按清单自动挂 `srcSet` + `sizes`。
  两个刻意的约束——**`src` 永远是真实文件**（浏览器忽略 `srcSet`、或清单没跟上新图时
  仍然出图，不可能 404），**不套 `<picture>`**（`.story-photo-mask img`、`.tv-frame`
  这类选择器与 flex 几何都依赖 `<img>` 本身是那个盒子）。
- 首屏只保留一个图片 preload：Next 会为每个 `loading="eager"` 的图生成
  `<link rel=preload>`，hero 的装饰条与电视机插画改成 `lazy` 后消失。
- 实测（1440×900）：`figure.jpg 53 KB → figure-800.webp 8.8 KB`，
  `work*.jpg 39 KB → 7 KB`，首屏图片总量约 −70%。
- 文件名带源图哈希（`figure-800.e679805a.webp`）：`/images/*` 会被托管和 Service Worker
  长期缓存，原地覆盖同名文件会让回访用户看很久的旧照片。

### 2. 仓库与产物瘦身：`out/` 43 MB → 6.2 MB

38 MB 的原始 `telephone.gltf`（base64 内嵌 buffer 的源文件）原本放在 `public/gltfs/`，
而 `public/` 会被原样拷进导出目录——**每次部署都在上传一个运行时从不下载的文件**。
移到 `assets/models/telephone.gltf`（仍是 `scripts/optimize-booth-model.py` 的输入），
`public/` 只留 2.2 MB 的 `.glb`。

### 3. 预览服务器不再"比生产更差"

`scripts/preview.mjs` 加了按需 Brotli/gzip（文本类资源，内存缓存）+ `content-length`。
此前本地预览把 160 KB 的 chunk 原样吐出去、线上托管压成 51 KB——用这种预览量性能，
量到的是服务器的问题，不是页面的问题。

### 4. `prefers-reduced-motion` 从"少动"改成"不动"

此前只有滚动编排、电话亭、电视换台检查了媒体查询，加载遮罩仍然铺满全屏跑 1.8 s
进度条、hero 仍然播 1.5 s 揭示。现在 `Portfolio.tsx` 在 reduced-motion 下直接跳过
遮罩与入场时间线（`entrance.progress(1)` 落到终态），页面"本来就在那儿"。

### 5. 无障碍：跑车马灯的可读名

`label-content-name-mismatch`（Lighthouse 唯一未通过项）：跑马灯链接的
`aria-label` 写邮箱、可见文字写 `CALL ME FOR THE MARQUEE MOON`，两者不一致。
改为 `sr-only` 邮箱 + 装饰轨 `aria-hidden`，名字来自真实文字，不再自相矛盾。

### 6. 回归进 CI：`npm run smoke`

新增 `scripts/smoke.mjs`（无浏览器，约 2 s）：拉起 `preview.mjs` 托管 `out/`，
按 `sitemap.xml` 遍历每个页面断言 200 + `text/html`，断言 `/admin/`、`/nope/`、
`/works/not-a-project/` 是 404，断言 `robots.txt` 只 `Disallow: /offline`、
`sitemap.xml` / `manifest.webmanifest` 可访问，断言首页引用的 36 个图片 URL
（含所有 `srcSet` 候选）全部存在，并断言 Brotli 生效。
`static.yml` 拆成 `verify`（push + PR：typecheck → lint → build → smoke）与
`build`/`deploy`（仅 main），**没通过静态爬取的产物不会上线**。

### 7. 文档

本文件重写为静态站口径；README / ARCHITECTURE / STATIC_EXPORT / QUICKSTART
补上图片管线、`assets/models`、体积与 smoke 的说明。

---

## 第七轮已交付（2026-10-30）

1. **删除 `/admin` 与整套服务端形态**：路由、`portfolio/admin/*`、`portfolio/client/*`
   （草稿存储与订阅）、`admin.css`、`content:export` 一并移除（约 −1,300 行）；
   `server/*`、`api/*`、`db/*`、drizzle、`pg`、`@netlify/database`、
   `@opennextjs/cloudflare`、Docker/VPS 脚手架全部删除，安装包 679 → 380。
2. **Netlify / GitHub Pages 只做静态托管**：`npm run build:static` → `out/`，
   长缓存、`sw.js` no-cache、`/works/:id` 301。
3. **多尺寸与竖屏**：修掉整站横向溢出；Contact 改为「舞台 + 地板线」结构；
   字号拟合改用探针 + `ResizeObserver`；字体自托管（`@fontsource`）；lint 归零。

## 历史：第三～六轮（已废弃的形态）

第三～六轮都在往"带数据库的作品集后台"上加东西：Postgres 连接串、迁移、
`/admin` 编辑器、演示模式草稿、多平台运行时探测、备份导出。这些能力随第七轮
删除——静态站没有会话可保护、也没有地方保存一次请求，所谓"编辑器"只能是个
mock。**不要再把这些条目当待办**；若将来真需要在线编辑，正确方向是
"Git 作为内容后端"（PR 即发布），见 P2。

---

## P0 — 上线前

- [ ] **换成自己的内容与图片**：`published.json`（或 `defaults.ts`）里的名字、两段简介、
      五个 works、邮箱；`public/images/` 里全是模板占位图（`FIGURE / HERO SCENE`、
      `PORTRAIT / BIOGRAPHY`…），必须替换。替换后跑一次 `npm run images`。
- [ ] **启用 Pages**：仓库 Settings → Pages → Source 选 “GitHub Actions”（一次性）。
      启用前 `deploy` job 会在 `configure-pages` 一步失败，workflow 显示红但是代码没问题。
- [ ] **设 `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_BASE_PATH`**：canonical、`sitemap.xml`、
      `robots.txt`、OG 图绝对地址由前者派生；项目站在子路径下还需要后者。
      两个值在 workflow 里已按仓库名自动填好，改用自定义域名时才需要手工改。
- [ ] **真机回归**：iOS Safari / Android Chrome 各走一遍（pin、ScrollSmoother、
      中文断行、电话亭 WebGL 与拖拽、电视换台），留截图存档。
- [ ] **Lighthouse 预算定档**：移动模拟、本地 Brotli 预览，第八轮前后：

      | 指标 | 第七轮 | 第八轮 |
      |---|---|---|
      | 性能 | 77 | **99** |
      | 无障碍 / 最佳实践 / SEO | 100 / 100 / 100 | 100 / 100 / 100 |
      | FCP / LCP | 1.7 s / 5.5 s | 1.3 s / 1.3 s |
      | TBT / CLS | 160 ms / 0 | 110 ms / 0 |

      下次跑请用同一口径（`npm run build:static` + `npm run preview`，不要拿 dev server 量），
      并把桌面档也补上。
- [ ] **`out/` 体积守门**：现在 6.2 MB（其中 `gltfs/telephone.glb` 2.2 MB）。
      任何新素材进 `public/` 前先问一句"它会不会被拷进导出目录"。

## P1 — 体验与健壮性

- [ ] **电视机玻璃校准**：`works.tv.screen` 是 `tv-bg.webp` 上的百分比矩形，
      原本靠后台拖拽调；后台没了，改为开发期一次性工具（例如 `?tv=calibrate`
      叠一层可拖拽的红色框，把百分比打到控制台），调完直接写回 `defaults.ts`。
- [ ] **移动端 CRT 复核**：扫描线/压暗/玻璃高光在小屏的强度，与桌面逐个对照。
- [ ] **首屏 JS 预算**：`three` 已经在 IntersectionObserver 里动态加载，但
      `choreography.ts`（GSAP + ScrollSmoother）仍是首屏必需；确认没有三处重复打包，
      并给 `_next/static/chunks` 设个上限（例如单块 < 250 KB）。
- [ ] **内容校验**：`normalizeContent` 目前静默兜底，改成构建期收集问题并打印
      （缺字段、图片不存在、`works` id 重复），让"改错了"在构建日志里立刻可见。
- [ ] **无 JS / 慢网降级复核**：关掉 JS 时首屏文字与 works 列表仍在；
      电话亭兜底图、电视机关机态都要体面。
- [ ] **SW 策略复核**：`public/sw.js` 仍是 cache-first 静态资源 + 导航 network-first；
      换版本后旧 chunk 的清理、`/images/opt/` 的缓存预算（现在多了 64 个文件）要确认。
      注意 Pages 无法自定义响应头，`sw.js` 本身会被缓存 10 分钟，新版本不是立刻生效。

## P2 — 长期演进

- [ ] **视频作品**：`media { src, poster }` + `preload="metadata"`、不自动播放；
      同样要过一遍图片管线那套"尺寸与体积"的思路。
- [ ] **Git 作为内容后端**：内容改动走 PR（GitHub API + 模板化表单），
      合并后 CI 自动重建——即"在线编辑器"的静态版，不需要任何服务器。
- [ ] **更多语言**：`Language` 目前硬编码 `zh | en`；抽成可配置列表 +
      每语言一份 `published.json`。
- [ ] **中日韩字体子集化**：现在 CJK 直接落到系统字体；若要统一字形，
      需要按实际用字做子集（全量 CJK webfont 动辄数 MB，与 P1 的 JS 预算冲突）。
- [ ] **主题扩展**：字族/字号/行距可配；暗白双舞台以外的第三配色。
- [ ] **`archive` 文化档案**（v1 有书/音/影索引）：若移植，路由不初始化 GSAP。

## 技术债备忘

- `scrollIntoView` 与 ScrollSmoother 共存时个别调用不滚动：导航统一走
  `smoother.scrollTo`，自动化测试里用滚轮事件（`page.mouse.wheel`）。
- 无头 Chromium 里 CJK 会渲染成豆腐块，是字体缺失，不是排版问题；判断版式只看几何量。
- 图片清单（`image-manifest.json`）是**提交进仓库的生成物**：新增/替换图片后
  必须跑 `npm run images`（或直接 `npm run build:static`），否则新图没有 `srcSet`
  （仍能显示，只是没优化）。
