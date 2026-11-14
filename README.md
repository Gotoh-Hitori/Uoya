# Uoya 魚家 Release v1.0

全新发布目录，无历史账号、聊天、记忆、头像、上传文件、API 凭证或网络配置。AI 人格提示词、头像和介绍为空，显示名称为 AI；默认钱包初始赠送为 0。住宅场景、3D 模型和商品目录是静态程序资源。

## Docker 启动

1. 将 .env.docker.example 复制为 .env.docker，填写 BOOTSTRAP_ADMIN_USERNAME 和至少 12 位的 BOOTSTRAP_ADMIN_PASSWORD。
2. 按需设置 PUBLIC_ORIGIN、COOKIE_SECURE 和 AI 服务，默认 AI 未启用。
3. 执行 docker compose build，然后 docker compose up -d。
4. 打开 http://127.0.0.1:8080，使用预设管理员登录。

容器内已安装 frpc 0.72.0，管理员在控制台配置并手动连接公网。Compose 项目名为 uoya-release-v1，数据卷与旧项目隔离。初始化后的数据卷将持久保存新数据；没有在文件夹中附带任何已有数据卷。

本地源码运行：Node >=22.13，npm ci，npm run build；正式启动前设置 NODE_ENV=production 以及管理员初始化凭证，再执行 npm start。

AI 头像及名称可在管理员资料中配置，人格可在控制台编辑。空白人格不移除程序本身的群聊、权限和工具规则。

详见 LICENSE 和 docs/licenses。模型授权由项目所有者确认。
