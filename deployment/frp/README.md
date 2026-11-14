# Uoya 魚家 · 通用网络部署

本包由用户提供的 bluehaven-frp-integration 改编，适配整个 Uoya 魚家住宅、聊天、生活系统和媒体上传。不包含预设服务器、域名、凭据或 FRP 可执行文件。原说明保留为 UPSTREAM-README.md，实际部署以本文为准。

拓扑：浏览器 HTTPS → VPS Caddy → frps HTTP vhost → TLS frpc → 内网 127.0.0.1:8080 → dist + /social-api/api → 127.0.0.1:3001。只转发一个 Web 入口，不转发独立开发服务。

## 本地正式运行

在实际项目根目录执行：

```powershell
npm.cmd run build
npm.cmd start
```

打开 http://127.0.0.1:8080/。启动器同时管理后端和静态网关，使用现有 SQLite、AI 配置及长期记忆。请先停止占用 3001 的开发服务；端口已占用时会明确报错，不会终止未知进程。

开发服务正在运行时，也可仅增加入口：

```powershell
npm.cmd run network:gateway
```

网关默认只监听回环地址。需要局域网访问时，可显式设置 WEB_HOST=0.0.0.0；WEB_PORT 默认 8080，CHAT_API_PORT 默认 3001。若正在启用隧道，WEB_PORT 必须匹配生成配置。Linux 可用相同 npm 命令，省略 .cmd。

## 在前端设置

管理员登录后进入 **控制台 → 网络设置**，填写服务器、站点域名、服务器端口、本地入口端口和 FRP Token。Token 留空会保留已有值，首次留空会生成本机私有 token；保存后不回显。VPS 的 frps 仍需配置相同 token，域名/DNS/Caddy 在 VPS 侧配置。

**保存配置和重启服务均不会连接公网。** 管理员点击“连接”后，后端先校验本机 frpc，再使用已有正式入口或创建回环网关，启动隧道；“断开”停止本次隧道，保留本地网页可用。状态区区分连接中、已连接、重新连接和失败，显示脱敏运行日志。状态来自本次客户端输出，不把保存配置或本地健康检查当成公网已通。

服务器管理员需预先安装官方 frpc，并通过 FRPC_PATH 环境变量或下面的本机 CLI 指定可执行文件。前端不接受任意可执行文件路径或命令。未安装时可保存配置，连接按钮不可用。普通成员不能读取网络设置、修改或连接/断开。

命令行配置与前端使用同一 .network 目录。自定义 DATABASE_FILE 的独立服务可通过 NETWORK_ROOT 指定配置根目录；正式启动器默认使用项目根目录。CLI 的 network:start 现在仅启动本地站点并提示进入控制台，实际隧道仍需前端手动连接。

## 配置公网隧道（通用参数）

准备公网 VPS 和可管理 DNS 的域名，再从 [FRP 官方发布](https://github.com/fatedier/frp/releases/tag/v0.72.0) 下载匹配平台的 v0.72.0 原生 frpc。示例路径需替换为实际值：

```powershell
npm.cmd run network:configure -- --server VPS地址 --domain home.example.com --frpc C:\Tools\frp\frpc.exe
npm.cmd run network:status
```

配置只写入项目 .network/frpc.toml、.network/settings.json、.network/token，不输出 token 正文。可用 --token-file 指向已有 token 文件；--ca-file 指向受信 CA 文件；--port 更改 frps 端口，--web-port 更改本地入口。路径有空格请加引号。重复配置保留现有 token，不暗中轮换。复制项目到另一台主机后应重新配置本机绝对路径。

把相同 token 文件安全复制到 VPS 的 vps/secrets/token。将 vps/Caddyfile 的 chat.example.com 改为自己的域名，DNS A/AAAA 指向 VPS，然后在 VPS 执行：

```bash
cd vps
docker compose pull
docker compose up -d
docker compose logs -f frps caddy
```

VPS 对公网只发布 80/443/7000，frps 的 vhost 8080 仅供 Caddy 在 Docker 网络访问。Caddy 的 SAMEORIGIN 允许住宅嵌入同源聊天/背包。不要改为 DENY。镜像固定 FRP v0.72.0；Caddy 使用上游的 caddy:2 标签，正式部署可按自己的发布流程锁定镜像摘要。

停止原开发进程后，在内网主机执行：

```powershell
npm.cmd run build
npm.cmd run network:start
```

启动器启动正式站点；管理员再从控制台手动连接。后端会先执行 frpc verify。公网域名登录启用 Secure Cookie，本地回环入口可继续登录管理。连接成功以网络设置日志及实际公网访问为准；配置生成、进程启动或 network:status 都不能证明公网已通。Ctrl+C 停止服务及其管理的隧道。

普通 npm start 不启用 frpc。已保存公网配置仍可通过本机 HTTP 入口登录管理；公网域名会设置 Secure Cookie。--gateway-only 复用后端时，该后端自身也必须配置正确的 COOKIE_SECURE 与 CLIENT_ORIGIN，生产部署应使用统一启动器。

## Linux 容器客户端

也可在 Linux 内网主机运行 lan/docker-compose.yml。它使用 host 网络访问宿主机 127.0.0.1:8080。修改 lan/frpc.toml 的 VPS 地址和域名，放置 lan/secrets/token，先运行 npm start，再在 lan 目录执行 docker compose up -d。Windows/macOS 优先使用原生 frpc；不要直接照搬 Linux host 网络。

## 验收与数据

- 本地健康检查：http://127.0.0.1:8080/social-api/api/health。
- VPS 启用后，运行 bash deployment/frp/scripts/check-public.sh 自己的域名。
- 两台设备注册/登录后，检查实时聊天、/social-api/api/events 心跳、图片和视频、背包、管理员权限。
- /api、源码、.network、数据库、服务器 .env 和 FRP 管理端均不应成为公开入口。新网关只读取 dist，静态链接也不能跳出 dist。
- 继续备份 server/social-chat/data（含上传目录、API 解密密钥、长期记忆）和私有 .network 配置。不要将这些复制进 dist 或提交到 Git。

FRP 默认 TLS 加密但不验证 frps 的随机证书。需要服务端身份验证时，在 frps 配置证书，在客户端使用 --ca-file 对应 CA，配置办法见 [官方 TLS 文档](https://gofrp.org/en/docs/features/common/network/network-tls/)。[文件令牌认证](https://gofrp.org/en/docs/features/common/authentication/) 与用户登录是两层独立机制；[Caddy 流式代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) 配合本地流式网关传输 SSE。FRP/Caddy 许可证见 docs/licenses/network（从项目根目录访问）。
