# 网络组件许可

FRP（fatedier/frp，v0.72.0）与 Caddy（caddyserver/caddy，许可原文取自 v2.10.2）均使用 Apache-2.0，许可原文原样保留。部署模板调用外部镜像或二进制，没有将它们捆绑进 npm。

Caddy 模板沿用 caddy:2 标签，实际部署版本以镜像为准；发布时按实际镜像保留相应 LICENSE/NOTICE。

- FRP：https://github.com/fatedier/frp/tree/v0.72.0
- Caddy：https://github.com/caddyserver/caddy/tree/v2.10.2

配置改编自用户提供的 bluehaven-frp-integration；原说明留档于 deployment/frp/UPSTREAM-README.md。未引入 frp-panel、rathole 或其他管理器。
