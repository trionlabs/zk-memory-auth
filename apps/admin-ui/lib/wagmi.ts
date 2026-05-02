import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Pinned to PublicNode — supports unbounded eth_getLogs ranges, which the OrgCard
// roster discovery needs. Free Alchemy/Infura tiers cap getLogs at 10 blocks and
// would silently empty the roster.
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
