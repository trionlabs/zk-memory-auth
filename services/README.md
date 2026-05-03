# services/

Vendored runtime services that the gateway sits in front of.

## mem0

`services/mem0/` is a shallow vendored clone of [mem0ai/mem0](https://github.com/mem0ai/mem0) - the memory layer the gateway proxies. Self-host per the [official docker guide](https://mem0.ai/blog/self-host-mem0-docker):

```bash
cd services/mem0/server
cp .env.example .env   # set OPENAI_API_KEY, JWT_SECRET, etc.
docker compose -f docker-compose.yaml up
# REST API on http://localhost:8888 (host) -> 8000 (container)
```

Postgres + qdrant come up alongside. Once it is healthy, point the zkma gateway's `MEM0_BASE_URL` at `http://localhost:8888`.

We vendor (rather than submodule) so the noir circuit, contracts, and gateway all live in one cloneable repo. Upstream sync is manual: re-run `git clone --depth 1 https://github.com/mem0ai/mem0` and copy over.
