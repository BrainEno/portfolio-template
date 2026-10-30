# Portfolio Template · 纯静态作品集

单页滚动叙事 + 本地可视化编辑器：旋转标题、肖像长卷、电视机作品索引、白场转场接 3D 电话亭收尾。

**整站是一个纯静态导出**：`npm run build:static` 产出一个 `out/` 文件夹，丢到 GitHub Pages / Netlify / 对象存储 / nginx 就能跑。
没有服务器、没有数据库、没有 API 路由——因此也没有需要维护的连接串、迁移和运行时。

技术栈：Next.js 16（App Router，`output: "export"`）· React 19 · TypeScript · GSAP（ScrollTrigger + ScrollSmoother）· three.js · 自托管字体（`@fontsource`）。

## 30 秒跑起来

```bash
git clone https://github.com/BrainEno/portfolio-template.git && cd portfolio-template
npm install
npm run dev                     # http://localhost:3000
```

要看成品的真实形态（静态导出的那份文件）：

```bash
npm run build:static            # → out/   （NEXT_PUBLIC_SITE_URL=https://… 建议先设）
npm run preview                 # → http://localhost:3300
```

## 内容怎么改

| 方式 | 适合 | 说明 |
|---|---|---|
| `/admin` | 日常改文案、换图、调作品列表 | 改动存进**本浏览器**的草稿，首页立刻预览；点 **Publish** 下载 `published.json` |
| `src/portfolio/content/defaults.ts` | 初始化模板、不想开编辑器 | 构建直接读取，类型安全 |
| `src/portfolio/content/published.json` | 发布 | `/admin` 导出的快照；提交后下次构建即生效 |

发布流程只有一步「把文件提交回仓库」：

1. `/admin` 里改，首页实时预览；
2. 点 **Publish** → 下载 `published.json`；
3. 覆盖 `src/portfolio/content/published.json`，提交、推送；
4. CI（或你本地 `npm run build:static`）重新导出，站点更新。

> 草稿是本地的，所以换了设备/清了缓存就没了——Data 页签可以下载备份（含内联图片），随时恢复。

## 部署

| 目标 | 做法 | 文档 |
|---|---|---|
| **Netlify** | 连仓库即可，`netlify.toml` 已写好（`npm run build:static` → `out`） | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#netlify) |
| GitHub Pages | 仓库自带 workflow（`.github/workflows/static.yml`） | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#github-pages) |
| 对象存储 / OSS / S3 | 上传 `out/` 里的文件，`index.html` 作默认文档 | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#对象存储--oss--cos--s3) |
| nginx / 自己的服务器 | `root /path/to/out; try_files $uri $uri/ =404;` | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#nginx--任意静态服务器) |

部署前唯一必须设的变量是站点地址（会写进 canonical、`sitemap.xml`、`robots.txt`）：

```bash
NEXT_PUBLIC_SITE_URL=https://your-site.netlify.app npm run build:static
```

子路径托管（如 GitHub Pages 的项目站 `/<repo>/`）再加 `NEXT_PUBLIC_BASE_PATH=/<repo>`。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build:static` | 静态导出 → `out/`（`build` 是同一个东西） |
| `npm run preview` | 用一个普通静态服务器托管 `out/`，和线上行为一致 |
| `npm run content:export` | 从任一线上实例抓取 `/api/content`… 仅用于从旧版本迁移，见下 |
| `npm run lint` · `typecheck` | ESLint · TypeScript |
| `npm run art` | 重新生成电视机矢量插画与电话亭抠图兜底 |
| `python3 scripts/optimize-booth-model.py` | 由 `public/gltfs/telephone.gltf` 重新生成 `telephone.glb`（需 ImageMagick） |

## 目录结构

```
src/app/                 路由层（薄）：/ · /admin · /works/[id] · /offline · robots/sitemap/manifest
src/portfolio/
  content/               types · defaults(默认内容) · published.json(发布快照) · normalize · source(唯一入口)
  client/                demo-store(浏览器草稿) · useLiveContent(首页实时订阅)
  scroll/choreography.ts 全部 GSAP 时间线
  ui/                    Portfolio 壳 · 四幕 sections · PhoneBoothModel · TvShowreel · PwaRegister
  admin/                 AdminApp(壳) · editor · fields · DataPanel · shared
  three/booth.ts         WebGL 电话亭（环境光、自转、拖拽、取景）
  seo/site.ts            站点 URL / JSON-LD / 标题规则
  styles/                portfolio.css · admin.css · work-detail.css
public/                  images · gltfs · icons · sw.js(离线缓存)
scripts/                 build-static.mjs · preview.mjs · content-export.mjs · art/
netlify.toml · .github/workflows/static.yml
```

## 文档

- [docs/QUICKSTART.md](docs/QUICKSTART.md) — 本地运行、第一次进编辑器、改内容、换图、备份恢复（零基础）
- [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md) — 静态发布细节、各平台配置、缓存头、排错
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 代码结构、SEO / PWA / 图片框架 / 动效设计说明
- [docs/ROADMAP.md](docs/ROADMAP.md) — 版本记录与后续计划

## 从旧版本（带 PostgreSQL 的形态）迁移

上一版把内容存在 PostgreSQL 里，`/admin` 直接读写数据库。现在只有静态形态，迁移一次即可：

1. 在**旧版**站点上运行 `CONTENT_URL=https://旧站点 npm run content:export`，得到 `src/portfolio/content/published.json`；
2. 把它复制进当前仓库并提交；
3. 之后用 `/admin` 维护，图片若是 `/api/media/<id>` 链接，请在编辑器里换成文件或外链（旧版数据库不再被读取）。
