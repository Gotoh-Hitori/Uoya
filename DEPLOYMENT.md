# Deployment Standard / 部署规范 / デプロイ規約

[中文](#中文) · [English](#english) · [日本語](#日本語) · [Architecture](README.md) · [AI operator prompt](AI_DEPLOYMENT_PROMPT.md)

## 中文

### 1. 部署目标与前置条件

推荐 Linux Docker Engine 或 Docker Desktop 的 Linux 引擎、Docker Compose >=2.24；应用镜像使用 Node 22。源码运行要求 Node >=22.13 和原生依赖编译工具。先确认当前分支、目标主机、域名、端口和数据卷，区分首次安装与已有部署升级。不要把源码根目录当作静态站点公开。


### 2. 首次本地容器部署

在仓库根目录复制示例（以下为 PowerShell）：

```powershell
Copy-Item .env.docker.example .env.docker
```

在本机编辑 .env.docker，至少填写：

```dotenv
PUBLIC_ORIGIN=http://127.0.0.1:8080
COOKIE_SECURE=false
BOOTSTRAP_ADMIN_USERNAME=your_owner
BOOTSTRAP_ADMIN_PASSWORD=<locally-generated-strong-password>
AI_MODE=disabled
```

尖括号内容只是占位符，必须替换。管理员名为 3–24 位字母/数字/下划线，密码 12–128 字符。密钥只写入本机环境文件或控制台，不放进命令行、Git、截图或日志。生产空库在 HTTP 监听前完成管理员初始化；缺少有效凭证将启动失败。已有用户不会被重置或覆盖，初始化后可移除部署密码并重建容器。

```sh
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

访问 http://127.0.0.1:8080，使用预设管理员登录。检查 /social-api/api/health。启动不会自动连接公网。如 8080 已占用，先查明现有服务，不要随意停止进程或改成公网监听。





```sh
docker compose up -d --force-recreate
```

管理员进入“控制台 → 网络设置”，填写服务器地址、7000、站点域名、与 VPS 一致的 token、可信 CA PEM 及证书服务器名称，本地入口保持 8080，保存后手动连接。缺少 CA、过期 CA、错误 CA 或名称不匹配均不能建立隧道。旧的无 CA 配置必须升级，禁止关闭验证作为临时修复。每次应用重启后仍需管理员手动连接。

### 4. 可选 AI 服务与人格

默认 AI 不调用外部服务。管理员可在控制台配置共享服务，或设置 AI_MODE=api、AI_BASE_URL、AI_MODEL、AI_API_KEY；API 基址应为适配器支持的接口基址，例如兼容服务的 /v1，而非聊天页面 URL。根据供应商选择 AI_API_FORMAT，切勿假定所有服务都支持 Responses、工具、图片或联网搜索。可先保留 disabled 完成部署，再在控制台测试连接。AI mock 仅为测试演示。

人格提示词默认为空，可由管理员编辑；头像/名称由 AI 资料设置管理。TTS 为可选服务，需要另行配置 TTS_ENABLED、TTS_PROVIDER_URL 等。密钥仅在后端使用。WebGL 角色动作依赖可见浏览器执行页，容器并不提供无人值守的 3D 执行器。

### 5. 持久化、备份与迁移

| 状态 | 默认位置 |
| --- | --- |
| 主库、会话、账号、聊天、生活/钱包与审计 | app_data: /app/server/social-chat/data/bluehaven.sqlite |
| 共享 AI 配置解密密钥 | 同目录 bluehaven.sqlite.ai-settings-key |
| AI 名称/头像资料 | 同目录 bluehaven.sqlite.profile.json |
| 长期记忆 | 同目录 longmemory.sqlite |
| 媒体与可编辑人格 | 同目录 uploads/ 与 persona.md |

正常 docker compose down 保留卷。没有明确删除数据的授权，不执行 down -v、volume prune 或删除数据库。备份使用 SQLite 在线备份，或正常停止写入后复制整套目录；不能只复制正在运行的 sqlite 主文件并遗漏 WAL。数据库、配套解密密钥、资料、人格、uploads 与网络状态必须配套保存。


### 6. 验收、升级与回滚

- 核对 Compose 公开端口、初始化日志、健康接口；管理员可登录，后续注册仅为成员，未登录者无法读取私有媒体/管理接口。
- 检查场景与 25 个模型、手机布局和 SSE；静态入口无法访问 .env、数据库或 .network。
- 正确 CA/名称能连接；错误 CA/名称不能连接；内部 3001 不可从其他容器访问。确认 HTTPS Cookie 和实际域名。
- 更新前备份，记录镜像/提交与环境。构建、重建容器保留卷；验证后再手动连接隧道。回滚使用已知镜像/提交，若存在不兼容迁移则恢复整套配套备份，不要只替换数据库。


### 7. 源码运行和故障处理

npm ci → npm run build → 配置根目录 .env → npm start。正式模式默认 production，仍需部署管理员凭证。开发使用 npm run dev，只有显式 NODE_ENV=development 且后端回环时允许开发首用户规则，不可公网使用。npm run preview 不含完整后端。

空库拒绝启动时检查管理员变量；CA 保存失败检查 PEM、CA 属性和有效期；x509 错误检查签发 CA、SAN、验证名称和系统时间；站点证书签发失败检查 DNS 和 443 TLS-ALPN-01；数据丢失先检查是否更改 Compose 项目名/卷，不要新建管理员覆盖现场。日志对外分享前删除凭证和个人信息。没有实际 VPS 或 AI 认证时明确记录未验证，不宣称上线成功。

## English

### 1. Scope and prerequisites

Use Linux Docker Engine or Docker Desktop in Linux mode with Compose >=2.24. Images use Node 22; source execution requires Node >=22.13 and native build tools. Establish the host, branch, domain, ports and volumes before deployment, and distinguish a new installation from an upgrade. Never serve the repository root as a static site.


### 2. Initial local container deployment

Copy .env.docker.example to .env.docker (PowerShell: Copy-Item .env.docker.example .env.docker). Edit it locally: PUBLIC_ORIGIN=http://127.0.0.1:8080, COOKIE_SECURE=false, BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD, AI_MODE=disabled. The dotenv block above is an example, not usable credentials. Owner names require 3–24 letters/digits/underscores; passwords require 12–128 characters. Keep secrets out of command arguments, Git, screenshots and logs.

An empty production DB creates its owner before HTTP opens; invalid or missing credentials fail startup. Existing users are never overwritten. After initialization, remove bootstrap credentials and recreate the container if desired.







### 4. Optional AI and persona

AI is disabled by default. Configure a shared provider through the admin console or AI_MODE=api, AI_BASE_URL, AI_MODEL and AI_API_KEY. Use a supported API base (often /v1), not a provider's chat website. Choose AI_API_FORMAT for the provider; do not assume Responses, tool calls, images or search are universally supported. Complete infrastructure deployment with AI disabled, then test the connection. Mock mode is a test/demo only.

The persona is initially empty; an administrator edits it and the AI name/avatar. TTS is optional and needs separate TTS_ENABLED/TTS_PROVIDER_URL settings. Credentials stay server-side. Avatar actions still need a visible browser execution page; the container is not a headless 3D executor.

### 5. Persistence and migration


Normal docker compose down preserves volumes. Without explicit data-deletion authorization, do not use down -v, volume prune or remove databases. Use SQLite online backup or stop all writers and copy the full state set; copying a live main SQLite file without WAL is not a complete backup. Keep database, decryption key, profile, persona, uploads and network state together.


### 6. Acceptance, upgrades and rollback

Check published ports, bootstrap and health; owner login succeeds, later registrants are members, and unauthenticated users cannot access private media/admin APIs. Verify scene assets, mobile layout, SSE and rejection of .env/database/.network static requests. Confirm valid CA/name succeeds, wrong trust/name fails, peer containers cannot access API 3001, and HTTPS cookies match the real domain.

Before upgrading, back up and record image/commit/environment. Rebuild/recreate without deleting volumes, validate, then reconnect manually. Roll back to a known image/commit; incompatible database migrations require restoring a complete matching backup, not replacing one file.


### 7. Source execution and troubleshooting

Run npm ci, npm run build, configure the root .env, then npm start. Production is the default and bootstrap credentials remain required. npm run dev permits development first-user behavior only when NODE_ENV=development is explicitly set and the backend is loopback-bound; never expose this mode publicly. npm run preview is frontend-only.

For bootstrap failure, check owner variables. For CA rejection, check PEM format, CA capability and dates. For x509 failures, check issuer, SAN/name, chain and system time. For HTTPS issuance, check DNS and TLS-ALPN-01 on 443. If data appears missing, inspect project/volume changes before creating replacement accounts. Redact logs before sharing. Clearly label real VPS/provider checks that could not be performed.

## 日本語

### 1. 前提条件と対象

Linux Docker Engine、または Docker Desktop の Linux モードと Compose >=2.24 を推奨します。イメージは Node 22、ソース実行は Node >=22.13 とネイティブ依存のビルドツールが必要です。対象ホスト、ブランチ、ドメイン、ポート、ボリュームを確認し、新規導入か更新かを区別してください。リポジトリ全体を静的サイトとして公開しないでください。


### 2. ローカルコンテナの初回導入

.env.docker.example を .env.docker にコピーします（PowerShell: Copy-Item .env.docker.example .env.docker）。ローカルで PUBLIC_ORIGIN=http://127.0.0.1:8080、COOKIE_SECURE=false、BOOTSTRAP_ADMIN_USERNAME、BOOTSTRAP_ADMIN_PASSWORD、AI_MODE=disabled を設定します。上の dotenv 例のプレースホルダーは必ず実値に置換してください。管理者名は英数字とアンダースコアで 3–24 文字、パスワードは 12–128 文字です。秘密情報をコマンド引数、Git、画像、ログへ出さないでください。

本番の空 DB は HTTP 開始前に管理者を作成し、認証情報が不正または未設定なら起動しません。既存ユーザーは上書きしません。初期化後は認証情報を環境ファイルから除去してコンテナを再作成できます。







### 4. AI 接続と人格

AI は既定で無効です。管理画面、または AI_MODE=api、AI_BASE_URL、AI_MODEL、AI_API_KEY で共有接続を設定します。ベース URL は対応 API の基点（例 /v1）で、チャットサイトの URL ではありません。AI_API_FORMAT はサービスに合わせ、Responses、ツール、画像、検索の対応を決めつけないでください。AI 無効のままインフラを検証し、その後接続テストを行えます。mock はテスト専用です。

人格は初期状態で空です。名前・アバターとともに管理者が設定します。TTS は別途 TTS_ENABLED、TTS_PROVIDER_URL などが必要です。鍵はサーバー側に保持します。3D 動作は表示中のブラウザー実行ページが必要で、コンテナだけで代行できません。

### 5. 永続化、バックアップ、移行


docker compose down はボリュームを保持します。明示的な削除許可なしに down -v、volume prune、DB 削除を実行しないでください。SQLite オンラインバックアップ、または書き込み停止後の一式コピーを使用します。稼働中の主 DB だけをコピーして WAL を省略してはいけません。DB、復号鍵、資料、人格、アップロード、ネットワーク状態を一式で保存します。


### 6. 検収、更新、ロールバック

公開ポート、初期化、健康確認、管理者ログインと一般会員の権限を確認します。未認証のメディア/管理アクセス、.env/DB/.network の配信を拒否することを検証します。場面・モデル、モバイル、SSE、正しい CA の接続、誤った CA/名前の拒否、他コンテナからの 3001 到達不可、実ドメインの HTTPS Cookie を確認します。

更新前にバックアップとイメージ/コミット/環境を記録し、ボリュームを保持して再作成、検証後に手動再接続します。ロールバックは既知のイメージ/コミットを使い、DB 移行が非互換なら対応するバックアップ一式を復元します。


### 7. ソース実行と障害対応

npm ci → npm run build → ルート .env 設定 → npm start の順です。本番が既定で、管理者初期化情報は必須です。npm run dev の開発初期化は NODE_ENV=development を明示し、API をループバックに限定した場合のみで、公開用途には使用しません。npm run preview はフロントエンドだけです。

管理者エラーは環境変数、CA エラーは PEM・CA 属性・有効期限、x509 は発行元・SAN・検証名・時刻、HTTPS 発行は DNS と 443 TLS-ALPN-01 を確認します。データが見えない場合はアカウントを作り直す前にプロジェクト名とボリュームを確認します。共有ログは秘密情報を除去し、実 VPS/AI を検証できない場合は未検証と明記してください。

## 试验性 Docker 自动更新

先执行 `docker compose --profile auto-update up -d --build updater`，再在控制台“运行情况”开启“自动更新”并单独确认风险。开关默认关闭，仅管理员可修改；每分钟检查固定仓库 Gotoh-Hitori/Uoya 的 main 提交，按提交号而非package版本号判断更新。更新服务需连接GitHub。

更新服务独立持有Docker socket，用于重建和替换同一Compose项目的app容器；仅应由可信管理员部署，不把socket挂到游戏容器。依赖Linux Docker Engine/Docker Desktop Linux容器及Compose。请保持原部署目录与Compose项目名，原.env.docker由原Compose读取，不提交密钥。自定义外部数据库/额外挂载不在此自动迁移支持范围。

构建成功后才停止app，将原app_data存档完整复制到update_work卷的backups目录，再启动新版，保留同一app_data卷。新版健康检查失败会停止新版、恢复备份并切回旧镜像；同一失败版本不反复更新，关闭再开启可重试。不要删除旧镜像或备份卷。更新期间会断线，容器意外断电或回退失败仍可能需要手动从update_work备份恢复；请保留独立备份。关闭开关会取消未安装更新，已经开始安装时优先完成或回退，不能中途强停。

版本识别优先读取镜像org.opencontainers.image.revision标签；未设置时读取原部署目录的Git HEAD。无Git目录的压缩包部署须在构建前设置UOYA_BUILD_REVISION为该版本完整提交SHA；无法识别时拒绝自动替换。更新代理检测到迁移过程中异常退出会关闭自动更新，要求管理员检查备份。
