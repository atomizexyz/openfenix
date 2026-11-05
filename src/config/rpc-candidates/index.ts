import { AVALANCHE_RPC_ENDPOINTS } from "./avalanche";
import { BASE_RPC_ENDPOINTS } from "./base";
import { BSC_RPC_ENDPOINTS } from "./bsc";
import { DOGECHAIN_RPC_ENDPOINTS } from "./dogechain";
import { ETHEREUM_RPC_ENDPOINTS } from "./ethereum";
import { ETHEREUM_POW_RPC_ENDPOINTS } from "./ethereum-pow";
import { EVMOS_RPC_ENDPOINTS } from "./evmos";
import { FANTOM_RPC_ENDPOINTS } from "./fantom";
import { MOONBEAM_RPC_ENDPOINTS } from "./moonbeam";
import { OKC_RPC_ENDPOINTS } from "./okc";
import { POLYGON_RPC_ENDPOINTS } from "./polygon";
import { PULSECHAIN_RPC_ENDPOINTS } from "./pulsechain";

export const RPC_ENDPOINT_CANDIDATES: Record<number, readonly string[]> = {
  1: ETHEREUM_RPC_ENDPOINTS,
  137: POLYGON_RPC_ENDPOINTS,
  56: BSC_RPC_ENDPOINTS,
  43114: AVALANCHE_RPC_ENDPOINTS,
  1284: MOONBEAM_RPC_ENDPOINTS,
  9001: EVMOS_RPC_ENDPOINTS,
  250: FANTOM_RPC_ENDPOINTS,
  2000: DOGECHAIN_RPC_ENDPOINTS,
  66: OKC_RPC_ENDPOINTS,
  10001: ETHEREUM_POW_RPC_ENDPOINTS,
  8453: BASE_RPC_ENDPOINTS,
  369: PULSECHAIN_RPC_ENDPOINTS,
};
