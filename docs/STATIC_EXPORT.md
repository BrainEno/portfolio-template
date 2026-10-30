# 纯静态发布（无后端 / GitHub Pages / OSS / Nginx）

这个仓库一直是「Next.js 服务端 + PostgreSQL CMS」。现在它同时支持**第三种形态**：
`CONTENT_MODE=static` 时，构建产物是一整个可以扔到任意静态托管的文件夹 `out/` ——
没有 Node、没有数据库、没有 `/api`、没有 `pg` 驱动。

## 一分钟上手

```bash
npm ci
npm run build:static          # ≈20 秒，产物在 out/
npx serve out                 # 或 python -m http.server -d out 8080
```

`out/` 里是：

```
out/
├── index.html                     # 首页（完整预渲染 HTML，SEO 友好）
├── works/<slug>/index.html        # 每个作品一页
├── sitemap.xml  robots.txt  manifest.webmanifest  sw.js
├── _next/…                        # JS/CSS/字体（带内容哈希）
├── images/  gltfs/  icons/        # 静态资源
└── 404.html
```

## 内容从哪来

静态构建有**两档**内容来源，都在 `src/portfolio/content/source.ts` 里：

| 来源 | 什么时候用 | 怎么做 |
|---|---|---|
| `content/defaults.ts`（默认） | 从没连过数据库，或就想用代码里的默认文案 | 什么都不用做，直接 `npm run build:static` |
| `content/published.json`（快照） | 已经在服务端/线上用 `/admin` 编辑过内容 | `npm run content:export` 把线上内容抓成快照，提交这个文件，再静态构建 |

```bash
# 从正在运行的服务端实例导出内容快照
npm run content:export                              # 默认 http://localhost:3000
CONTENT_URL=https://example.com npm run content:export
git add src/portfolio/content/published.json
```

快照就是 `/api/content` 的响应，和数据库里的 JSON 结构完全一致，所以「先在服务端编辑，
再导出成静态站」是无损的。改完内容重新导出 + 重新构建即可。

## 必须设置：站点地址

静态站没有请求时的 Host，所以 canonical / `sitemap.xml` / `robots.txt` / og:image
全部在**构建期**写死。构建前设置：

```bash
NEXT_PUBLIC_SITE_URL=https://example.com npm run build:static
```

（`SITE_URL` 也可以；两个都没设时会用 `http://localhost:3000`，`build:static` 会打印提醒。）

## 部署到各家静态托管

### GitHub Pages

```bash
NEXT_PUBLIC_SITE_URL=https://<用户名>.github.io/<仓库> npm run build:static
npx gh-pages -d out          # 或把 out/ 推到 gh-pages 分支
```

仓库自带 `.github/workflows/static.yml`，push 到 `main` 就会自动构建并发布到 Pages
（首次需要在 Settings → Pages 里把 Source 选成 “GitHub Actions”）。
**如果站点在子路径下**（`/仓库名/`），额外设置 `NEXT_PUBLIC_BASE_PATH=/仓库名`，
构建时会自动加上 `basePath` 与 `assetPrefix`，站内链接和静态资源都会跟着前缀走。

### 对象存储 / OSS / COS / S3

```bash
NEXT_PUBLIC_SITE_URL=https://cdn.example.com npm run build:static
aws s3 sync out/ s3://你的桶 --delete        # 或 ossutil cp -r out/ oss://你的桶/
```

注意两点：`works/<slug>/` 这类**目录索引**要开启「默认首页 index.html」；
`_next/static/` 下的文件带内容哈希，可以放心 `Cache-Control: immutable`。

### Nginx / 任意静态服务器

```nginx
root /var/www/portfolio/out;
index index.html;
location / { try_files $uri $uri/ $uri/index.html =404; }
location /_next/static/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

## 和「服务端 + CMS」形态的对照

| | `npm run build`（默认） | `npm run build:static` |
|---|---|---|
| 内容来源 | 请求时读 PostgreSQL，失败回落到默认文案 | 构建时读 `defaults.ts` / `published.json` |
| 渲染 | 每次请求 SSR（`force-dynamic`） | 全部预渲染（`force-static` + `generateStaticParams`） |
| `/admin` `/adam` | 完整 CMS | 只显示「静态构建」说明页，不提供编辑 |
| `/api/*` | 有 | 不存在（导出时被排除） |
| 依赖 | Node ≥ 20 + PostgreSQL（可无） | 只需要一个能发文件的服务器 |
| `pg` / `node:crypto` | 进服务端包 | **完全不进产物** |

## 实现要点（给以后改代码的人）

- 模式开关是**构建期常量**（`src/portfolio/content/mode.ts`），因为 Next 必须提前知道
  它才能决定 `output`、路由段配置和哪些 route handler 存在。
- 路由段配置不能写成变量（Next 要靠静态解析），所以「必须每次请求渲染」改成了在页面里
  调用 `requireFreshRender()`（内部是 `next/server` 的 `connection()`），静态构建时这个调用
  被编译期判断掉，页面就是可预渲染的。
- 内容读取统一走 `getSiteContent()`，静态分支用 `node:fs` 读 JSON，服务端分支才
  `await import("../server/content-handlers")` —— 这样 `pg` 永远不会被静态构建打进产物。
- `next.config.ts` 在静态模式里设置 `output: "export"`、`trailingSlash: true`、
  `images.unoptimized: true`、`pageExtensions: ["tsx"]`（把 `src/app/api/**/route.ts`
  这类纯 `.ts` 的服务端文件排除在路由之外），并且不注册 `headers()`（导出模式不支持）。
- `sitemap/robots/manifest` 从 `.ts` 改名为 `.tsx`：它们是 route handler，而静态导出要求
  它们也能被预渲染，`pageExtensions` 的过滤才不会把它们一起排除。
