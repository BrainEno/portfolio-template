# 架构说明与本轮重构记录

## 1. 形态：只有静态导出

站点现在**只有一种形态**：`npm run build:static` 产出 `out/`，任何静态托管都能跑。
上一版还保留过「服务端 + PostgreSQL CMS」的分支，两条路要走两套心智、两套部署、两套安全面，
而这一版的产品需求（个人作品集、内容变化不频繁）完全不需要请求时读库。于是整条服务端链路被删掉了：

| 删掉的东西 | 为什么 |
|---|---|
| `src/portfolio/server/*`（连接解析、存储、鉴权、会话、备份、状态） | 只有静态站，没有请求时可写的地方 |
| `src/app/api/*`（content / media / session / backup / status / health） | 同上；`output: "export"` 也装不下 route handler |
| `src/db/*`、`drizzle.config.*`、`netlify/database/`、迁移 SQL | 没有数据库 |
| `pg`、`drizzle-orm`、`@netlify/database`、`@opennextjs/cloudflare`、`wrangler` | 依赖少了 5 个，安装体积和攻击面一起下降 |
| `Dockerfile`、`docker-compose.yml`、`deploy/`、`scripts/{setup,deploy,vps-install,doctor}.sh` | 不再需要跑一个进程 |
| `export/react-router/`（第二份工程）、`/adam` 只读路由、`admin/Login.tsx` | 重复入口；静态站没有「登录」这回事 |
| `docs/{DEPLOY,PLATFORM_DEPLOY,NETLIFY_DEPLOY,SETUP}.md` | 并入 `STATIC_EXPORT.md` / `QUICKSTART.md` |
| `netlify.toml` | 只部署 GitHub Pages，配置由 `.github/workflows/static.yml` 承担 |
| `/admin` 路由、`portfolio/admin/*`、`portfolio/client/*`、`admin.css`、`content:export` 脚本 | 静态站没有可写的地方，浏览器内的编辑器只是模拟器（见第 2 节） |

保留并强化的部分：`src/portfolio` 作为与路由解耦的领域模块、`content/` 作为唯一内容契约、
`public/sw.js` 离线缓存、SEO/PWA 全套。

## 2. 当前结构与数据流

```
浏览器 ── / ──► page.tsx ─ getSiteContent() ─► content/published.json  （有就用）
                                              └─ content/defaults.ts    （没有就用）
                              └► Portfolio(content)   ← 内容就是构建时的那一份，没有任何运行时覆盖
```

- **内容来源**：`content/source.ts#getSiteContent()` 是唯一入口，`node:fs` 读构建期快照，
  读不到就退回 `defaults.ts`。没有数据库分支，也没有客户端草稿覆盖——访问者看到的就是构建出来的那一份。
- **发布**：改 `published.json`（或 `defaults.ts`）→ 提交 → CI 重新导出。部署即发布。
- **没有 `/admin`**：静态站没有会话可保护、没有接口可写，浏览器内的「编辑器」只能是个模拟器：
  改动存本地、再由用户手动导出文件提交。既然发布本来就是提交一个文件，那一步就没必要多一层。
  于是 `/admin` 路由与整套 `portfolio/admin/*`、`portfolio/client/*` 一并删除（约 1,300 行）。
  内容出错时由 TypeScript 在 `types.ts` 上兜底，而不是由表单校验兜底。

## 3. SEO

- `layout.tsx`：`metadataBase`、title 模板、description、Open Graph / Twitter 卡片、`lang`（随默认语言 zh-Hans / en）、robots、canonical、`themeColor`。
- `page.tsx`：JSON-LD（WebSite + Person + 每个作品 CreativeWork）；内容经 SSR 输出，爬虫无需执行 JS 即可读取全部文案。
- `/works/[id]`：每个作品独立可收录页面（标题、详情介绍、详情图、BreadcrumbList）。
- `robots.txt`、`sitemap.xml`（含全部作品页）、`manifest.webmanifest`、`icon.svg`、`apple-icon.png`——均由构建期内容生成。
- `/offline` 设为 noindex / Disallow。
- 站点 URL 在**构建期**定死（`NEXT_PUBLIC_SITE_URL` → `SITE_URL` → 平台注入变量 → localhost，见 `seo/site.ts`），
  静态托管没有请求时的 Host 可读。
- `sitemap.xml` 的 `lastmod` 取 `published.json` 的 `exportedAt`，而不是构建时间，否则每次部署都等于「全站更新」。

## 4. PWA / 离线

`public/sw.js`（无构建依赖）：

| 请求 | 策略 |
|---|---|
| `_next/static`、`images`、`fonts`、`icons`、`gltfs` | cache-first |
| 页面导航 | network-first → 缓存副本 → `offline` |
| manifest | network-first，离线读缓存 |
| 非 GET | 不缓存 |

**没有一处写死绝对路径**：GitHub Pages 项目站在 `/repo/` 下，worker 用 `self.registration.scope`
反推出自己的前缀（`BASE`），CORE 列表、静态资源前缀、离线兜底页全部由 `at()` 拼出来。
`PwaRegister` 同时把脚本地址和 scope 都带上 `BASE_PATH`——注册在源站根目录的 worker 会 404，
而且万一存在会接管整个 `*.github.io` 域（包括别人的项目）。实测：scope 是
`/repo/`、缓存键全部带前缀、断网刷新仍能从缓存打开首页。

`PwaRegister` 仅在生产构建注册；开发模式反而会注销旧 SW。manifest 提供 192/512/maskable 图标
与快捷方式，可安装为桌面应用（`id`/`start_url`/`scope`/icons 都带部署前缀，否则装上去会打开站根）。
更新缓存：修改 `sw.js` 的 `VERSION`。

## 5. 图片「画框」约定（换图不用管尺寸）

Hero、肖像（含重影层）、画廊、两张点缀图、电视封面、作品详情页的所有图片都放在**设计固定尺寸的容器**中，
`<img>` 绝对定位铺满、`object-fit: cover`、`max-width: none`，容器带 `overflow:hidden; contain: layout paint`。
因此任意比例/像素的新图都只会被裁切，不会改变容器尺寸、不会触发回流，GSAP 时间线的测量值不变。
电话亭改为 WebGL 模型（见第 6 节），模型未就绪时用透明抠图 `/images/phone-booth-cutout.png` 兜底，`object-fit: contain`。

**响应式尺寸**：静态导出没有图片优化服务，`public/` 里是什么、访客就下载什么。所以
`scripts/build-images.mjs`（`npm run images`，`build:static` / `dev` 之前自动执行）会把
`public/images/**` 压成 480 / 800 / 1200 三档 WebP，写进 `public/images/opt/`，同时生成
`src/portfolio/content/image-manifest.json`；`ui/Img.tsx` 按清单给每个 `<img>` 挂
`srcSet` + `sizes`（`sizes` 是各版面实测的 vw 值，见组件调用处）。两条例外：`.webp` 源
（也就是被换成照片的电视图派生出的 `tv-cutout.webp`）同样进管线，用 `OVERRIDES` 里单独的一档
（1280/1920/2560，q90——它带 alpha 洞，质量低了羽化边会毛）——它的 `sizes` 不是视口宽度，
而是 `max(160vw, 230vh)`。母图 `tv.webp` 与光场图 `tv-glass-glow.webp` 在 `SKIP` 里，不进管线。
三条不变量：

1. `src` 永远是真实文件——清单没跟上、浏览器不支持 `srcSet`、图被删掉，都只是"没有优化"，不会 404/空白；
2. 不包 `<picture>`——`.story-photo-mask img`、`.tv-frame` 这类选择器，以及 flex 几何，都要求 `<img>` 自己就是那个盒子；
3. 清单是提交进仓库的生成物，脚本按 mtime 增量跳过，几十毫秒就跑完。

**电视图的分层**：边界不再由第二份「量出来的矩形 + clip-path」决定，而是**抠进照片本身**。
`npm run tv-cutout`（`scripts/tv-cutout.mjs`，`dev`/`build` 前自动跑）读取母图 `tv.webp` 与
`works.tv.screen` 的百分比矩形，在玻璃位置抠出一个圆角、羽化的 alpha 洞，写出
`tv-cutout.webp`（站点渲染的就是它）和一张 `tv-glass-glow.webp` 光场图（母图屏幕区域的
中灰归一化高通：暖/绿光晕、高光斑、边缘暗角）。DOM 上 `.tv-screen`（画面层）在 `.tv-frame`
（抠洞机柜图）**之下**，所以可见边界永远是照片自己的内边框——画面和边框同属一张图，
任意缩放旋转都不会错位，也就没有「贴上去的矩形」那圈缝；洞的羽化边让画面到边框是软过渡。
`works.tv.screen` 只需**大于**洞（洞 = 矩形四边各收 15px），多出的部分被边框盖住，
只负责保证画面永远压到洞边之下。光场图以 `mix-blend-mode: overlay` 盖在整管屏幕最上层
（`.tv-glass-glow`，连雪花之上），让注入的画面吃进照片玻璃的现场光。
换照片流程：替换 `assets/images/tv.webp`（母图）→ `npm run tv-glass` 把红框（层矩形）和青框（实际抠洞）
画在母图上肉眼对齐 → 把百分比写回 `works.tv.screen` → `npm run tv-cutout && npm run images`。

## 6. 转场与 Contact 区动效

**电视退场 → 白场 → Contact**（`scroll/choreography.ts#television` 的 `exitTl` + `contact()`，全部绑定滚动 scrub）。
退场的每一拍都是重叠的，中间没有「停住的白屏」：

1. `@BrainEno` 字样放大（模拟镜头推进）并虚化消失；
2. 独立的 `.tv-scanlines` 条纹层与 `.tv-glass` 光泽层同时淡出（条纹滤镜「消失」）；
3. `.tv-box` 用 30% 的退场距离推进到 `scale 5.6`（约 270px 滚动，一次滚轮不会跳帧），屏幕渐变在推进过程中就切成纯白，
   `.tv-whiteout` 紧随其后——看到的是「从电视里膨胀出来的白色闪光」，而不是一块灰色屏幕。
4. `.contact` 的 `margin-top: -56vh`（移动端 `-40vh`）让它压进退场段：它的背景色由 `rgba(255,255,255,0)` 淡入成白色，
   所以白色是「淡进来」的，不是一张白纸滑过黑场。
5. 与此同时标题三行 `contact-line-text` 已从各自的 mask 里自下而上 stagger 升起（触发点在 `#contact` top 86%→18%），
   电话亭也已经从右侧飞入——**白场结束前画面里已经有内容**。
6. 标题不再做「逐行切片擦出」：`#contact` top 106%→38% 之间，整块以**实体文字**从下方抬起（`y +34vh → 0`）
   并淡入，读者第一眼看到的就是完整的字行；文字没有 mask 位移，字距/行高不会在滚动中变化。
   触发点比上一版提前 8%，白场还在膨胀时字就已经在往上走。
7. 版式是**底对齐 + 满高**：`.contact-headlines` 用 `margin-top: auto` 压到走马灯正上方；`.contact-booth` 改为
   `top: 0` / `bottom: 22.4svh` / `right: 4.4vw`——顶部贴到版面边际，底座落在走马灯上沿**上方**的一条地板上，
   与滚动的字条留出空隙（底座绝不压在字条上）。高度因此收到 77.6svh，比上一版小约一成：
   1280×800 下 349×621、1440×900 下 393×698、1920×1080 下 471×838；底座下沿分别落在 621 / 698 / 838，
   而走马灯上沿在 633 / 712 / 841，任何尺寸都不相碰。
   标题块同时被推**上**一点、拉近走马灯（`margin-bottom: 4.2vw`），并向**右**挪 0.8vw——空出来的中间地带
   正好给「MARQUEE MOON」这一行。字号不是写死的 vw，而是被**到电话亭的间距**限制：
   `clamp(38px, min(8.9vw, (88.7vw − 38.9svh) / 8.3), 176px)`，即「剩下多少宽度 ÷ 这行每 em 占的宽度」，
   所以无论窗口多宽多矮都不会撞上模型（1280 下 99.3px、1440 下 111.7px、1920 下 154.6px）。
   8.3 是当前字体的 em 宽度，换字体就会变，因此 `sections.tsx#Contact` 在挂载 / resize / 字体就绪后
   用 Range 量一次真实字宽，只在**会撞上时**往下压（写进 `--contact-fs`），CSS 的 clamp 保留为上限。
   移动端（<768px）电话亭改为在标题下方堆叠，这一步自动跳过。

**Contact 排版**：`.contact` 不再有圆角前沿与上投影，也不做 `overflow: hidden`（电话亭要从 section 边界之外入场）。

**作品区换台（`ui/TvShowreel.tsx`）**：悬停作品行时，电视不是淡入淡出，而是**换台**——失掉场同步、雪花、重新锁定。
和参考站（danielspatzek.com）的做法对齐，但用三层便宜的 DOM 复刻，整段约 0.58s：

1. `0–0.11s`：正在播的画面 `scaleY → 0.02` 同时 `brightness 3.4 / saturate 0`，在 `0.09s` 起淡出——画面塌成一条亮线；
2. `0.06–0.34s`：`.tv-sync-line` 白色水平亮带在玻璃中央亮起再散开；
3. `0.10–0.52s`：`.tv-static`（运行时生成一张 160² 的噪点图当 repeating background，`steps(9)` 抖动背景位置）
   与 `.tv-roll`（横扫的白色亮条）接管屏幕，`0.20s` 在雪花**底下**换掉图源；
4. `0.26–0.50s`：新画面 `scaleY → 1`（`power3.out`）+ 滤镜锁回，此时雪花仍是满屏，于是新频道是「从雪花里解出画面」；
5. `0.42–0.58s`：雪花与亮条淡出，频道稳定。

关键在**层序**：`.tv-static` 的 `z-index` 必须高于玻璃 / 亮条（5，`.tv-roll` 6，`.tv-sync-line` 6），
否则雪花只是「贴在旧画面上的一层贴花」，换台会穿帮。`prefers-reduced-motion` 下整段跳过，只换图。
`NODE_ENV !== "production"` 时暴露 `window.__tvTl` / `__tvRate`，供截图脚本把 0.58s 放慢到逐帧检查。

**电话亭（3D 模型）入场**：从**右下角**抛出、沿一条向上鼓起的弧线落在左上方的静止位，不是对角线位移，也不是从小到大缩放：

- 起点：`x +92vw · y +46vh · rotation 7° · scale .88`（完全在屏幕右下角之外）；
- 第一段（`0→0.32`）`y → +8vh` 而 `x → +62vw`：**纵向先走、横向后走**，弧线因此朝左上鼓出来；
  实测纵向进度在整个飞行里始终领先横向，所以永远看不到两点之间的那条弦；
- 第二段（`0.32→0.82`）`x → 0`（`power1.inOut`）同时 `y → 0`、`rotation → 0`、`scale → 1`，横向在这一段扫完；
- 整条轨迹在 1280×800 上采样（横向/纵向完成度）：`0/0 → .14/.35 → .24/.60 → .33/.82 → .42/.93 → .72/.98 → 1/1`；
- **不再对画布做 `rotationY`**：CSS 3D 旋转会让画布透视压缩，模型看起来「扁平、被挤扁」；
  转动完全交给 WebGL 里的自转（`0.16 rad/s`，约 39 秒一圈，接近参考站的香蕉模型节奏），体积感因此不会丢失；
- 比例 `0.88 → 0.93 → 1`，一路轻轻变大，不出现「从小点放大」的观感。
- 落位见上文第 7 条：画布顶到版面顶部、底座踩在地板线上，是这张纸能给到的最大尺寸。

**模型与渲染**：
- `public/gltfs/telephone.glb` 由 `scripts/optimize-booth-model.py` 从原始 `assets/models/telephone.gltf`（38 MB，buffer base64 内嵌）生成：
  几何原样保留，9 张 2048² PNG 重编码为 baseColor 1024² / normal 1024² / metallicRoughness 512² JPEG，产物约 2.15 MB。
- `ui/PhoneBoothModel.tsx` 在 contact 进入前 1.5 屏时（IntersectionObserver + 动态 `import()`）才加载 `three` 与模型；
  离开视口或标签页隐藏时暂停渲染；加载失败 / 无 WebGL 时回落到抠图。
- `three/booth.ts`：PMREM 房间环境光 + 三点布光（`exposure 0.9`、key 1.85、hemi 0.78、rim 0.85、`envMapIntensity 0.32`，
  比早先版本整体压暗一档，红漆更沉）、按包围盒归一化（脚底 y=0、高度 1）、慢速自转（0.16 rad/s）、
  鼠标拖拽带惯性、`ResizeObserver` 重新取景。GSAP 管外层 `.contact-booth` 的轨迹，渲染器管内层自转，互不打架。
- **取景（不再被画面边缘切掉）**：电话亭是方箱形，转 45° 时投影宽度最大，而不是高度最大。早期按高度取景
  （`FRAME_FILL`）会让箱体在斜角时冲出画布——画布透明、底色是白纸，于是看起来像「被白色切掉一角」。
  现在 `frameCamera()` 会在 0°/15°/…/90° 的偏航角上逐个投影所有网格包围盒的 8 个角点，二分出最小的相机距离，
  使任何角度的 |NDC| 都 ≤ `SILHOUETTE_FILL = 0.97`（四周各留 3% 安全区），并随画布宽高比自适应（手机竖屏重新算）。
  代价是相机比「只看高度」时略远，模型因此按画布尺寸补偿。
- **把电话亭面板上的号码换成邮箱（这一版是真正删掉，不是盖住）**：号码不是贴图，而是四面各一块纯黑、无贴图的字面片
  （加载后名字被 glTF 规范化成 `Text` / `Text001` / `Text002` / `Text003`，扫描条件因此是 `/^Text(\d+)?$/`）；
  它们与门板共面（z-fighting），平时根本不显示，只在模型转到斜角时才从门板与铭牌之间挤出来——这正是上一版「号码穿帮」的原因。
  现在这四块字面片直接 `visible = false`，号码从渲染里消失。铭牌 `retypeLettering()` 在 `stage` 坐标系里为每个面重建一块
  `PlaneGeometry`：法线取「面片中心 − 模型中心」的水平分量并**吸附到主轴**（面片在门板上略偏心，不吸附会歪几度），
  宽度取字面片宽度 ×1.0、高宽比 3.1（正好落进门板凹槽），`MeshBasicMaterial` + `toneMapped:false` 的 `CanvasTexture`，
  沿法线外推 0.6% 防 z-fighting。铭牌挂在 `stage` 而不是字面片下面——否则会跟着父级一起被隐藏。
  已在 0°/90°/180°/270° 四个正对角度上逐帧确认：四面都是完整的邮箱铭牌，任何角度都不再出现旧号码。
  文案取自 `content.email`，后台改邮箱会跟着变。
- `prefers-reduced-motion` 下跳过入场时间线与自转，模型静态显示。

## 7. 已知限制 / 后续

- 内容改动没有图形界面：`published.json` 是 JSON，字段含义见 `docs/QUICKSTART.md` 与 `content/types.ts`。
- 电视机默认是矢量原创插画（`tv-placeholder.webp` 的源），可以直接用**你自己的照片**替换
  `assets/images/tv.webp`；换完后跑 `npm run tv-glass` 把屏幕矩形画在母图上肉眼对齐，
  把百分比写回 `works.tv.screen`（矩形要盖住玻璃并压上内边框几像素），再跑
  `npm run tv-cutout && npm run images` 重新抠洞、生成派生图与清单。
  照片比例换得狠时，`160vw / 230vh` 的锚定尺寸也要复核。
  电话亭为上传的 glTF 模型。
- 仓库同时保留原始 `telephone.gltf`（38 MB，在 `assets/models/`）与优化后的 `.glb`（2.15 MB，在 `public/gltfs/`），
  只有 `.glb` 参与运行时加载。源文件**必须**留在 `public/` 之外：`public/` 会被原样拷进 `out/`，
  一个运行时从不下载的 38 MB 文件会把每次部署从 6 MB 变成 43 MB。
- 图片清单（`image-manifest.json`）是生成物：换图后没跑 `npm run images` 时，新图仍能显示，只是没有 `srcSet`。
- Aeonik 为商业字体，未随仓库分发；放入本机或自行添加 `@font-face` 源即可，缺省回退 Inter。
