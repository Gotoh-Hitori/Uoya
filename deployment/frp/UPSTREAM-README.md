# Blue Haven · FRP 内网穿透独立部署包

**目标**：将现有 `bluehaven-social-ai-chat-v1.0` 的前端、API、SSE 多人聊天用 `https://chat.example.com` 暴露到公网；不暴露聊天 SQLite、AI 密钥、TTS 密钥、生活经济演示接口或 FRP 管理端口。

> 本部署包不替换原聊天项目，也不重做前端或 WebGL。FRP 是网络层组件，与 AI/记忆/金币模块保持解耦。

## 已核实的技术选型

- [fatedier/frp](https://github.com/fatedier/frp)，Apache-2.0，采用官方 `v0.72.0` 容器镜像。
- [Caddy](https://github.com/caddyserver/caddy)，Apache-2.0，负责自动 HTTPS 和反向代理。
- 配套的可选管理器 [VaalaCat/frp-panel](https://github.com/VaalaCat/frp-panel) 使用 AGPL-3.0，单节点不建议引入。
- [rathole](https://github.com/rathole-org/rathole) Apache-2.0，TCP 隧道的轻量替代品，但缺少 FRP 的 HTTP 按域名分流便利性。

2026-11-13 核实：FRP 最新发布 v0.72.0（2026-11-04）。官方的 frps/frpc 镜像：`ghcr.io/fatedier/frps:v0.72.0`、`ghcr.io/fatedier/frpc:v0.72.0`。

## 1. 拓扑

```text
多个真人的浏览器 ── HTTPS :443 ──> 公网 VPS [Caddy]
                                          │  HTTP Docker 内网
                                          ▼
                                   [frps :8080 vhost]
                                          ▲
                             TLS FRP :7000 │
                                          │
                                    内网主机 [frpc]
                                          │
                                          ▼
                                   127.0.0.1:8080
                                          │
                              [原 Blue Haven Nginx]
                                ├─ / 前端静态资源
                                └─ /api → Node:3001
                                             ├─ 登录会话 / SQLite
                                             ├─ /api/events (SSE)
                                             ├─ AI Worker → 模型 API
                                             └─ TTS 适配器
```

FRP 只穿透 **8080 一个入口**。同源网页和 `/api` 无需跨域。SSE 仍由原项目每 15 秒发送 `heartbeat`，Nginx 已有 `proxy_buffering off`，Caddy 会在收到 `text/event-stream` 时立即刷新。

## 2. 所需条件

- 一台有公网 IP 的 Linux VPS（能在安全组和防火墙中开放 TCP **80、443、7000**，可选 UDP 443）。
- 可管理 DNS 的域名（示例统一用 `chat.example.com`）。
- 一台运行原 Blue Haven 聊天项目的**内网主机**。宿主机 `127.0.0.1:8080` 能访问聊天 Web 入口。
- 两台 Linux 主机具备 Docker Compose；内网不是 Linux 时使用官方 `frpc` 原生二进制，具体见下文。
- AI 服务端与前端原配置需改为生产域名。

## 3. VPS（公网）部署

先在公网 DNS 把 `chat.example.com` 的 A 记录指向 VPS 公网 IP（如果配置 AAAA，也必须指向能访问这台 VPS 的 IPv6）。

在 VPS 上将**整份** `bluehaven-frp-integration/` 目录复制到安全位置（例如 `/opt/bluehaven-frp/`）；内网机也复制整份部署包，以便脚本相对路径有效。

在 **VPS 的 vps 目录**生成 FRP token：

```bash
mkdir -p secrets
bash ../scripts/generate-token.sh ./secrets/token
```

使用安全的 `scp` / `sftp` 把这一份 `secrets/token` 复制到 **内网主机**的 `lan/secrets/token`（两边内容完全一致、文件权限 600）。不要通过群聊、Issue 或 Git 提交 token。

修改 `vps/Caddyfile` 中的 `chat.example.com` 为真实域名。然后在 VPS：

```bash
cd /opt/bluehaven-frp/vps
docker compose pull
docker compose up -d
docker compose logs -f frps caddy
```

VPS 对公网只映射 80、443、7000；**frps 的 vhost 8080 没有映射到宿主机**，仅在内部 Docker 网络上供 Caddy 使用。

**防火墙**：仅在 VPS 云安全组/主机防火墙放行 22（尽量只对管理员来源）、80/tcp、443/tcp、7000/tcp；可选 443/udp 开启 HTTP/3。确认外网不能访问 8080、3001、8787、FRP Dashboard。

## 4. 内网聊天项目修改（仅两个必须项）

从 `bluehaven-social-ai-chat-v1.0.zip` 解压完整项目，进入原聊天项目目录。原 `docker-compose.yml` 含：

```yaml
ports:
  - '8080:80'
```

**必须改成仅绑定本机回环网卡**：

```yaml
ports:
  - '127.0.0.1:8080:80'
```

可用本包的脚本自动修补（会保留原始备份）：

```bash
python3 /path/to/bluehaven-frp-integration/scripts/patch_chat_compose.py /path/to/bluehaven-social-ai-chat
```

原聊天项目的 `.env` 修改：

```dotenv
CLIENT_ORIGIN=https://chat.example.com
COOKIE_SECURE=true
```

原来的 `INVITE_CODE`、`AI_API_KEY`、`AI_BASE_URL`、数据库挂载路径等保持原状，不要写进 FRP 配置。然后重启聊天项目：

```bash
cd /path/to/bluehaven-social-ai-chat
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/health
```

本项目原来的 `web/config.js` 在 8080 正式访问时自动使用相对 `/api` 路径，符合单域名方案，无须额外改 JS。

## 5. 内网 FRPC 部署

修改 `lan/frpc.toml` 中：

- `YOUR_VPS_IP_OR_DOMAIN` → 你的 VPS 公网 IP 或域名；
- `chat.example.com` → 与 Caddyfile **完全相同**的公开域名。

确保 `lan/secrets/token` 已从 VPS 安全复制（与 VPS token 一致）。

**内网 Linux / Docker Compose**：

```bash
cd /path/to/bluehaven-frp-integration/lan
docker compose pull
docker compose up -d
docker compose logs -f frpc
```

`network_mode: host` 的作用是让 frpc 容器正确访问原聊天宿主机的 `127.0.0.1:8080`。该方法依赖 Linux 主机网络；若是 Windows/macOS，请从 [FRP 官方 Releases](https://github.com/fatedier/frp/releases) 下载原生 `frpc`，在宿主系统运行，并将 `frpc.toml` 的 `auth.tokenSource.file.path` 改为适用于该宿主系统的**绝对路径**：

```bash
frpc -c frpc.toml
```

## 6. 验收

在内网主机：

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

在公网：

```bash
bash scripts/check-public.sh chat.example.com
```

浏览器打开 `https://chat.example.com`，使用两个不同用户账号测试：

1. HTTPS 证书有效、注册/登录后浏览器能保存 Secure/HttpOnly 会话 Cookie。
2. A 发消息，B 在另一台设备上立即收到；浏览器 Network 中 `/api/events` 返回 `text/event-stream` 且每 15 秒有心跳。
3. 关闭内网 frpc，公开访问应出现上游错误而非暴露数据库或管理端口；重启后聊天和 SSE 能恢复。
4. AI API Key 在服务端使用，不出现在客户端、FRP 配置、前端静态资源中。
5. 聊天项目所在宿主机 8080 与 3001 不对外开放。

## 7. 生产安全与重要限制

- **FRP token 只认证隧道端点，不是聊天用户认证**；继续使用原应用登录、邀请码、速率限制。
- **FRP 隧道默认 TLS 的身份验证弱于 HTTPS**：FRP v0.50+ 默认启用 TLS，但如果 frps 没有配置可信证书，客户端默认不验证服务端身份。生产部署用户聊天数据时，推荐在 frps 设置由你控制的 CA 签发的 TLS 证书，在 frpc 指定 `transport.tls.trustedCaFile` 并验证服务器身份；亦可使用 mTLS。详见 [FRP 官方 TLS 文档](https://gofrp.org/en/docs/features/common/network/network-tls/)。
- Caddy 终止浏览器 HTTPS。公网 VPS → FRP → 内网 Nginx 是 HTTP over FRP tunnel；在不可信中转场景，需要校验端到端信任并评估 TLS 终止点。
- 不要将 AI 密钥、SQLite、金币授权发放接口、管理员调试接口、FRP Dashboard 和 **生活经济系统的 demo-server** 直接穿透到公网。生活模块要先整合进聊天室已有的认证与权限体系。
- 不要把测试版 `AI_MODE=mock` 当成正式模型对话。公网商用还需加账户滥用防护、日志脱敏、数据库备份和监控告警。
- 默认是**单 VPS、单内网主机**，VPS 故障和家庭宽带断线会中断访问；需要高可用时再加多节点转发与容灾。
- 公网 IP 可以动态更换，但域名记录需要及时更新；公网 VPS 正常情况下不能省略。
- `ghcr.io/fatedier/frps:v0.72.0` 和 `.../frpc:v0.72.0` 都需要能从 GHCR 拉取；没有为用户预先下载镜像。

## 8. 未来扩展

- 记忆服务、生活经济服务继续运行在内网 Docker 网络，统一由 Node.js 网关做鉴权和审计。FRP 只对外转发站点入口。
- 可加入管理后台、监控和原有的 `HouseAgent`，但不要分别开新的 FRP TCP 直通数据库。
- 如果以后部署多台站点，Caddy 的域名转发与 FRP 的不同代理可扩展；[FRP-Panel](https://github.com/VaalaCat/frp-panel) 有可视化多节点管理，但采用 AGPL-3.0，商用时需单独审查。

## 项目文件

```text
bluehaven-frp-integration/
├─ vps/
│  ├─ docker-compose.yml       # Caddy + frps
│  ├─ Caddyfile                # HTTPS 入口
│  └─ frps.toml               # FRP 服务端
├─ lan/
│  ├─ docker-compose.yml      # Linux 内网 frpc
│  └─ frpc.toml               # FRP 客户端
├─ scripts/
│  ├─ generate-token.sh
│  ├─ patch_chat_compose.py   # 只绑定 127.0.0.1:8080
│  └─ check-public.sh
├─ tests/
│  └─ test_deployment.py
└─ docs/
   └─ OPEN_SOURCE_RESEARCH.md
```
