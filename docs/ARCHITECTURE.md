# 架构说明与本轮重构记录

## 1. 对原仓库（BrainEno/portfolio-template）的结构审查

| # | 发现 | 问题 | 处理 |
|---|---|---|---|
| 1 | `export/react-router/` 整套第二份工程 + `scripts/build-export.mjs` + 后台「下载 zip」 | 同一产品两套入口、`src/portfolio` 靠脚本拷贝，易漂移；Netlify 其实能直接跑 Next | **删除**，Next 工程原生适配 Netlify/Cloudflare/VPS |
| 2 | `/adam` 只读预览路由（笔误产生） | 与 `/admin` 重复、`preview` 分支污染 `AdminApp`/`ModeBar` | **删除**路由与全部 `preview` 分支；`/admin` 自身即演示入口 |
| 3 | `server/db.ts` 465 行 | 平台识别、连接串、DDL、Postgres 存储、演示存储、探测、密码全混在一起 | 拆为 `types / state / connection / storage / backend` |
| 4 | `server/api.ts` 314 行 | content、upload、media、session、backup、status 处理函数混写 | 拆为 `http / content-handlers / session-handlers / backup-handlers / status-handler`，`api.ts` 仅做出口，路由文件不变 |
| 5 | `admin/AdminApp.tsx` 972 行 | 字段组件、各页签、数据面板、登录、壳在一个文件 | 拆为 `shared / fields / editor / DataPanel / Login / AdminApp` |
| 6 | `src/db/index.ts` 无 `DATABASE_URL` 就 `throw` | 与「无数据库也能跑」矛盾，且运行时并未使用 drizzle 客户端 | 删除；`src/db/schema.ts` 保留为 drizzle-kit 的表定义来源 |
| 7 | `drizzle.config.json` 写死本机连接串 | 换机器就失效 | 改 `drizzle.config.ts`，读 `DATABASE_URL` |
| 8 | 字体：首页与后台各自 `@font-face`、Google Fonts `<link>` 阻塞渲染、`/fonts` 文件不存在导致 404 | 两处字体可能不一致 | 统一到 `globals.css` 的 `--font-sans/--font-serif/--font-cjk`；Inter / Inria Serif 用 `next/font` 构建期自托管 |
| 9 | 公共图片资源（`public/`）未提交 | 下载代码后图裂 | 补全 `public/images`（公开授权照片 + 矢量电视机/电话亭，生成脚本 `scripts/art`） |
| 10 | 在 Workers 之外也 `import("@opennextjs/cloudflare")` | Node 上白白加载 | 仅在 `navigator.userAgent === "Cloudflare-Workers"` 时导入 |
| 11 | 内网库（`db` 主机名 / `sslmode=disable`）会被强制 TLS | docker-compose 连不上 | 新增 `isPlainTcp` 判定 + `DATABASE_SSL=false` |
| 12 | 无 sitemap/robots/manifest/离线 | SEO、PWA 缺失 | 见第 3、4 节 |

保持不变（审查后认为合理）：`src/portfolio` 作为与路由解耦的领域模块；`content/` 作为唯一内容契约；
首页「服务端读内容 → 客户端编排」；运行时自动建表；Netlify 迁移文件。

## 2. 当前结构与数据流

```
浏览器 ── / ──► page.tsx ─ loadContent() ─► storage.readContent()
                              │                 ├─ Postgres(site_content)         [Live]
                              │                 └─ 内存默认值 defaultContent(mock) [Demo]
                              └► Portfolio(content, mode)
                                    └ Demo 模式下 useLiveContent 订阅 localStorage 草稿(BroadcastChannel)
/admin ──► AdminApp ─ /api/session ─► Live: Cookie 会话 · Demo: 直接放行(数据只在本浏览器)
          编辑 ─► Live: PUT /api/content (发布)   Demo: saveDemoContent (400ms 自动写缓存 → 首页实时变)
```

- **模式判定**（`server/backend.ts#probeBackend`，15 s 缓存）：能连库并读到表 → `postgres`；否则 `demo`。
  一旦 `postgres`，`getStorage()` 只返回数据库存储，浏览器草稿与 mock 不再被读取——即**自动废除假数据**。
- **连接解析**（`server/connection.ts`）：Cloudflare Hyperdrive → Cloudflare 变量 → `process.env` 多个键 → `@netlify/database`。
- **建表**（`server/storage.ts#ensureSchema`）：Netlify 校验迁移已执行；其他平台 `create table if not exists`。

## 3. SEO

- `layout.tsx`：`metadataBase`、title 模板、description、Open Graph / Twitter 卡片、`lang`（随默认语言 zh-Hans / en）、robots、canonical、`themeColor`。
- `page.tsx`：JSON-LD（WebSite + Person + 每个作品 CreativeWork）；内容经 SSR 输出，爬虫无需执行 JS 即可读取全部文案。
- `/works/[id]`：每个作品独立可收录页面（标题、详情介绍、详情图、BreadcrumbList）。
- `robots.txt`、`sitemap.xml`（含全部作品页）、`manifest.webmanifest`、`icon.svg`、`apple-icon.png`——均由数据库内容生成。
- `/admin`、`/api`、`/offline` 设为 noindex / Disallow。
- 站点 URL 自动取自 `NEXT_PUBLIC_SITE_URL` 或各平台注入变量（`seo/site.ts`）。

## 4. PWA / 离线

`public/sw.js`（无构建依赖）：

| 请求 | 策略 |
|---|---|
| `/_next/static`、`/images`、`/fonts`、`/icons`、`/api/media/*` | cache-first |
| 页面导航 | network-first → 缓存副本 → `/offline` |
| `/api/content`（GET）、manifest | network-first，离线读缓存 |
| `/admin`、其他 `/api/*`、非 GET | 不缓存 |

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
   `top: 0` / `bottom: 13.7svh` / `right: 7.5vw`——顶部贴到版面边际、底座踩在走马灯上沿那条通栏细线（也就是这张「纸」的地板线）上。
   于是电话亭是**能吃到的最大尺寸**：1280×800 下画布 799–1188 / 0–691（389×691，约 30vw×86svh，比上一版高 +11%），
   1440×900 下 438×777，1920×1080 下 526×933。再大就只能压到走马灯上了。

**Contact 排版**：`.contact` 不再有圆角前沿与上投影，也不做 `overflow: hidden`（电话亭要从 section 边界之外入场）。

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
- 电视外框为矢量原创插画，可在 Television 页签校准玻璃位置后替换为自己的照片；电话亭为上传的 glTF 模型。
- 仓库同时保留原始 `telephone.gltf`（38 MB）与优化后的 `.glb`（2.15 MB），只有 `.glb` 参与运行时加载；
  若不需要再修改模型，可移除原始 `.gltf` 以减小仓库体积。
- 首位访问 `/admin` 的人设置密码：生产环境请在部署后立即访问，或设置 `ADMIN_PASSWORD`。
- Aeonik 为商业字体，未随仓库分发；放入本机或自行添加 `@font-face` 源即可，缺省回退 Inter。
