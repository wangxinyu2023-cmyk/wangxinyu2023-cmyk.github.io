# Xinyu Wang — Portfolio Site (v2)

双击 `index.html` 即可在本地预览。

## 改内容（不用碰代码）
所有文字、图片、项目顺序都在 `content.json` 里：
- `site`：名字、简介、邮箱、社交链接、About 页内容、`base_url`（上线后改成你的网址）
- `projects`：每个项目的标题、年份、类别（Studio / Research / Self-initiated，首页按它筛选）、正文、图片和图注
- `publish: false` = 草稿，首页不显示（例如未交的作业）

改完运行一次：`python _src/build.py`（需要 Pillow）。它会自动：
- 给每张图生成 800 / 1600 / 2400 px 三个尺寸，写入 `images/_r/`，浏览器按屏幕大小加载
- 生成模糊占位图，图片加载完成前先显示
- 生成 `sitemap.xml`、`robots.txt` 和社交分享预览（Open Graph）

## 参考过的开源项目
- lechaosx/architecture-portfolio：图库查看器（左右切换、手势、键盘、可分享的 #image-N 链接）、草稿隐藏、内容和代码分离
- MasuRii/modernphotography-portfolio-template：模糊占位图、类别筛选、SEO、无障碍、GitHub Actions 部署
- matgiverdu81/portfolio：纯静态、不需要编译框架，直接放在 GitHub Pages 上

## 上线（GitHub Pages）
1. 新建 GitHub 仓库，把整个文件夹推上去（main 分支）
2. 仓库 Settings → Pages → Source 选 "GitHub Actions"
3. `.github/workflows/pages.yml` 会自动生成网站并发布
4. 把 `content.json` 里的 `base_url` 改成 `https://你的用户名.github.io/仓库名/`

## 发布前检查
- Osborn Plaza 还没交：先把 `publish` 设成 `false`
- Transforming Light 用的是课程图库照片：确认版权
- 邮箱、社交链接、About 页里的学校信息还是占位
## 3D scroll animations
Each project page opens with a three.js scene (item kind `model3d` in content.json):
`anim` = deploy (Osborn), explode (Clinton Hill), grow (Between Levels), unfold (NYBG).
Scripts live in `assets/anim/<slug>.js`, model data in `assets/models/<slug>.js` (regenerate with `_src/export_*_3d.py` / `_src/build_triangle_model.py`), three.js r160 in `assets/vendor/`.
Add `?explode=0.5` to a page URL to freeze an animation at a given progress for screenshots.

## Explore the model (interactive viewer)
Item kind `explorer` in content.json renders a full-width viewer (stage + control panel) and a TOC entry "3D":
```json
{"kind":"explorer","id":"explore","model":"assets/models/<slug>.js","adapter":"assets/explore/<slug>.js",
 "tools":["section","sun","paths"],"lat":40.66849,"lon":-73.90852,"north_deg":78.946,
 "default_sun":"2026-07-21T14:00","title":"...","caption":"..."}
```
- `assets/explore/explorer.js` (shared core, no modules/fetch): lazy-loads three.js, the model data and the adapter when the block approaches the viewport (scripts are de-duplicated with the scroll animations). Orbit controller (drag rotate, wheel/pinch zoom, right-drag/two-finger pan, arrow keys, `R` reset), Plan / Axon / Eye-level presets, renders only while visible and only when something changes.
- **Section**: one clipping plane (Section X, Section Y, Plan; plan-cut chips 4 ft / 1.2 m above each level), stencil-buffer caps so closed solids are filled dark (closedness is detected automatically), orange draggable handle, Flip.
- **Sun**: NOAA solar position for `lat`/`lon`, US Eastern time with DST, rotated by `north_deg` (counter-clockwise from model +X to true north, Rhino convention; Osborn 78.946 from `north_calibration.json`). With the sun on the viewer switches to a rendered look: MeshStandard twins of every material, ACES tone mapping with exposure following the sun, analytic sky shader, haze, warm low sun, PCF soft shadows fitted to the model (4096 High / 2048 Low; Low is the default on touch devices), sun-path gizmo, sunrise/sunset readout, Play day. Osborn adds procedural brick/concrete/mural textures, alpha-cut leaf-card tree crowns (dappled shadows) and perforated reed panels (dappled light through `customDepthMaterial` alpha), baked contact shadows, and a live "% plaza floor in direct sun" (GPU sampling of the shadow map on a 2 ft grid of the uncut model; "Shade map" shows the grid).
- Osborn context: `_src/export_osborn_env.py` patches `assets/models/osborn-plaza.js` (run after `export_osborn_3d.py`) with the LiDAR neighbouring buildings within 600 ft, the stepped 1 ft terrain and the 4 relocated lanterns. With them the readout gives 21 July 13:00 / 14:00: 55% / 51% of the plaza floor in sun on market day, 68% / 63% without the canopies (board: 52–54% and 65–68%).
- **Movement**: architectural-model scale figures (standing, two walking strides, seated) and deterministic agents (position is a function of time) walking each adapter's routes, with stops, sitting and fading trails; play/pause, speed, trails.
- Adapter = `XP.register('<slug>', ({T, util, plane}) => spec)`: returns `{unit, root, focus, levels, view, eye, paths:{scenarios}, layouts?, shade?, ao?, defaults?}`. Materials may carry `material.userData.pbr` overrides for the rendered look.
- URL parameters force a state (screenshots / deep links): `?view=plan|axon|eye&section=x:0.4|y:0.5|z:0.3|plan:1|off&flip=1&sun=2026-07-21T14:00|off&paths=1&t=12&speed=2&trails=0&layout=market|daily&shade=1&quality=low&tab=sun&yaw=-0.8&pitch=0.6&zoom=1.5&gizmo=0`.
