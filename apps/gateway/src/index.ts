import { env } from "./env.js";
import { buildServer } from "./server.js";

const fastify = buildServer();

fastify.listen({ port: env.port, host: "0.0.0.0" }, (err, addr) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`zkma gateway listening on ${addr}`);
  if (env.skipProofVerify) {
    fastify.log.warn("ZKMA_SKIP_PROOF_VERIFY=1 - proofs are not being verified");
  }
});
