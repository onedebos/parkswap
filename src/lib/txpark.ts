import { Contract, JsonRpcProvider, ZeroAddress, getAddress, isAddress } from "ethers";
import { dexChainConfig } from "@/lib/chain-config";

/** Target chain for this deployment (from `NEXT_PUBLIC_CHAIN_ID` / RPC env). */
export const TXPARK_CHAIN_ID = dexChainConfig.chainId;
export const TXPARK_HEX_CHAIN_ID = dexChainConfig.chainIdHex;
export const TXPARK_RPC_URL = dexChainConfig.rpcUrl;

export { dexChainConfig };
export const DEX_NETWORK_DISPLAY_NAME = dexChainConfig.networkDisplayName;
export { configuredNetworkMismatchMessage, walletChainLabel } from "@/lib/chain-config";

function blockExplorerBase(): string {
  return dexChainConfig.blockExplorerDefaultUrl.replace(/\/+$/, "");
}

/** Resolved explorer origin (no trailing slash). */
export function getBlockExplorerBaseUrl(): string {
  return blockExplorerBase();
}

/** `{base}/tx/{hash}` — base from `NEXT_PUBLIC_BLOCK_EXPLORER_URL` or default testnet Blockscout. */
export function txparkExplorerTxUrl(txHash: string): string {
  return `${blockExplorerBase()}/tx/${txHash}`;
}

/** `{base}/address/{address}` — contract / wallet page on Blockscout-style explorers. */
export function txparkExplorerAddressUrl(address: string): string {
  return `${blockExplorerBase()}/address/${address}`;
}

export type Address = `0x${string}`;

export type TokenConfig = {
  key: string;
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  accent?: string;
  isImported?: boolean;
};

export type PoolConfig = {
  tokenA: string;
  tokenB: string;
  fee: number;
  poolAddress: Address;
  featured?: boolean;
};

export const CORE_ADDRESSES = {
  swapRouter: dexChainConfig.contracts.swapRouter,
  quoterV2: dexChainConfig.contracts.quoterV2,
  positionManager: dexChainConfig.contracts.positionManager,
  factory: dexChainConfig.contracts.factory,
} as const satisfies Record<string, Address>;

export const FEATURED_TOKENS = {
  usdc: {
    key: "usdc",
    address: dexChainConfig.tokens.usdc.address,
    symbol: dexChainConfig.tokens.usdc.symbol,
    name: dexChainConfig.tokens.usdc.name,
    decimals: dexChainConfig.tokens.usdc.decimals,
    accent: "from-cyan-300 to-sky-500",
  },
  xu3o8: {
    key: "xu3o8",
    address: dexChainConfig.tokens.xu3o8.address,
    symbol: dexChainConfig.tokens.xu3o8.symbol,
    name: dexChainConfig.tokens.xu3o8.name,
    decimals: dexChainConfig.tokens.xu3o8.decimals,
    accent: "from-amber-300 to-lime-500",
  },
  vnxau: {
    key: "vnxau",
    address: dexChainConfig.tokens.vnxau.address,
    symbol: dexChainConfig.tokens.vnxau.symbol,
    name: dexChainConfig.tokens.vnxau.name,
    decimals: dexChainConfig.tokens.vnxau.decimals,
    accent: "from-amber-200 to-yellow-600",
  },
} as const satisfies Record<string, TokenConfig>;

export const TOKENS = FEATURED_TOKENS;
export type TokenKey = keyof typeof FEATURED_TOKENS;

/** Featured row order in Trade → Swap: VNXAU, xU3O8, USDC. */
export function getFeaturedTokensOrdered(): TokenConfig[] {
  return [FEATURED_TOKENS.vnxau, FEATURED_TOKENS.xu3o8, FEATURED_TOKENS.usdc];
}

export const DEFAULT_SWAP_TOKEN_IN = FEATURED_TOKENS.usdc.key;
export const DEFAULT_SWAP_TOKEN_OUT = FEATURED_TOKENS.xu3o8.key;
export const DEFAULT_LIQUIDITY_TOKEN_A = FEATURED_TOKENS.usdc.key;
export const DEFAULT_LIQUIDITY_TOKEN_B = FEATURED_TOKENS.xu3o8.key;
/** Single Uniswap v3 fee tier used everywhere in this app (0.25%). */
export const DEFAULT_FEE_TIER = 2500;
export const POOL_FEE = DEFAULT_FEE_TIER;

/** Pinned pool for the USDC / xU3O8 pair at the app fee tier (dashboard + `resolvePoolAddress` shortcut). */
export const FEATURED_POOLS: PoolConfig[] =
  dexChainConfig.featuredPoolAddress != null
    ? [
        {
          tokenA: FEATURED_TOKENS.usdc.address,
          tokenB: FEATURED_TOKENS.xu3o8.address,
          fee: DEFAULT_FEE_TIER,
          poolAddress: dexChainConfig.featuredPoolAddress,
          featured: true,
        },
      ]
    : [];

/** Pool contract used on the Pool tab / live metrics; `null` if unset for this chain. */
export function getDashboardPoolAddress(): Address | null {
  return dexChainConfig.featuredPoolAddress;
}

export const FULL_RANGE_TICK_LOWER = -887250;
export const FULL_RANGE_TICK_UPPER = 887250;

export const ADDRESSES = {
  usdc: FEATURED_TOKENS.usdc.address,
  xu3o8: FEATURED_TOKENS.xu3o8.address,
  ...CORE_ADDRESSES,
} as const;

export const erc20Abi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

export const swapRouterAbi = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
] as const;

export const quoterAbi = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
] as const;

export const positionManagerAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
] as const;

export const positionManagerActionsAbi = [
  ...positionManagerAbi,
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint256 amount0, uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) payable returns (uint256 amount0, uint256 amount1)",
  "function multicall(bytes[] data) payable returns (bytes[])",
] as const;

export const factoryAbi = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
] as const;

export const positionManagerEnumerateAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
] as const;

export const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint32 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)",
] as const;

export type WriteAction =
  | "approve-swap"
  | "swap"
  | "approve-liquidity"
  | "liquidity"
  | "collect-fees"
  | "remove-liquidity"
  | "import-token"
  | "create-token";

export function normalizeAddress(address: string): Address {
  return getAddress(address) as Address;
}

export function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export function sortTokenPair<T extends Pick<TokenConfig, "address">>(tokenA: T, tokenB: T): readonly [T, T] {
  return sameAddress(tokenA.address, tokenB.address) || tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

export function getTokenRegistryMap(tokens: TokenConfig[]) {
  return new Map(tokens.map((token) => [token.key, token] as const));
}

export function getTokenByAddress(tokens: TokenConfig[], address: string) {
  return tokens.find((token) => sameAddress(token.address, address)) ?? null;
}

export function pairMatches(token0: string, token1: string, tokenA: string, tokenB: string) {
  return (
    (sameAddress(token0, tokenA) && sameAddress(token1, tokenB)) ||
    (sameAddress(token0, tokenB) && sameAddress(token1, tokenA))
  );
}

export function getFeaturedPool(tokenA: string, tokenB: string, fee: number) {
  return (
    FEATURED_POOLS.find(
      (pool) => pool.fee === fee && pairMatches(pool.tokenA, pool.tokenB, tokenA, tokenB),
    ) ?? null
  );
}

export async function resolvePoolAddress(
  provider: JsonRpcProvider,
  tokenA: string,
  tokenB: string,
  fee: number,
) {
  const featured = getFeaturedPool(tokenA, tokenB, fee);
  if (featured) {
    return featured.poolAddress;
  }

  const factory = new Contract(CORE_ADDRESSES.factory, factoryAbi, provider);
  const [t0, t1] = sortTokenPair({ address: tokenA as Address }, { address: tokenB as Address });
  const poolAddress = (await factory.getPool(t0.address, t1.address, fee)) as string;
  if (!poolAddress || sameAddress(poolAddress, ZeroAddress)) {
    return null;
  }
  return normalizeAddress(poolAddress);
}

export async function importTokenFromAddress(provider: JsonRpcProvider, address: string): Promise<TokenConfig> {
  const checksummed = normalizeAddress(address);
  const token = new Contract(checksummed, erc20Abi, provider);
  const [name, symbol, decimals] = await Promise.all([
    token.name() as Promise<string>,
    token.symbol() as Promise<string>,
    token.decimals() as Promise<number>,
  ]);

  return {
    key: checksummed.toLowerCase(),
    address: checksummed,
    symbol,
    name,
    decimals: Number(decimals),
    isImported: true,
  };
}
