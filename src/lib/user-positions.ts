import { Contract, JsonRpcProvider } from "ethers";
import {
  CORE_ADDRESSES,
  DEFAULT_FEE_TIER,
  pairMatches,
  positionManagerEnumerateAbi,
  sameAddress,
  type TokenConfig,
} from "@/lib/txpark";

const npmReadAbi = [...positionManagerEnumerateAbi] as const;

export type ParkswapLiquidityPosition = {
  tokenId: bigint;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
};

export type PositionFilter = {
  tokenA?: string | null;
  tokenB?: string | null;
  fee?: number | null;
};

export function positionMatchesAppPoolFee(fee: number) {
  return fee === DEFAULT_FEE_TIER;
}

export function positionMatchesFilter(position: ParkswapLiquidityPosition, filter?: PositionFilter) {
  if (!filter) return true;

  const { tokenA, tokenB, fee } = filter;
  if (tokenA && tokenB && !pairMatches(position.token0, position.token1, tokenA, tokenB)) {
    return false;
  }

  if (fee != null && position.fee !== fee) {
    return false;
  }

  return true;
}

export async function fetchParkswapLiquidityPositions(
  provider: JsonRpcProvider,
  owner: string,
): Promise<ParkswapLiquidityPosition[]> {
  const npm = new Contract(CORE_ADDRESSES.positionManager, npmReadAbi, provider);
  const balance = (await npm.balanceOf(owner)) as bigint;
  const n = Number(balance);
  if (!Number.isSafeInteger(n) || n < 0) {
    return [];
  }

  const out: ParkswapLiquidityPosition[] = [];

  for (let i = 0; i < n; i++) {
    const tokenId = (await npm.tokenOfOwnerByIndex(owner, i)) as bigint;
    const row = (await npm.positions(tokenId)) as {
      nonce: bigint;
      operator: string;
      token0: string;
      token1: string;
      fee: bigint;
      tickLower: bigint;
      tickUpper: bigint;
      liquidity: bigint;
      feeGrowthInside0LastX128: bigint;
      feeGrowthInside1LastX128: bigint;
      tokensOwed0: bigint;
      tokensOwed1: bigint;
    };

    out.push({
      tokenId,
      token0: row.token0,
      token1: row.token1,
      fee: Number(row.fee),
      tickLower: Number(row.tickLower),
      tickUpper: Number(row.tickUpper),
      liquidity: row.liquidity,
      tokensOwed0: row.tokensOwed0,
      tokensOwed1: row.tokensOwed1,
    });
  }

  return out;
}

export function getPositionToken(position: ParkswapLiquidityPosition, tokens: TokenConfig[], which: "token0" | "token1") {
  const address = which === "token0" ? position.token0 : position.token1;
  return tokens.find((token) => sameAddress(token.address, address)) ?? null;
}

export function token0Symbol(position: ParkswapLiquidityPosition, tokens: TokenConfig[]) {
  return getPositionToken(position, tokens, "token0")?.symbol ?? "token0";
}

export function token1Symbol(position: ParkswapLiquidityPosition, tokens: TokenConfig[]) {
  return getPositionToken(position, tokens, "token1")?.symbol ?? "token1";
}
