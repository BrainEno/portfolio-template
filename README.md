# Portfolio Template · 纯静态作品集

单页滚动叙事：旋转标题、肖像长卷、电视机作品索引、白场转场接 3D 电话亭收尾。

**整站是一个纯静态导出**：`npm run build:static` 产出一个 `out/` 文件夹，**默认部署到 GitHub Pages**（仓库自带 workflow），
丢到对象存储 / nginx 也一样能跑。
没有服务器、没有数据库、没有 API 路由——因此也没有需要维护的连接串、迁移和运行时。

技术栈：Next.js 16（App Router，`output: "export"`）· React 19 · TypeScript · GSAP（ScrollTrigger + ScrollSmoother）· three.js · 自托管字体（`@fontsource`）。

---

## ⚠️ 版权与许可声明

**本项目不是开源软件。保留所有权利。**

### 核心条款

- 🚫 **禁止**未经书面授权复制、修改、分发或使用本项目的代码、设计和内容
- 🚫 **禁止**将本项目用于任何商业目的或其他网站
- 🚫 **禁止**转载网站上的任何原创内容
- ✅ **允许**在 GitHub 上查看代码用于个人学习
- ✅ **允许**Fork 仓库用于学习参考（不得用于生产环境）
- ✅ **允许**引用和链接本项目（需注明出处）

如需授权，请联系：**nodeman24@outlook.com**

详细条款请参阅：
- [LICENSE](./LICENSE) — 版权许可与使用限制
- [TERMS.md](./TERMS.md) — 使用条款与版权声明
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南

---

## 30 秒跑起来

```bash
git clone https://github.com/BrainEno/portfolio-template.git && cd portfolio-template
npm install
npm run dev                     # http://localhost:3000
```

站点只有两个页面类型：首页（四幕滚动叙事）和每个作品的 `/works/<id>`；`/offline` 是 PWA 离线兜底。
没有后台、没有 `/admin`——内容在仓库里的 JSON 中（见下）。

要看成品的真实形态（静态导出的那份文件）：

```bash
npm run build:static            # → out/   （NEXT_PUBLIC_SITE_URL=https://… 建议先设）
npm run preview                 # → http://localhost:3300
```

## 内容怎么改

内容是一个 JSON 结构，构建时读一次。改内容就是改这个文件，然后重新构建：

| 文件 | 用途 |
|---|---|
| `src/portfolio/content/published.json` | **你的内容**（如果有这个文件，构建优先读它） |
| `src/portfolio/content/defaults.ts` | 模板自带的示例内容，字段类型完整、中英双语；没有 `published.json` 时用它 |

最快的开始方式：把 `defaults.ts` 复制成 `published.json`（内容外面包一层 `{ "content": … }`），
然后只改你关心的那几个字段。字段和页面的对应关系见
[docs/QUICKSTART.md](docs/QUICKSTART.md#3-改内容)，类型定义在 `src/portfolio/content/types.ts`。

改完：

```bash
npm run build:static && npm run preview     # 本地看一遍
git add -A && git commit -m "content: …" && git push
```

CI 重新导出，站点更新。没有后台、没有数据库、没有需要在浏览器里点的「发布」按钮——
**部署本身就是发布**。

> 图片：字段里填路径（`/images/xxx.jpg`）或外链（`https://…`）都可以。
> 图片都放在固定尺寸的画框里裁切，所以任何比例的图换了都不会破坏版式。
>
> 本地图片会被自动做响应式：`npm run images`（构建前自动执行）把 `public/images/` 里的
> 图压成 480 / 800 / 1200 三档 WebP，页面上按实际显示宽度取用。**换图之后跑一次即可**，
> 忘了跑也不会出错——只是那张图按原尺寸加载。

## 部署

| 目标 | 做法 | 文档 |
|---|---|---|
| **GitHub Pages**（默认） | 仓库自带 workflow，push 到 `main` 自动发布；**首次要在 Settings → Pages → Source 选 “GitHub Actions”** | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#github-pages本项目的默认目标) |
| 对象存储 / OSS / S3 | 上传 `out/` 里的文件，`index.html` 作默认文档 | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#对象存储--oss--cos--s3) |
| nginx / 自己的服务器 | `root /path/to/out; try_files $uri $uri/ =404;` | [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md#nginx--任意静态服务器) |

部署前必须设的是**站点地址**（写进 canonical、`sitemap.xml`、`robots.txt`），
项目站还要加子路径（workflow 里已经按仓库名自动设好）：

```bash
NEXT_PUBLIC_SITE_URL=https://<user>.github.io/<repo> \
NEXT_PUBLIC_BASE_PATH=/<repo> \
npm run build:static
```

> 子路径是这类站点最容易踩的坑：Next 的 `basePath` 只管路由和 `_next/`，
> 内容里手写的 `/images/…` 不会自动加前缀。本项目用 `seo/asset.ts#asset()` 统一处理，
> 并且 `npm run smoke` 会在“挂载到子路径”模式下逐页验证——漏一处 CI 就红。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build:static` | 静态导出 → `out/`（`build` 是同一个东西） |
| `npm run preview` | 用一个普通静态服务器托管 `out/`，和线上行为一致 |
| `npm run images` | 生成响应式 WebP 与图片清单（`build:static` / `dev` 前自动执行） |
| `npm run smoke` | 用普通静态服务器托管 `out/` 并逐页爬一遍（CI 也跑这个） |
| `npm run lint` · `typecheck` | ESLint · TypeScript |
| `npm run art` | 重新生成电话亭抠图兜底与电视机**占位**插画（不会覆盖你自己的 `tv.webp`） |
| `npm run tv-tube` | 从 `tv.webp` 里量出玻璃洞口，生成洞口遮罩 / 玻璃阴影 / 反光 / 扫描线（`public/images/tv-tube/`、`src/portfolio/content/tv-tube.json`）；加 `-- --qa` 输出 `.qa/tv-tube.png` 供肉眼复核 |
| `python3 scripts/optimize-booth-model.py` | 由 `assets/models/telephone.gltf` 重新生成 `public/gltfs/telephone.glb`（需 ImageMagick） |

## 目录结构

```
src/app/                 路由层（薄）：/ · /works/[id] · /offline · robots/sitemap/manifest
src/portfolio/
  content/               types · defaults(模板内容) · published.json(你的内容) · normalize · source(唯一入口)
  scroll/choreography.ts 全部 GSAP 时间线
  ui/                    Portfolio 壳 · 四幕 sections · Img(响应式) · PhoneBoothModel · TvShowreel · PwaRegister
  three/booth.ts         WebGL 电话亭（环境光、自转、拖拽、取景）
  seo/site.ts            站点 URL / JSON-LD / 标题规则
  styles/                portfolio.css · work-detail.css
public/                  images(+ opt/ 生成的 WebP) · gltfs · icons · sw.js(离线缓存)
assets/models/           建模源文件：telephone.gltf（38 MB，不进导出目录）
scripts/                 build-static.mjs · build-images.mjs · smoke.mjs · preview.mjs · art/
.github/workflows/static.yml
```

## 文档

- [docs/QUICKSTART.md](docs/QUICKSTART.md) — 本地运行、改内容、换图、发布（零基础）
- [docs/STATIC_EXPORT.md](docs/STATIC_EXPORT.md) — 静态发布细节、各平台配置、缓存头、排错
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 代码结构、SEO / PWA / 图片框架 / 动效设计说明
- [docs/ROADMAP.md](docs/ROADMAP.md) — 版本记录与后续计划

## 从旧版本迁移（曾经带 PostgreSQL / `/admin` 的形态）

上一版的内容存在数据库里，也有一段时间提供过浏览器内的编辑器。现在都没有了，迁移一次即可：

```bash
# 在仍然跑着旧版服务的机器上，把内容抓成快照
curl -s https://旧站点/api/content | jq '{exportedAt: now | todate, content: .content}' \
  > src/portfolio/content/published.json
```

- 图片若是 `/api/media/<id>` 链接，那个接口在新形态里不存在，请换成 `public/images/` 里的文件或外链；
- `/admin` 路由已删除，之后的内容改动都在 `published.json` 里做（见上文「内容怎么改」）。
