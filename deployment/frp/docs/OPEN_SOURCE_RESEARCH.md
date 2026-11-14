# FRP 内网穿透开源选型记录（核实于 2026-11-13）

| 项目 | 许可证 | 作用 | Blue Haven 适配意见 |
| --- | --- | --- | --- |
| [fatedier/frp](https://github.com/fatedier/frp) | Apache-2.0 | 完整内网穿透、HTTP/HTTPS 路由、令牌、健康检查 | **首选**；官方 v0.72.0；一条 HTTP 域名通道即可承载聊天/Web/SSE |
| [Caddy](https://github.com/caddyserver/caddy) | Apache-2.0 | HTTPS 终止、自动证书、HTTP 反向代理 | **配合 FRP 使用**；无需在内网聊天 Node.js 上直接处理证书 |
| [rathole](https://github.com/rathole-org/rathole) | Apache-2.0 | 高性能低资源 TCP/UDP 隧道 | 适合不需要 FRP HTTP 虚拟主机能力的轻量场景；需再接 Web 路由器 |
| [VaalaCat/frp-panel](https://github.com/VaalaCat/frp-panel) | AGPL-3.0 | 多 FRP 节点统一管理和 Web UI | 单节点不推荐增加管理面；商业服务评估 AGPL 网络使用义务 |
| [ychenfen/frp-panel](https://github.com/ychenfen/frp-panel) | MIT（README 声称） | 轻量可视化配置 | 体量较小，生产安全与维护需另评估，当前不优先 |

资料依据：

- FRP 官方 HTTP 虚拟主机与配置： https://gofrp.org/en/docs/features/http-https/ 与 https://gofrp.org/en/docs/reference/proxy/
- FRP 官方 token 文件： https://gofrp.org/en/docs/features/common/authentication/
- FRP 官方 TLS 与服务器身份校验： https://gofrp.org/en/docs/features/common/network/network-tls/
- FRP GitHub 最新 Release： https://github.com/fatedier/frp/releases/tag/v0.72.0
- Caddy 官方 SSE streaming： https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- FRP 官方 GHCR 镜像： https://github.com/fatedier/frp/pkgs/container/frps

许可证仅是开源选型的一个因素；最终商业部署需要按照实际使用的版本、第三方依赖和修改方式核验 LICENSE / NOTICE / 网络服务义务。
