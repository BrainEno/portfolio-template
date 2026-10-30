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

保留并强化的部分：`src/portfolio` 作为与路由解耦的领域模块、`content/` 作为唯一内容契约、
`/admin` 作为编辑器、`public/sw.js` 离线缓存、SEO/PWA 全套。

## 2. 当前结构与数据流

```
浏览器 ── / ──► page.tsx ─ getSiteContent() ─► content/published.json  （有就用）
                                              └─ content/defaults.ts    （没有就用）
                              └► Portfolio(content)
                                    └ useLiveContent：本浏览器有草稿就用草稿（localStorage + BroadcastChannel）

/admin ──► AdminApp（无会话、无网络请求）
           编辑 ─► saveDemoContent（400ms 防抖写 localStorage）→ 首页实时变
           Publish ─► 浏览器下载 published.json ─► 提交到 src/portfolio/content/ ─► 重新构建
```

- **内容来源**：`content/source.ts#getSiteContent()` 是唯一入口，`node:fs` 读构建期快照，
  读不到就退回 `defaults.ts`。没有任何数据库分支，所以产物里不可能出现数据库驱动。
- **草稿覆盖**：`client/useLiveContent.ts` 订阅 localStorage。访问者没开过编辑器就没有草稿，
  看到的就是构建时的那份内容——这是「本地预览」和「线上内容」之间唯一的桥。
- **发布**：没有写接口，所以「发布」= 把一个 JSON 文件提交回仓库。`/admin` 的 Publish 只做
  `Blob` 下载，`Ctrl/Cmd+S` 同效。

## 3. SEO

- `layout.tsx`：`metadataBase`、title 模板、description、Open Graph / Twitter 卡片、`lang`（随默认语言 zh-Hans / en）、robots、canonical、`themeColor`。
- `page.tsx`：JSON-LD（WebSite + Person + 每个作品 CreativeWork）；内容经 SSR 输出，爬虫无需执行 JS 即可读取全部文案。
- `/works/[id]`：每个作品独立可收录页面（标题、详情介绍、详情图、BreadcrumbList）。
- `robots.txt`、`sitemap.xml`（含全部作品页）、`manifest.webmanifest`、`icon.svg`、`apple-icon.png`——均由构建期内容生成。
- `/admin`、`/offline` 设为 noindex / Disallow。
- 站点 URL 在**构建期**定死（`NEXT_PUBLIC_SITE_URL` → `SITE_URL` → 平台注入变量 → localhost，见 `seo/site.ts`），
  静态托管没有请求时的 Host 可读。
- `sitemap.xml` 的 `lastmod` 取 `published.json` 的 `exportedAt`，而不是构建时间，否则每次部署都等于「全站更新」。

## 4. PWA / 离线

`public/sw.js`（无构建依赖）：

| 请求 | 策略 |
|---|---|
| `/_next/static`、`/images`、`/fonts`、`/icons`、`/gltfs` | cache-first |
| 页面导航 | network-first → 缓存副本 → `/offline` |
| manifest | network-first，离线读缓存 |
| `/admin`、非 GET | 不缓存 |

`PwaRegister` 仅在生产构建注册；开发模式反而会注销旧 SW。manifest 提供 192/512/maskable 图标与快捷方式，可安装为桌面应用。
更新缓存：修改 `sw.js` 的 `VERSION`。

## 5. 图片「画框」约定（换图不用管尺寸）

Hero、肖像（含重影层）、画廊、两张点缀图、电视封面、作品详情页的所有图片都放在**设计固定尺寸的容器**中，
`<img>` 绝对定位铺满、`object-fit: cover`、`max-width: none`，容器带 `overflow:hidden; contain: layout paint`。
因此任意比例/像素的新图都只会被裁切，不会改变容器尺寸、不会触发回流，GSAP 时间线的测量值不变。
电话亭改为 WebGL 模型（见第 6 节），模型未就绪时用透明抠图 `/images/phone-booth-cutout.png` 兜底，`object-fit: contain`。

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
- `public/gltfs/telephone.glb` 由 `scripts/optimize-booth-model.py` 从原始 `telephone.gltf`（38 MB，buffer base64 内嵌）生成：
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

- 后台界面文案为英文（含少量中文提示）；多语言化可在 `admin/` 内集中处理。
- 编辑器里的草稿只在本浏览器，且受 localStorage 配额限制（单图 ≤ 1.4 MB）；跨设备靠 Data 页签的备份文件。
- 电视外框为矢量原创插画，可在 Television 页签校准玻璃位置后替换为自己的照片；电话亭为上传的 glTF 模型。
- 仓库同时保留原始 `telephone.gltf`（38 MB）与优化后的 `.glb`（2.15 MB），只有 `.glb` 参与运行时加载；
  若不需要再修改模型，可移除原始 `.gltf` 以减小仓库体积。
- Aeonik 为商业字体，未随仓库分发；放入本机或自行添加 `@font-face` 源即可，缺省回退 Inter。
