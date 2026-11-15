# Uoya 魚家

Uoya 是一个可自行部署的 3D 住宅和共享 AI 室友应用。你可以在浏览器中与角色聊天，观察她在家中的活动，与家具互动，并与其他成员共享同一个空间。

## 功能

- **3D 住宅**：浏览房间、控制照明和角色，与床、沙发、厨房及其他家具互动。角色可根据生活状态自主活动；多端同步位置和动作。
- **群聊与 AI**：共享聊天、流式回复、Markdown、图片及视频附件、语音输入和朗读。管理员可配置 AI 服务、名称、头像和人格。
- **日常生活**：角色拥有生活状态、钱包和背包；用户拥有独立钱包，可以购买物品或给角色金币。
- **空间管理**：支持加入方式、成员审核、禁言、移出及每日 token 额度。用户可修改昵称、头像和密码。
- **长期记忆**：通过本地 LongMemory 与 SQLite 保存和检索记忆。

界面主要使用中文。AI 服务、语音服务和公网连接需要自行配置；家具动作和自主活动需要有运行中的浏览器页面执行 3D 场景。

## 开始使用

需要 Node.js 22.13 或更新版本，以及安装原生依赖所需的编译环境。容器部署需要 Docker 和 Docker Compose。

```sh
npm install
npm run build
npm start
```

首次启动前请参考 [部署指南](DEPLOYMENT.md) 配置管理员账号和环境变量。默认入口为 `http://127.0.0.1:8080`。开发模式使用 `npm run dev`；`npm run preview` 仅预览前端。

使用 Docker 时，从 `.env.docker.example` 创建本地配置并填写管理员凭证，然后运行：

```sh
docker compose build
docker compose up -d
```

具体配置、HTTPS、数据持久化和升级方法见 [部署指南](DEPLOYMENT.md)。请妥善备份数据库、上传文件、人格文件及 AI 配置密钥。

## AI 与语音

管理员可在控制台配置兼容的 AI 服务。不同服务对工具调用、图片、视频和联网搜索的支持不同，请以服务商能力为准。聊天 API 的密钥由服务端保存。

浏览器朗读可直接使用；服务端朗读和语音转写需要单独配置。语音转写使用 `ASR_ENABLED`、`ASR_PROVIDER_URL`、`ASR_MODEL` 和 `ASR_API_KEY`，示例见 [.env.example](.env.example)。服务端语音请求受成员身份、token 额度及每日语音请求预算约束；手机麦克风通常需要 HTTPS。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `src/` | 3D 场景、角色和主界面 |
| `public/social-chat/` | 聊天和管理界面 |
| `public/life/` | 商店和背包界面 |
| `server/social-chat/` | 认证、聊天、AI、记忆和成员管理 |
| `server/life/` | 钱包、物品与生活规则 |
| `scripts/` | 构建、启动与资源校验 |
| `tests/` | 回归和集成测试 |

运行检查：

```sh
npm test
npm run test:chat
npm run test:life
npm run test:network
```

## 许可证与致谢

项目自有代码采用 [GPL-3.0-only](LICENSE)。第三方代码和素材保留各自许可，详见 [NOTICE](NOTICE) 和 [docs/licenses](docs/licenses)。其中包括 Three.js、three-vrm、LongMemory、Kenney 素材、marked 和 chat-demo-main；React Bits 衍生界面包含 Commons Clause 附加限制，角色模型也有独立使用条件，整个组合不能视为仅受 GPL 约束。

角色模型：**蓝色小肥鱼 Deepseek鲸鱼娘**，制作者 **木子恶魔 / MZEM**，发布平台 **模之屋**；联系方式：[Bilibili](https://space.bilibili.com/95816706)。


Docker试验自动更新可在控制台“运行情况”中设置。需先运行 `docker compose --profile auto-update up -d --build updater`；开启需要额外确认。功能涉及停机、存档备份、容器重建与失败回退，具体权限、版本识别、部署及恢复方法见 [DEPLOYMENT.md](DEPLOYMENT.md)。
