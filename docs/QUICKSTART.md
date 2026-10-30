# 零基础快速上手

> 目标：下载代码 → 本机跑起来 → 进编辑器改内容 → 发布上线。不需要会写代码，也不需要数据库。

## 1. 准备

只需要 **Node.js 22**（<https://nodejs.org> 下载安装，一路下一步）。没有其他依赖，不需要 Docker、不需要数据库。

## 2. 跑起来

```bash
git clone https://github.com/BrainEno/portfolio-template.git
cd portfolio-template
npm install
npm run dev
```

打开：

- 首页 <http://localhost:3000>
- 编辑器 <http://localhost:3000/admin>

Windows 没有 bash 也没关系：上面三行命令在 PowerShell / CMD 里同样能用。

## 3. 改内容

进 `/admin`，左侧九个页签：

| 页签 | 内容 |
|---|---|
| Identity | 用户名、网站名（浏览器标题）、页面标题、SEO 描述、默认语言 |
| Hero | 首屏三行大标题、主视觉图 |
| Biography | 肖像、两段简介（中英） |
| Gallery | 横向画廊图片（增删排序） |
| **Works** | **作品条目：标题 / 日期 / 技术栈 / 电视机里的封面图 / 项目链接 / 详情介绍 / 详情图**（增删排序） |
| Television | 电视机玻璃位置校准（换电视图时用） |
| Contact | 邮箱、联系方式、联系区标题与跑马灯、电话亭图 |
| Theme | 主题色 |
| Data | 备份 / 恢复 / 恢复默认 |

每一次改动都会**立刻**写进本浏览器的草稿，首页（另一个标签页）同步刷新——不用保存、不用等构建。

### 发布

草稿只活在这台电脑的这个浏览器里。要让所有人看到：

1. 点右上角 **Publish** → 浏览器下载 `published.json`；
2. 用它覆盖仓库里的 `src/portfolio/content/published.json`；
3. `git add -A && git commit -m "content: update" && git push`；
4. CI 或你本地的 `npm run build:static` 重新导出，站点更新。

`Ctrl/Cmd + S` 等同于 Publish。想放弃改动：侧栏 **Discard draft**。

### 换图不用管尺寸

首页所有图片都放在**固定尺寸的画框**里，用 `object-fit: cover` 裁切：竖图、横图、方图、超宽图都不会撑开布局或变形。
图片字段可以填**链接**（`https://…` 或 `/images/xxx.jpg`），也可以直接把文件拖进缩略图——
上传的图会内联进草稿，所以单张限制 1.4 MB（浏览器存储配额），更大的图请用图床链接。

每个作品都会生成可被搜索引擎收录的详情页：`/works/<id>`。

## 4. 本地看「成品」

```bash
npm run build:static
npm run preview            # http://localhost:3300
```

`out/` 里就是上线用的那堆文件。`npm run preview` 是一个普通的静态服务器：和 GitHub Pages / Netlify 上的行为一致，
如果某个页面在这里打不开，说明它在线上也打不开。

## 5. 部署

最短路径是 **Netlify**：把仓库推到 GitHub，在 Netlify 里 Import，其余不用填（`netlify.toml` 已经写好）。
唯一要设的变量是站点地址：

```
NEXT_PUBLIC_SITE_URL = https://your-site.netlify.app
```

其他平台（GitHub Pages / 对象存储 / nginx / 自己的服务器）见 [STATIC_EXPORT.md](STATIC_EXPORT.md)。

## 6. 备份与迁移

后台 → **Data**：

- **Download backup**：一个 JSON，含全部内容（内联图片也在里面）。
- **Restore backup**：换电脑、清过缓存、或者想搬到另一个站时导回去，再 Publish 即可。
- **Restore template defaults**：回到模板初始状态（会覆盖当前内容，先备份）。

## 7. 离线查看（PWA）

生产构建（`npm run build:static` 产出的站点）下，浏览器会自动安装 Service Worker：
访问过一次的首页、作品页、图片、字体可离线打开；地址栏出现「安装」图标即可安装为桌面应用。
`npm run dev` 不启用，避免缓存干扰调试。

> 改了内容后如果看到旧版本，是 Service Worker 在服务缓存：刷新两次，或在 DevTools → Application → Service Workers
> 里点 Update。每次部署的新 `sw.js` 会自动接管。

## 8. 常见问题

| 现象 | 处理 |
|---|---|
| 端口被占用 | `npm run dev -- -p 3001` |
| `/admin` 里改了但首页没变 | 首页必须和编辑器是**同一个浏览器**（草稿存在 localStorage）；换设备看不到本地草稿 |
| 上传提示太大 | 单图 ≤ 1.4 MB（内联进草稿）；更大的图请用图床链接 |
| Publish 下载的 `published.json` 放哪 | `src/portfolio/content/published.json`（覆盖同名文件） |
| 部署后页面 404 | 见 [STATIC_EXPORT.md](STATIC_EXPORT.md) 的「排错」一节：多半是 `trailingSlash` 或子路径 `NEXT_PUBLIC_BASE_PATH` 没配对 |
| `sitemap.xml` 里是 localhost | 构建时没设 `NEXT_PUBLIC_SITE_URL` |
