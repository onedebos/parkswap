import { getAddress, isAddress } from "ethers";

/**
 * Default deployment: Tezos X EVM demo (ParkSwap / txpark).
 * Override any value with `NEXT_PUBLIC_*` — see `.env.example`.
 */

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

function parseAddressEnv(key: string, fallback: string): `0x${string}` {
  const raw = envTrim(key);
  if (raw && isAddress(raw)) return getAddress(raw) as `0x${string}`;
  return getAddress(fallback) as `0x${string}`;
}

function parseOptionalAddressEnv(key: string): `0x${string}` | null {
  const raw = envTrim(key);
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw) as `0x${string}`;
}

function parsePositiveIntEnv(key: string, fallback: number): number {
  const raw = envTrim(key);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseChainId(): number {
  return parsePositiveIntEnv("NEXT_PUBLIC_CHAIN_ID", 127124);
}

function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

/** ParkSwap demo — Uniswap v3–style periphery on Tezos X EVM testnet. */
const DEFAULT_SWAP_ROUTER = "0xc79Eb5Bd60Ac7cBF1C36fdCe0FF208B3b016947C";
const DEFAULT_QUOTER_V2 = "0x156Aa25435Dd3A2B5D1E6881d651eE345A089c55";
const DEFAULT_POSITION_MANAGER = "0xa87C8dd5FC8633Cf9452a03c8c604Ec5787d22d2";
const DEFAULT_FACTORY = "0xFbee097322418557d04285E51a17934E8b4C3f22";

const DEFAULT_USDC = "0xB155450Fbbe8B5bF1F584374243c7bdE5609Ab1f";
const DEFAULT_XU3O8 = "0xfBe9F61Da390178c9D1Bfa2d870B2916CE7e53BB";
const DEFAULT_VNXAU = "0xb7e6Bd22220C212Fb764A8509EB4A02216D4f419";

const DEFAULT_BLOCK_EXPLORER = "https://demo-blockscout.txpark.nomadic-labs.com";
const DEFAULT_RPC = "https://demo.txpark.nomadic-labs.com/rpc";

const DEFAULT_FEATURED_POOL = "0xEfa19F1EB8608c19c84a7F74aB3cf8D1F92a3aA4";

export type DexChainErc20Meta = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
};

export type DexChainConfig = {
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  blockExplorerDefaultUrl: string;
  /** Shown when the wallet chain matches `chainId` (header, labels). */
  networkDisplayName: string;
  /** `chainName` passed to `wallet_addEthereumChain`. */
  walletAddEthereumChainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  contracts: {
    swapRouter: `0x${string}`;
    quoterV2: `0x${string}`;
    positionManager: `0x${string}`;
    factory: `0x${string}`;
  };
  tokens: {
    usdc: DexChainErc20Meta;
    xu3o8: DexChainErc20Meta;
    vnxau: DexChainErc20Meta;
  };
  /** Optional pinned pool for dashboard price + `getFeaturedPool` shortcut; omit on new chains until deployed. */
  featuredPoolAddress: `0x${string}` | null;
};

function buildDexChainConfig(): DexChainConfig {
  const chainId = parseChainId();
  const chainIdHex = envTrim("NEXT_PUBLIC_CHAIN_ID_HEX") ?? chainIdToHex(chainId);

  const usdcDecimals = parsePositiveIntEnv("NEXT_PUBLIC_TOKEN_USDC_DECIMALS", 6);
  const xu3o8Decimals = parsePositiveIntEnv("NEXT_PUBLIC_TOKEN_XU3O8_DECIMALS", 18);
  const vnxauDecimals = parsePositiveIntEnv("NEXT_PUBLIC_TOKEN_VNXAU_DECIMALS", 18);

  const vnxauAddr =
    parseOptionalAddressEnv("NEXT_PUBLIC_VNXAU_TOKEN_ADDRESS") ??
    parseOptionalAddressEnv("NEXT_PUBLIC_TOKEN_VNXAU_ADDRESS") ??
    (getAddress(DEFAULT_VNXAU) as `0x${string}`);

  const explicitPool =
    parseOptionalAddressEnv("NEXT_PUBLIC_FEATURED_POOL_ADDRESS") ??
    parseOptionalAddressEnv("NEXT_PUBLIC_DASHBOARD_POOL_ADDRESS");
  const featuredPool: `0x${string}` | null =
    explicitPool ??
    (chainId === 127124 ? (getAddress(DEFAULT_FEATURED_POOL) as `0x${string}`) : null);

  return {
    chainId,
    chainIdHex,
    rpcUrl: envTrim("NEXT_PUBLIC_RPC_URL") ?? DEFAULT_RPC,
    blockExplorerDefaultUrl: envTrim("NEXT_PUBLIC_BLOCK_EXPLORER_URL") ?? DEFAULT_BLOCK_EXPLORER,
    networkDisplayName: envTrim("NEXT_PUBLIC_NETWORK_DISPLAY_NAME") ?? "Tezos X EVM Testnet",
    walletAddEthereumChainName: envTrim("NEXT_PUBLIC_WALLET_CHAIN_NAME") ?? "ParkSwap",
    nativeCurrency: {
      name: envTrim("NEXT_PUBLIC_NATIVE_CURRENCY_NAME") ?? "TXP",
      symbol: envTrim("NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL") ?? "TXP",
      decimals: parsePositiveIntEnv("NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS", 18),
    },
    contracts: {
      swapRouter: parseAddressEnv("NEXT_PUBLIC_SWAP_ROUTER_ADDRESS", DEFAULT_SWAP_ROUTER),
      quoterV2: parseAddressEnv("NEXT_PUBLIC_QUOTER_V2_ADDRESS", DEFAULT_QUOTER_V2),
      positionManager: parseAddressEnv("NEXT_PUBLIC_POSITION_MANAGER_ADDRESS", DEFAULT_POSITION_MANAGER),
      factory: parseAddressEnv("NEXT_PUBLIC_V3_FACTORY_ADDRESS", DEFAULT_FACTORY),
    },
    tokens: {
      usdc: {
        address: parseAddressEnv("NEXT_PUBLIC_TOKEN_USDC_ADDRESS", DEFAULT_USDC),
        symbol: envTrim("NEXT_PUBLIC_TOKEN_USDC_SYMBOL") ?? "USDC",
        name: envTrim("NEXT_PUBLIC_TOKEN_USDC_NAME") ?? "USD Coin",
        decimals: usdcDecimals,
      },
      xu3o8: {
        address: parseAddressEnv("NEXT_PUBLIC_TOKEN_XU3O8_ADDRESS", DEFAULT_XU3O8),
        symbol: envTrim("NEXT_PUBLIC_TOKEN_XU3O8_SYMBOL") ?? "xU3O8",
        name: envTrim("NEXT_PUBLIC_TOKEN_XU3O8_NAME") ?? "xU3O8",
        decimals: xu3o8Decimals,
      },
      vnxau: {
        address: vnxauAddr,
        symbol: envTrim("NEXT_PUBLIC_TOKEN_VNXAU_SYMBOL") ?? "VNXAU",
        name: envTrim("NEXT_PUBLIC_TOKEN_VNXAU_NAME") ?? "VNX Gold",
        decimals: vnxauDecimals,
      },
    },
    featuredPoolAddress: featuredPool,
  };
}

export const dexChainConfig: DexChainConfig = buildDexChainConfig();

export function walletChainLabel(chainId: number | null): string {
  if (chainId === null) return "Unknown";
  if (chainId === dexChainConfig.chainId) return dexChainConfig.networkDisplayName;
  return `Chain ${chainId}`;
}

export function configuredNetworkMismatchMessage(): string {
  return `Could not switch to ${dexChainConfig.networkDisplayName}. Please change network in your wallet.`;
}
