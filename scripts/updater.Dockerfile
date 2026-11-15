FROM docker:27-cli
RUN apk add --no-cache nodejs git ca-certificates
COPY scripts/docker-update-agent.mjs /agent.mjs
CMD ["node", "/agent.mjs"]
