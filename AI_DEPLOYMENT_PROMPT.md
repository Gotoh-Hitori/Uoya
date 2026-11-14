# AI Deployment Prompt / AI 部署提示词 / AI デプロイ用プロンプト

[中文](#中文) · [English](#english) · [日本語](#日本語) · [Deployment standard](DEPLOYMENT.md)

选择一种语言，将对应提示词连同参数交给部署助手。此文件用于部署操作，**不是应用内 AI 室友的人格提示词**。不要把密码、API Key、token 或私钥粘贴进对话；通过目标主机的受保护环境文件或秘密管理工具提供。

Choose one prompt and provide the parameters below. This is an operator prompt, **not the roommate AI persona**. Provide secrets through protected host files or a secret manager, never in the conversation.

以下から1言語のプロンプトを選び、パラメーターとともに作業 AI に渡してください。これは運用用であり、**アプリ内 AI の人格ではありません**。秘密情報は会話へ貼らず、保護された環境ファイルなどで渡してください。

## Parameters / 参数 / パラメーター

```yaml
repository: https://github.com/Gotoh-Hitori/Uoya
revision: <reviewed-commit-or-tag>
project_path: <absolute-target-path>
mode: <new-empty-install-or-upgrade>
target_os: <OS-and-architecture>
access: <local-only-or-public-https>
public_origin: <http://127.0.0.1:8080-or-real-https-origin>
secret_source: <protected-env-file-or-secret-manager; no-secret-values>
existing_volumes: <none-or-explicit-existing-volume-names>
backup_path: <protected-backup-location>
ai_provider: <disabled-or-configure-after-infrastructure-validation>
```

## 中文

>
> 1. 检查目标路径、分支/提交、Docker Linux 引擎、Compose、端口、DNS、证书及已有数据卷。缺少会改变目标的必要信息时提问，同时继续不依赖答案的只读检查。明确“全新空白安装”或“已有数据升级”，不得自行混用旧卷或复制旧数据。
> 2. 新安装保持 AI 头像、介绍、人格、模型/API 配置为空，AI disabled，默认赠送 0。只保留程序自带场景、模型和商品目录。为该部署使用独立卷；已有部署则先确认备份完整，不覆盖用户或密钥。
> 3. 在 HTTP 开放之前通过 BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD 初始化管理员。使用本机受保护的秘密来源，不回显凭证，不把秘密放在 Git、命令参数、截图和日志中。生产不可使用 development 首用户规则。
> 6. 配置真实 HTTPS PUBLIC_ORIGIN 和 COOKIE_SECURE=true，按 VPS 模板验证 DNS 与 TLS-ALPN-01 的 443 可达性。通过管理员网络设置保存配置；在用户授权的目标范围内手动连接。应用重启不会自动重连。不要将本地测试隧道成功当作公网验收成功。
> 7. 整套持久化和备份主 DB、配套解密密钥、AI 资料、人格、uploads、LongMemory 与网络状态。使用在线 SQLite 备份或停止写入后复制完整目录，不遗漏 WAL。不得执行 down -v、volume prune、数据库清空、覆盖账号或历史迁移，除非用户明确授权对应数据操作。记忆重置不是删除数据。
> 8. 验证管理员登录、普通成员权限、SSE、媒体隔离、静态私有路径拒绝、桌面/手机场景、本地资源加载及内部端口隔离。公网验证实际域名/HTTPS；TLS 验证错误 CA 和名称被拒绝，正确证书能连接。测试使用隔离数据，不在正式钱包、账号或聊天上制造测试记录。
> 9. AI 默认保持 disabled；只有用户要求并提供适配服务时才配置和测试真实供应商。不要擅自填写人格、头像或使用演示输出冒充真实模型。可见 WebGL 页面是角色动作执行的必要条件，不承诺容器提供后台 3D 执行能力。
> 10. 更新前记录镜像/提交与备份，保留卷重建；必要时按兼容性恢复完整备份回滚。最后报告目标提交、实际入口、公开端口、卷名、管理员初始化状态、TLS/AI/模型/SSE 的验证结果、备份恢复方式及仍未验证事项。不能访问目标环境时明确阻塞，不宣称已上线，不泄露秘密。

## English

>
> 1. Inspect path, revision, Docker Linux engine, Compose, ports, DNS, certificates and existing volumes. Ask for missing target-defining information while continuing independent read-only work. Distinguish a clean install from an upgrade; never silently reuse old volumes or import historical data.
> 2. For a clean install, keep AI avatar, description, persona and provider settings blank, AI disabled and welcome coins zero. Preserve built-in scene/models/catalog only. Use isolated volumes. For upgrades, confirm a complete backup before changing data; never overwrite users or encryption keys.
> 3. Bootstrap the owner through BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD before HTTP opens. Obtain secrets from protected host files or a secret manager. Do not print them or include them in Git, process arguments, screenshots or logs. Never use development first-user rules in production.
> 7. Persist and back up the main DB, decryption key, AI profile/persona, uploads, LongMemory and network state as a set. Use online SQLite backup or stop writers before copying; do not omit WAL. Do not run down -v, volume prune, clear databases, replace accounts or migrate history without explicit authorization for that data operation. Memory reset is not deletion.
> 8. Verify owner/member permissions, SSE, private media, denied private static paths, desktop/mobile scene and local assets, and internal-port isolation. Validate the real public domain/HTTPS. Test wrong CA/name rejection and correct certificate success using isolated test data, not production accounts, wallets or chat.
> 9. Leave AI disabled unless the user requests a real provider and supplies protected configuration. Do not invent persona/avatar or present mock replies as real AI output. Avatar execution needs a visible WebGL page; do not promise background 3D execution from the container.
> 10. Record image/revision and backup before upgrades, recreate without deleting volumes, and use complete compatible backups when rollback needs data restoration. Report revision, actual URL, public ports, volumes, bootstrap state, TLS/AI/assets/SSE evidence, backup/recovery and unverified checks. If target access is unavailable, state the blocker instead of claiming production success. Never expose secrets.

## 日本語

>
> 1. パス、コミット、Docker Linux エンジン、Compose、ポート、DNS、証明書、既存ボリュームを確認します。対象を確定する情報が不足していれば質問し、独立した読み取り確認は継続します。新規導入と更新を区別し、旧ボリュームや過去データを勝手に再利用しません。
> 2. 空白導入では AI アバター・説明・人格・接続設定を空、AI 無効、初期コイン 0 に保ちます。標準の場面・モデル・商品だけを保持し、独立ボリュームを使います。更新では完全なバックアップを確認し、ユーザーや暗号鍵を上書きしません。
> 3. HTTP 開始前に BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD で管理者を初期化します。秘密情報は保護されたホストファイル等から取得し、出力、Git、プロセス引数、画像、ログへ含めません。本番で開発用の最初の登録者ルールを使いません。
> 6. 実際の HTTPS PUBLIC_ORIGIN と COOKIE_SECURE=true を設定し、DNS と 443 の TLS-ALPN-01 を確認します。管理画面へ設定を保存し、許可された対象のみ手動接続します。再起動後の自動接続を仮定せず、ローカル検証を実公開の成功と混同しません。
> 7. 主 DB、復号鍵、AI 資料・人格、uploads、LongMemory、ネットワーク状態を一式で永続化・保存します。SQLite オンラインバックアップか書き込み停止後のコピーを使い、WAL を省略しません。明示的な許可なしに down -v、volume prune、DB 初期化、アカウント置換、過去データ移行を行いません。記憶リセットは削除ではありません。
> 8. 管理者/一般会員権限、SSE、非公開メディア、秘密パス配信拒否、PC/モバイル場面、ローカル資産、内部ポート隔離を確認します。公開時は実ドメイン/HTTPS、誤った CA/名前の拒否、正しい証明書の成功を検証します。本番の財布や会話をテストに使わず、隔離データを利用します。
> 9. 利用者が外部 AI 接続を依頼するまで disabled を維持します。人格やアバターを勝手に作らず、mock を実モデルとして扱いません。3D 動作には表示中の WebGL ページが必要で、コンテナだけの自動実行を約束しません。
> 10. 更新前にコミット/イメージとバックアップを記録し、ボリュームを保持して再作成します。必要時は互換性のある完全なバックアップで戻します。最後にリビジョン、実 URL、公開ポート、ボリューム、管理者初期化、TLS/AI/資産/SSE の証拠、復元手順、未検証事項を報告します。対象へアクセスできなければ阻害要因を明記し、稼働成功と偽らず、秘密情報を漏らしません。
