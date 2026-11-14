# Uoya Release v1.0 交接

更新日期：2026-11-15（Asia/Hong_Kong）。

## 当前唯一修改目标

```text
C:\Users\Bravo\Downloads\blue-haven-a806-webgl-v3\blue-haven-a806-webgl-v3.1\release-v1.0
```

用户已纠正：从“图1删除蓝框、恢复魚家字样、移除头像五角星、恢复彩色表情”这条消息起的全部修改，均应落实到本目录。不要继续修改旁边的 blue-haven-v3.1。工具默认目录 blueprint-house-3d 仅可暂存工具脚本，不是目标项目。

本目录包名 uoya、版本 1.0.0、许可 GPL-3.0-only。保留它已有的发布、Docker、部署、安全、离线资源及账号初始化配置，不用旧开发项目整目录覆盖。用户要求单模型顺序执行，不使用子代理。

## 已迁入的修复

- 聊天输入框移除 textarea 内层蓝色焦点框，保留圆角容器焦点提示。
- 恢复原蓝色品牌图标及完整 Uoya 魚家字样，兼顾手机显示。
- 全局 SVG 替换排除 .agent-icon 和 .logo，资料更新时清理旧图标 SVG，避免自定义头像下方残留五角星。
- 生活页停止加载自动 SVG 替换，商品、背包、状态栏恢复真实彩色 emoji；兼容存量 food/gift 等图标名称，不迁移或改写用户商品数据。
- 长注册表单改为可滚动容器，手机/短视口压缩间距，提交按钮 sticky 并保留安全区间距，问题加入及申请说明不再将按钮挤出不可滚动区域。
- 用户明确批准移除多类操作频率限制：生活 API、家具 start/finish、群管理、个人/AI资料、AI设置、控制台、自主同步、人格编辑；本发行版没有的网络管理接口没有额外引入。鉴权、来源检查、字段校验、事务和幂等继续保留。
- 登录/注册、消息发送、附件上传、TTS 原独立限制未在这次批准范围内，仍保留；每日成员 token 上限不改，不得笼统屏蔽所有 429。
- 新增 server/life/tests/operation-frequency.test.mjs，覆盖连续读取与超过旧门槛的幂等购买，不重复扣款或增加物品。

这些修改是按本目录实际内容逐项迁移，未复制旧项目 package.json、许可证、Docker/部署配置、数据库或密钥。修改前的对应源文件和迁移清单备份在工具工作目录 repair-backups/release-v1.0-before-2026-11-14-fixes，备份不是运行项目。

## 文件定位

- index.html：品牌标识。
- public/ui/uoya-surface.css：输入焦点、品牌和彩色表情样式、手机注册滚动。
- public/ui/icons.js：自动图标转换范围。
- src/ui/social-chat.js：头像更新时清理 SVG 占位残留。
- public/life/app.js、index.html：商品/状态/背包 emoji。
- server/social-chat/src/index.mjs：群管理、资料、设置、控制台、自主同步和人格限频移除。
- server/life/src/api.mjs、server/social-chat/src/life-service.mjs：生活通用操作限频移除。

## 验证与启动

所有命令须在 release-v1.0 执行。npm.cmd run build 包含 verify-assets，不可跳过资源校验；生成 dist 不等于更新远端运行中的 Docker 镜像。

```powershell
npm.cmd test
npm.cmd run test:chat
npm.cmd run test:life
npm.cmd run build
```

本目录迁移后的验证：主测试 60 项、聊天测试 35 项、生活测试 23 项全部通过，发行构建（含资源校验）通过。没有操作正式用户、钱包、密钥或真实注册申请。此前浏览器截图及手机流程验证发生在错误的旧目录，不能把这些结果当作本发行目录的新一轮浏览器验收。

后端修改必须重启；如果公网使用容器，按 DEPLOYMENT.md 更新镜像/服务。没有在这次目录纠正中自动部署公网、替换远程配置或启动隧道。

## 已修复：AI 移动同步

服务端统一保存坐标、朝向、移动路径、家具姿态和控制页面。自动活动继续使用唯一执行租约；手动移动新增独立页面租约，只有管理员且持有当前令牌的页面能写入位置。观察端只显示状态，不重复触发家具结算。服务端继续校验可行走区域、移动速度、真实到达及动作时长。

控制端以 250ms 间隔按变化上传位置，通过现有 SSE 的 avatar_motion 事件推送；空闲保活与 1 秒状态轮询用于恢复。观察端平滑插值，并按服务端 epoch/seq 丢弃旧包；接管控制或刷新时先恢复权威坐标。手动移动、聊天指令、家具姿态、观察端门开关意图均同步。交接后迟到的心跳只返回快照，不再写入或产生冲突告警；到达及完成仍严格验证执行权。

主要文件：server/social-chat/src/avatar-autonomy.mjs、server/social-chat/src/index.mjs、src/agent/avatar-brain.js、src/agent/motion-follower.mjs、src/ui/social-chat.js、src/main.js。新增 tests/motion-sync.test.mjs 覆盖租约、越权不写入、速度/墙面校验、恢复、序列及姿态去重。

双页面使用本发行目录、临时数据库和隔离管理员/成员账号验证：手动行走实时跟随、上床姿态、观察端刷新恢复、聊天指令前往卫生间、控制端刷新恢复。测试不使用真实账号、钱包或 API；没有更新公网部署。后端需重启，远端容器需重新构建发布。


## chat-demo-main 聊天体验整合（2026-11-15）

读取本目录 chat-demo-main.zip，保留原有浅蓝配色、原生组件和服务端群聊架构。改编参考项目的 WAV recorder、SSE decoder（MIT），交互借鉴输入框自适应、录音状态/取消、附件粘贴拖放、复制/引用/朗读与流式 Markdown 合并更新。新增 marked 15.0.12 本地 ESM；未引入 React、CDN 或前端直连模型 API。完整许可证已写入 README、NOTICE、docs/licenses 及 public/social-chat。

新增 public/social-chat/markdown.js、chat-components.css、voice-input.js、recorder.js、vendor/marked.js，更新 app.js、media-render.js、media-composer.js 和 index.html。新增 server/social-chat/src/speech.mjs、sse.mjs，更新 AI worker、completions、路由及环境配置。语音密钥只在服务器；服务端校验登录/入群/禁言/token 预算、WAV 真正格式和 120s/8MiB，并把付费 ASR/TTS 每日请求预算持久化在 speech_api_usage（默认 60/人/天，UTC+8 午夜重置，最多 2 并发，0 禁用）。具体 ASR_*、SPEECH_DAILY_REQUEST_LIMIT 说明见 README，默认未配置转写服务。

停止回复接口 POST /api/ai/stop 验证 runId 和请求者/管理员权限，取消上游后保留部分文字及回复对象；已执行生活工具不会撤销或重复提交。未知 token 消耗继续保守预留，不编造用量。浏览器朗读可切换/取消，服务端 TTS 仍用原接口并纳入语音预算。图片视频沿用原鉴权上传、类型/大小/所有权及存储配额，Markdown 不直接加载外部图片。

新增 speech.test.mjs、speech-http.test.mjs、stop-reply.test.mjs 覆盖真正 WAV/时长/大小、重启后配额/并发/午夜重置、服务端密钥、鉴权/禁言/移出/token 配额、SSE 跨分片/多行/取消、停止权限和部分消息持久化。浏览器使用隔离临时库和本地模拟 API 验证流式与最终排版、代码块/原文复制/引用、HTML 与危险链接过滤、粘贴上传后图片本身显示、真实麦克风 API 录音转 WAV 后服务端转写、停止后刷新保留、390px 手机输入布局；无真实供应商费用或用户数据修改。未部署公网，后端与 dist 均须更新。

最终验证：主测试 60 项、聊天测试 42 项、生活测试 23 项通过（共 125 项）；资源校验及发行构建通过。浏览器还验证朗读开始/停止与代码过滤、其他成员停止回复返回 403。主页面快捷输入框同步接入粘贴/拖放附件；嵌入聊天页明确声明 microphone/clipboard-write 权限。真实远端供应商 ASR/TTS 尚需管理员配置验证，测试使用本地上游和浏览器模拟麦克风。

## 用户修改密码（2026-11-15）

聊天账户菜单“我的资料与密码”→“修改密码”，验证当前密码、新密码与重复输入（8–128 位，不允许与原密码相同）。POST /api/me/password 仅操作当前会话用户，严格校验字段、来源和身份，并限制密码验证尝试；数据库事务使用现有 scrypt 随机盐散列后撤销该用户所有登录会话。向该用户 SSE 发送 session_revoked，主页面和聊天页立即退出，其他用户会话不受影响。表单关闭清空密码；日志只记账号操作，不记录密码。后端与前端发行文件均需更新。

改密验证完成：44 项聊天测试通过，发行构建和资源验证通过；390px 手机浏览器验证两次密码不一致、旧密码错误、修改成功后两个页面立即退出、表单密码清空和新密码重新登录。使用临时数据库，不操作真实账号。
