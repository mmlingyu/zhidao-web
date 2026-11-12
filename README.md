# 知岛 · Web 前端

原生 HTML / JavaScript / CSS 静态应用，无框架打包依赖。后端独立位于 [zhidao-api](https://github.com/mmlingyu/zhidao-api)。本仓库只负责网页、浏览器人脸识别、语音、PWA 和 A2UI 交互渲染，不包含模型服务密钥或账号数据。

## 项目结构

```text
zhidao-web/
├── index.html                     # 页面入口
├── config.js / api-config.js       # 公开 API 地址配置与地址拼接
├── app.js / dynamic.js             # 主页与课程/追问请求
├── identity*.js / learner.js       # 身份、家庭、年级
├── face.js                        # 浏览器摄像头、人脸特征提取
├── knowledge-client.js / *.css     # 知识卡片界面与样式
├── mascot*.js / voice.js           # 知知形象、对话、朗读
├── grade-profile.js / feedback.js  # 前后端共享纯逻辑
├── a2ui-*.js                       # 组件协议、共享编译器、游戏与浏览器渲染
├── pwa.js / sw.js / manifest.webmanifest
├── public/
│   ├── model/                     # 人脸模型
│   ├── vendor/                    # 浏览器人脸识别、TensorFlow wasm
│   └── tts/                       # 语音引擎、ORT wasm、音色、模型配置
├── tts/engine.entry.js             # 离线语音引擎源码
├── build-face.js / build-tts.js / fetch-tts-model.js
├── scripts/serve.js                # 本地静态预览，映射 public/ 到根 URL
├── scripts/build.js                # 生成可直接静态托管的 dist/
├── scripts/check.js / test-split.js
└── package.json / package-lock.json
```

`a2ui-*`（除仅浏览器使用的 `a2ui-render.js`）、`grade-profile.js`、`feedback.js` 是实际被浏览器和 Node 同时使用的纯逻辑，故两仓库各保留一份；后续修改需同步。`knowledge.js` 是 CommonJS 服务端知识数据，不在前端仓库。

## 本地运行

需要 Node.js 20+。已有预生成浏览器资源，本地预览不必安装依赖：

```bash
node scripts/serve.js
# 浏览器打开 http://127.0.0.1:8080
```

编辑 **config.js**（脚本已在所有业务模块之前加载）：

```js
window.ZHIDAO_API_BASE = 'http://127.0.0.1:3000';
// 线上示例：'https://api.example.com'；不要追加 /api，也不要放密钥。
// 若 Nginx 已将本站 /api/ 反代到后端，保持空字符串即可。
```

后端的 `CORS_ORIGINS` 配置为前端真实 Origin（含端口、不带路径）。身份、年级、知识卡片和课程请求均支持此配置；人脸模型自检直接探测前端静态资源，不依赖 API 的文件系统。

## 静态部署（Nginx / CDN）

```bash
npm run check
npm test
npm run build
```

把 **dist/ 的内容**作为站点根目录发布；不是直接把仓库目录或 `public/` 当根目录。构建会把 `public/model`、`public/vendor`、`public/tts` 展平为 `/model/`、`/vendor/`、`/tts/`，与现有 URL 一致。当前应用使用根路径，不支持未经适配的 `/zhidao-web/` 子路径托管（例如默认 GitHub Pages 项目路径）。**GitHub 仓库推送不等于线上托管部署。**

Nginx 最小示例（TLS / 域名按部署环境补充）：

```nginx
server {
    listen 80;
    server_name web.example.com;
    root /srv/zhidao-web/dist;
    include /etc/nginx/mime.types;
    location / { try_files $uri $uri/ =404; }
    location = /config.js { add_header Cache-Control "no-cache"; }
    location = /sw.js { add_header Cache-Control "no-cache"; }
    # 需要同源模式时启用，config.js 的 API base 保持空字符串：
    # location /api/ { proxy_pass http://127.0.0.1:3000; proxy_read_timeout 180s; }
}
```

确保 `.wasm` 响应 `application/wasm`，`.mjs` 响应 JavaScript 类型；大文件正确返回 Content-Length。生产请使用 HTTPS，摄像头和 PWA 需要安全上下文（localhost 可例外）。API 也应使用 HTTPS，避免混合内容阻断。更新配置后重新构建并发布；必要时更新或注销旧 Service Worker。

## 语音大模型与资源重建

Kokoro 的 `model.onnx` 为 **339,369,442 字节，约 324 MiB**，超过普通 GitHub 单文件 100 MiB 上限，因此不拷贝、不提交模型本体；已保留模型配置、tokenizer、全部音色、引擎和 wasm。部署机器联网执行：

```bash
node fetch-tts-model.js --model
npm run build
```

脚本从 Hugging Face 固定 revision `6cc0f0d2ebe369a68b0df87c2b65c1af8c0ac3e3` 下载到 `public/tts/models/onnx-community/Kokoro-82M-v1.1-zh-ONNX/onnx/model.onnx`，该文件已 gitignore。完整离线朗读须在发布前补齐；未补齐时引擎可尝试在线回退，不能保证离线合成。

人脸资源重建可 `npm ci && npm run build:face`；语音引擎通常无需重建（已提交产物）。如需重建，先在单独工具依赖目录安装 `esbuild`、`@uzen/kokoro-js`、`@huggingface/transformers`，设置 `TTS_DEPS_DIR` 指向其 node_modules，再运行 `npm run build:tts`。原语音构建脚本保留旧 Windows 备用路径，部署请不要依赖该路径。

## 安全与验证

当前 GitHub 仓库是公开的（未改可见性）。不要把 API 密钥、管理令牌、用户数据或 `.env` 放入前端/仓库；浏览器代码与 `config.js` 始终公开。`npm run check` 验证根目录 JS 语法；`npm test` 验证 API 地址拼接、静态构建入口和资源路径。摄像头、语音与完整浏览器交互仍需部署后在真实浏览器验收。
