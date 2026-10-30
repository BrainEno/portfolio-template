# 零基础快速上手

> 目标：下载代码 → 本机跑起来 → 改内容 → 发布上线。不需要数据库，也不需要后台。

## 1. 准备

只需要 **Node.js 22**（<https://nodejs.org> 下载安装，一路下一步）。没有其他依赖，不需要 Docker、不需要数据库。

编辑器就是一个文本编辑器（VS Code / 记事本都行）。

## 2. 跑起来

```bash
git clone https://github.com/BrainEno/portfolio-template.git
cd portfolio-template
npm install
npm run dev
```

打开 <http://localhost:3000>（首页）。作品详情页是 `/works/<id>`，例如 `/works/scribeforge`。

Windows 没有 bash 也没关系：上面三行命令在 PowerShell / CMD 里同样能用。

## 3. 改内容

所有内容在一个文件里，两种写法：

| 文件 | 什么时候用 |
|---|---|
| `src/portfolio/content/defaults.ts` | 刚 clone 下来、还没建自己的内容文件时（构建直接读它） |
| `src/portfolio/content/published.json` | **你正式的内容**：只要它存在，构建就优先读它 |

最简单的做法：把 `defaults.ts` 里的 `export const defaultContent: PortfolioContent = { … }`
整个对象复制出来，存成 `src/portfolio/content/published.json`，外面包一层：

```json
{ "exportedAt": "2026-01-01T00:00:00.000Z", "content": { "version": 2, … } }
```

然后只改你关心的字段。字段在哪一屏：

| 字段 | 出现在 |
|---|---|
| `identity` | 页头名字、浏览器标题、SEO 描述、默认语言（`zh` / `en`） |
| `navigation` | 三处导航文案 |
| `hero` | 首屏三行大标题 + 主视觉图 |
| `intro` | 第二幕：标题、肖像、两段简介、横向画廊、两张点缀图 |
| `works.items` | 电视机里的作品列表：标题 / 日期 / 技术栈 / 封面图 / 项目链接 / 详情页文案与配图 |
| `contact` | 末尾：三行大字、邮箱、联系方式、跑马灯文案、电话亭兜底图 |
| `theme` | 主题色（`accent`）与背景色（`stage`） |

每个文本字段都是 `{ "zh": "…", "en": "…" }`——两种语言各一份，页面右上角切换。
类型定义在 `src/portfolio/content/types.ts`，字段名写错会直接被 TypeScript 指出来。

### 换图不用管尺寸

首页所有图片都放在**固定尺寸的画框**里，用 `object-fit: cover` 裁切：竖图、横图、方图、超宽图都不会撑开布局或变形。
图片可以放 `public/images/` 里用 `/images/xxx.jpg` 引用，也可以直接写外链 `https://…`。
想控制裁切重点，选主体居中的图即可。

放进去之后跑一次：

```bash
npm run images      # 生成 480/800/1200 三档 WebP + 清单（build:static 前也会自动跑）
```

不跑也能显示，只是访客下载的是原图。手机上的差别很大：一张 1200×1600 的 JPG 首屏
实际只要 8 KB 左右就够了，原图是 53 KB，作品图更明显。

### 预览改动

`npm run dev` 会热更新，边改 JSON/TS 边看效果。要看成品的真实形态：

```bash
npm run build:static
npm run preview            # http://localhost:3300
```

`out/` 里就是上线用的那堆文件（≈6 MB）。`npm run preview` 是一个普通的静态服务器：和 GitHub Pages 上的行为一致，
如果某个页面在这里打不开，说明它在线上也打不开。想让它替你把每个页面都点一遍：

```bash
npm run smoke      # 逐页断言状态码、404、robots、图片是否都在，≈2 秒
```

## 4. 部署

站点部署在 **GitHub Pages**，仓库自带 workflow，不需要在别处导入项目：

1. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**（只需一次）；
2. push 到 `main`，workflow 会先 typecheck / lint / 构建两次（根路径 + 子路径）并 smoke，
   全绿之后才发布；
3. 站点地址是 `https://<用户名>.github.io/<仓库>/`，workflow 里已经按仓库名自动设好
   `NEXT_PUBLIC_BASE_PATH` 与 `NEXT_PUBLIC_SITE_URL`。

想换成自定义域名或用户站（`<用户名>.github.io`）时，把 `NEXT_PUBLIC_BASE_PATH` 清空，
其余不用改。对象存储 / nginx 等见 [STATIC_EXPORT.md](STATIC_EXPORT.md)。

发布流程就是提交代码：

```bash
git add -A && git commit -m "content: 改了什么" && git push
```

GitHub Actions 重新导出，1 分钟左右站点更新。**没有「发布」按钮，部署本身就是发布。**

## 5. 备份

内容就是你仓库里的那两个文件，所以：

- 备份 = `git clone` / 下载仓库；
- 恢复 = 换回来；
- 搬家 = 把 `src/portfolio/content/published.json` 和 `public/images/` 一起复制到新仓库。

## 6. 离线查看（PWA）

生产构建（`npm run build:static` 产出的站点）下，浏览器会自动安装 Service Worker：
访问过一次的首页、作品页、图片、字体可离线打开；地址栏出现「安装」图标即可安装为桌面应用。
`npm run dev` 不启用，避免缓存干扰调试。

> 改了内容后如果看到旧版本，是 Service Worker 在服务缓存：刷新两次，或在 DevTools → Application → Service Workers
> 里点 Update。每次部署的新 `sw.js` 会自动接管。

## 7. 常见问题

| 现象 | 处理 |
|---|---|
| 端口被占用 | `npm run dev -- -p 3001` |
| 改了 `published.json` 但页面没变 | `published.json` 的 JSON 结构不对时会退回 `defaults.ts`，看构建日志里的 `[portfolio] published.json is not readable` |
| 中文/英文只显示一种 | 每个文本字段都要写 `{ "zh": …, "en": … }`，缺一边会回退到另一边 |
| 部署后页面 404 | 见 [STATIC_EXPORT.md](STATIC_EXPORT.md) 的「排错」一节：多半是 `trailingSlash` 或子路径 `NEXT_PUBLIC_BASE_PATH` 没配对 |
| `sitemap.xml` 里是 localhost | 构建时没设 `NEXT_PUBLIC_SITE_URL` |
| 想改但不想碰 JSON | `defaults.ts` 是带类型的 TS 文件，编辑器里改它一样行，改完 `npm run dev` 看效果 |
