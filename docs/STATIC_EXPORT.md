# 发布到 GitHub Pages

整站是一个静态导出：`npm run build:static` 产出 `out/`，任何能发文件的服务器都能托管。
没有 Node 运行时、没有数据库、没有 `/api`。

## 一分钟上手

```bash
npm ci
NEXT_PUBLIC_SITE_URL=https://example.com npm run build:static   # ≈25 秒，产物在 out/（≈6 MB）
npm run preview                                                # http://localhost:3300
npm run smoke                                                  # 逐页爬一遍 out/，≈2 秒
```

`npm run preview` 是一个普通静态服务器（`scripts/preview.mjs`），行为和线上托管一致：
目录 URL 解析到 `index.html`，找不到的路径返回 `404.html` + 404 状态码，
文本资源按 `Accept-Encoding` 现场 Brotli/gzip（不然本地量出来的传输体积没有意义）。
**它还会读构建产物里的 `out/build-meta.json`，按那次构建真正的部署路径挂载**——
用 `NEXT_PUBLIC_BASE_PATH=/repo` 构建后，它会开在 `http://localhost:3300/repo/`，
前缀之外一律 404，和 Pages 项目站一模一样。如果某个页面在这里打不开，它在线上也打不开。

`npm run smoke` 在同一个服务器上做无人值守的回归：按 `sitemap.xml` 遍历每个页面（200 + `text/html`）、
断言 `/admin/` 之类的路径是 **404**、`robots.txt` 只 `Disallow: /offline`、首页引用的每个
图片 URL（含所有 `srcSet` 候选）都真实存在。CI 的 `verify` job 跑的就是它，没过不会部署。

`out/` 里是：

```
out/
├── index.html                     # 首页（完整预渲染 HTML，SEO 友好）
├── works/<slug>/index.html        # 每个作品一页
├── sitemap.xml  robots.txt  manifest.webmanifest  sw.js
├── _next/…                        # JS/CSS/字体（带内容哈希）
├── images/  gltfs/  icons/        # 静态资源（images/opt/ 是构建期生成的响应式 WebP）
└── 404.html
```

## 内容从哪来

两个来源，都在 `src/portfolio/content/source.ts` 里，优先级从高到低：

| 来源 | 什么时候用 | 怎么做 |
|---|---|---|
| `content/published.json` | 有自己的内容 | 直接编辑这个 JSON，提交后重新构建 |
| `content/defaults.ts` | 全新模板 | 什么都不用做，直接构建（`published.json` 不存在时用它） |

没有后台、没有数据库、没有浏览器内的编辑器：**内容在仓库里，发布就是部署**。

> 从旧版（带 PostgreSQL / `/admin` 的形态）迁移：在旧站点上把内容抓成快照再提交：
>
> ```bash
> curl -s https://旧站点/api/content \
>   | jq '{exportedAt: now | todate, content: .content}' \
>   > src/portfolio/content/published.json
> ```
>
> 旧的 `/api/media/<id>` 图片链接在新形态里不可用，请换成 `public/images/` 里的文件或外链。

## 必须设置：站点地址

静态站没有请求时的 Host，所以 canonical / `sitemap.xml` / `robots.txt` / og:image
全部在**构建期**写死。构建前设置：

```bash
NEXT_PUBLIC_SITE_URL=https://example.com npm run build:static
```

（`SITE_URL` 也可以；两个都没设时会用 `http://localhost:3000`，`build:static` 会打印提醒。）

## GitHub Pages（本项目的默认目标）

仓库自带 `.github/workflows/static.yml`：push 到 `main` → `verify`（typecheck / lint /
两种路径各构建一次并 smoke）→ `build` → `deploy`。**首次部署只需要在仓库
Settings → Pages → Source 选 “GitHub Actions”**，之后不用再动。

项目站（`https://<用户名>.github.io/<仓库>/`）在子路径下，workflow 已经设好两个变量：

```bash
NEXT_PUBLIC_SITE_URL=https://<用户名>.github.io/<仓库>
NEXT_PUBLIC_BASE_PATH=/<仓库>
```

自己手动构建时同理：

```bash
NEXT_PUBLIC_SITE_URL=https://<用户名>.github.io/<仓库> NEXT_PUBLIC_BASE_PATH=/<仓库> npm run build:static
npm run preview      # 自动开在 http://localhost:3300/<仓库>/
```

**子路径是这类站最容易踩的坑**：Next 的 `basePath` 只作用于路由和 `_next/` 资源，
内容里手写的 `/images/…`、`/gltfs/…` 不会被自动加前缀。所以有几个地方必须走
`seo/asset.ts#asset()`（图片、电视画面、电话亭模型与兜底图）、`BASE_PATH`
（manifest 的 `id`/`start_url`/`scope`/icons、robots 的 `Disallow`）、
以及 Service Worker 的 scope。`npm run smoke` 会在“挂载到子路径”的模式下逐页检查，
漏掉任何一处都会在 CI 里失败，而不是上线后变成一堆裂图。

**用户站 / 自定义域名**（`BrainEno.github.io` 或 `your-domain.com`）在根路径，
把 `NEXT_PUBLIC_BASE_PATH` 清空即可，其余不用改。

Pages 不能自定义响应头：`_next/static/*` 会被它缓存 10 分钟，`sw.js` 也是。
所以发布新版本后最多 10 分钟才全员可见——这是 Pages 的固有行为，不是站点的问题。

## 其他静态托管（可选）

`out/` 就是一堆文件，没有哪一项依赖 Pages。真要换宿主，只有两个构建期变量要改：
`NEXT_PUBLIC_SITE_URL`（站点地址，写进 canonical / sitemap / robots）和
`NEXT_PUBLIC_BASE_PATH`（在子路径下才需要，根路径留空）。

### 对象存储 / OSS / COS / S3

```bash
NEXT_PUBLIC_SITE_URL=https://cdn.example.com npm run build:static
aws s3 sync out/ s3://你的桶 --delete        # 或 ossutil cp -r out/ --update oss://你的桶/
```

注意两点：`works/<slug>/` 这类**目录索引**要开启「默认首页 index.html」；
`_next/static/` 下的文件带内容哈希，可以放心 `Cache-Control: immutable`。

### Nginx / 任意静态服务器

```nginx
root /var/www/portfolio/out;
index index.html;
location / { try_files $uri $uri/ $uri/index.html =404; }
location /_next/static/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
location = /sw.js { add_header Cache-Control "no-cache, max-age=0"; }
```

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 作品页 404 | 目录索引没开（`works/slug/` 需要解析到 `index.html`） | 按上面的 nginx / OSS 配置开默认文档 |
| 样式和 JS 正常但**图片全裂** | 内容里的绝对路径少了子路径前缀 | 确认用的是 `asset()`（`npm run smoke` 在子路径模式下会直接报出漏掉的 URL） |
| 子路径下样式和 JS 全 404 | 少了 `NEXT_PUBLIC_BASE_PATH` | 重新构建，值就是子路径（`/repo`，带前导斜杠，不带尾斜杠） |
| 部署后看到旧版本 | Service Worker 缓存，或 Pages 的 10 分钟缓存 | 等一会儿，或强制刷新；新 `sw.js` 会接管 |
| `sitemap.xml` 全是 localhost | 构建时没设 `NEXT_PUBLIC_SITE_URL` | 设好后重新构建 |
| 图片不显示 | `images.unoptimized` 模式下走的是 `public/` 里的原文件 | 检查路径大小写，Linux 上区分大小写 |

## 实现要点（给以后改代码的人）

- `next.config.ts` 就是静态导出的配置：`output: "export"`、`trailingSlash: true`、
  `images.unoptimized: true`、`pageExtensions: ["tsx"]`。没有服务端分支，所以没有任何
  需要按环境切换的东西——只有 `NEXT_PUBLIC_BASE_PATH` 与 `NEXT_PUBLIC_SITE_URL` 两个构建期变量。
- 内容读取统一走 `content/source.ts#getSiteContent()`：`node:fs` 读 `published.json`，
  读不到就用 `defaults.ts`。所以构建产物里不会出现任何数据库驱动。
- `sitemap/robots/manifest` 是 route handler，静态导出要求它们能被预渲染；每个文件里
  `generateStaticParams()` 返回 `[]`，就是告诉 exporter「这个可以构建」。
- 字体来自 `@fontsource`（`layout.tsx` 里 import CSS），不依赖构建期的网络请求，也不依赖
  Google Fonts；构建可以在完全离线的机器上完成。
- `sitemap.xml` 的 `lastmod` 取 `published.json` 的 `exportedAt`，避免每次部署都声称「刚刚更新」。
