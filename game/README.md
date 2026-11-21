# 第一天游戏工程

正式入口是 `index.html`。运行用美术资源已经准备完成。在本目录执行 `npm ci` 和 `npm run dev` 即可开始。按 M 展开随身导航，按 F 上下车，按 Enter 完成当前交接。

| 路径 | 职责 |
| --- | --- |
| `src/campaign.js`、`src/campaign-course.js`、`src/stair-layout.js` | 首单状态、路网、门岗、停车与三层交付 |
| `src/courier-*.js`、`src/shift-actors.js`、`src/assets/aholo/` | 人车装配、骨骼动作、材质与生成资产 |
| `src/stair-interior.js`、`src/estate-*.js`、`src/*-life.js` | 楼梯、街道、居民和公共空间 |
| `src/ui*.js`、`src/pocket-map.js` | 漫画、手机接单、局内导航、触控与工资回执 |
| `art/reference/`、`art/Lux3D/assets/` | 原始设定、生成模型和重新制作所需的输入 |
| `scripts/`、`qa/` | 资源准备、构建、正常输入验收及录像 |

`npm run build:web` 的产物可放在网站根目录或项目子目录。`npm run build` 额外生成一个本地单文件。运行中的正式游戏不向 Aholo 发送请求。

早期的晴天与暴雨两单试作保存在 `?classic=1` 入口，其路线见《街区设计》。公开试玩默认使用 `campaign-course.js` 的首单地图，终点为 302 室。

### 复验

固定步进的关卡回归可运行 `node qa/first-order.sim.mjs` 和 `node qa/patrol-pressure.mjs`。浏览器实测使用 Playwright 和支持 WebGL 2 的 Chromium。单独安装测试工具后，可用 `QA_PLAYWRIGHT` 指向本机包、`QA_BROWSER` 指向浏览器。页面 `?qa=1` 只在开发构建中提供只读观测。

### 美术工程

用 Python、NumPy、Pillow 和 Blender 5.3 可复做骑手。先执行 `python scripts/prepare-lux.py`，从三份 Aholo 原件生成基础网格，默认保存到 `art/build/lux-base/`。可通过 `--blender` 或 `BLENDER_BIN` 指定 Blender。接着执行 `python art/Lux3D/assets/courier-original/bind-shift.py`，在同一个中间目录生成 21 根骨骼的骑手。此步复产的 `courier.glb` 与 `art/Lux3D/assets/courier-rigged-baseline/glb.glb` 归档逐字节一致。

执行 `blender -b --python-exit-code 1 --python scripts/refine-courier-knees.py -- --review`，可从绑定基准重新生成游戏中的膝部形变、鞋底接触数据以及 Blender 校样。成品模型保存在 `src/assets/aholo/`。制作源与实机对照图见仓库的 [art](../art/) 目录。
