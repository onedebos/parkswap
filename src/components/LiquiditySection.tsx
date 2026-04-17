"use client";

import { BrowserProvider, Contract, JsonRpcProvider, MaxUint256, formatUnits, isAddress, parseUnits } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImportTokenModal, loadImportTokenPreview, type ImportedTokenPreview } from "@/components/ImportTokenModal";
import { TokenSelectMenu } from "@/components/TokenSelectMenu";
import { counterpartHumanFromPrimary } from "@/lib/liquidity-deposit-pair";
import { loadLiquidityPositionMetrics, type LiquidityPositionMetrics } from "@/lib/position-metrics";
import { sqrtPriceX96FromOneTokenAEqualsXTokenB } from "@/lib/sqrt-price-from-pair";
import {
  CORE_ADDRESSES,
  DEFAULT_FEE_TIER,
  DEFAULT_LIQUIDITY_TOKEN_A,
  DEFAULT_LIQUIDITY_TOKEN_B,
  FEATURED_TOKENS,
  FULL_RANGE_TICK_LOWER,
  FULL_RANGE_TICK_UPPER,
  TXPARK_CHAIN_ID,
  TXPARK_RPC_URL,
  erc20Abi,
  poolAbi,
  positionManagerActionsAbi,
  resolvePoolAddress,
  sameAddress,
  sortTokenPair,
  txparkExplorerAddressUrl,
  type TokenConfig,
} from "@/lib/txpark";
import {
  fetchParkswapLiquidityPositions,
  positionMatchesFilter,
  token0Symbol,
  token1Symbol,
  type ParkswapLiquidityPosition,
} from "@/lib/user-positions";

const publicProvider = new JsonRpcProvider(TXPARK_RPC_URL, TXPARK_CHAIN_ID);

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereumProvider() {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
}

async function withSigner<T>(callback: (provider: BrowserProvider) => Promise<T>) {
  const ethereum = getEthereumProvider();
  if (!ethereum) throw new Error("Wallet not available");
  const browserProvider = new BrowserProvider(ethereum);
  return callback(browserProvider);
}

function liquidityErrorMessage(error: unknown) {
  if (!error) return "Something went wrong. Please try again.";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message) : "";
  if (code === "4001" || code === "ACTION_REJECTED" || /user denied|user rejected|rejected/i.test(message)) {
    return "Transaction cancelled in wallet.";
  }
  if (/insufficient funds/i.test(message)) return "Insufficient funds for this transaction.";
  if (/pool already|already initialized|AI\)/i.test(message)) return "Pool already exists. Refresh and use Add Liquidity.";
  return message || "Something went wrong. Please try again.";
}

async function readTokenBalance(account: string, tokenAddress: string) {
  const c = new Contract(tokenAddress, erc20Abi, publicProvider);
  return (await c.balanceOf(account)) as bigint;
}

async function readTokenAllowance(owner: string, tokenAddress: string, spender: string) {
  const c = new Contract(tokenAddress, erc20Abi, publicProvider);
  return (await c.allowance(owner, spender)) as bigint;
}

function tokenByKeyOrAddress(tokens: TokenConfig[], value: string) {
  return tokens.find((t) => t.key === value || sameAddress(t.address, value)) ?? null;
}

function mapAmountsToToken01(tokenA: TokenConfig, tokenB: TokenConfig, amtA: bigint, amtB: bigint, t0: TokenConfig) {
  let amount0 = 0n;
  let amount1 = 0n;
  if (sameAddress(tokenA.address, t0.address)) {
    amount0 = amtA;
    amount1 = amtB;
  } else {
    amount0 = amtB;
    amount1 = amtA;
  }
  return { amount0, amount1 };
}

function fmtPositionQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatDualTokenAmounts(
  sym0: string,
  amt0: number | null | undefined,
  sym1: string,
  amt1: number | null | undefined,
): string {
  if (
    amt0 == null ||
    amt1 == null ||
    !Number.isFinite(amt0) ||
    !Number.isFinite(amt1) ||
    sym0 === "token0" ||
    sym1 === "token1"
  ) {
    return "—";
  }
  return `${fmtPositionQty(amt0)} ${sym0} + ${fmtPositionQty(amt1)} ${sym1}`;
}

function PositionMetricsBlock({
  metrics,
  sym0,
  sym1,
  loading,
}: {
  metrics: LiquidityPositionMetrics | null | undefined;
  sym0: string;
  sym1: string;
  loading: boolean;
}) {
  if (loading) {
    return <p className="mt-2 text-xs text-white/40">Loading position details…</p>;
  }
  if (!metrics) {
    return <p className="mt-2 text-xs text-white/40">Position details unavailable for this NFT.</p>;
  }

  const valueLine = formatDualTokenAmounts(sym0, metrics.currentCompositionToken0, sym1, metrics.currentCompositionToken1);

  return (
    <dl className="mt-3 space-y-2 text-xs text-white/55">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <dt className="shrink-0 text-white/45">Position value</dt>
        <dd className="min-w-0 text-right text-white/90">
          {valueLine}
          <span className="mt-0.5 block text-[10px] font-normal text-white/35">At current pool price</span>
        </dd>
      </div>
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <dt className="shrink-0 text-white/45">Range</dt>
        <dd className="text-right text-white/90">
          <span className={metrics.isInRange ? "font-medium text-emerald-300/95" : "font-medium text-amber-300/95"}>
            {metrics.isInRange ? "In range" : "Out of range"}
          </span>
          <span className="text-white/40"> · {metrics.priceRangeLabel}</span>
        </dd>
      </div>
    </dl>
  );
}

export function LiquiditySection({
  wallet,
  importedTokens,
  onAddImportedToken,
  presetImportAddress,
  onConsumedPresetImportAddress,
  presetPairFromNav,
  onConsumedPresetPairFromNav,
  onRefreshBalances,
}: {
  wallet: { account: string | null; isCorrectNetwork: boolean };
  importedTokens: TokenConfig[];
  onAddImportedToken: (token: TokenConfig) => void;
  presetImportAddress: string | null;
  onConsumedPresetImportAddress: () => void;
  presetPairFromNav: { tokenAKey: string; tokenBKey: string } | null;
  onConsumedPresetPairFromNav: () => void;
  onRefreshBalances: () => Promise<void>;
}) {
  const allTokens = useMemo(() => {
    const m = new Map<string, TokenConfig>();
    for (const t of Object.values(FEATURED_TOKENS)) {
      m.set(t.address.toLowerCase(), t);
    }
    for (const t of importedTokens) {
      m.set(t.address.toLowerCase(), t);
    }
    return [...m.values()];
  }, [importedTokens]);

  const importedAddresses = useMemo(
    () => new Set(allTokens.map((t) => t.address.toLowerCase())),
    [allTokens],
  );

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importAddress, setImportAddress] = useState("");
  const [importPreview, setImportPreview] = useState<ImportedTokenPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [selA, setSelA] = useState<string>(FEATURED_TOKENS[DEFAULT_LIQUIDITY_TOKEN_A].key);
  const [selB, setSelB] = useState<string>(FEATURED_TOKENS[DEFAULT_LIQUIDITY_TOKEN_B].key);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolSqrtPriceX96, setPoolSqrtPriceX96] = useState<bigint | null>(null);

  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [initialPrice, setInitialPrice] = useState("");

  const [balA, setBalA] = useState<bigint | null>(null);
  const [balB, setBalB] = useState<bigint | null>(null);
  const [allow0, setAllow0] = useState<bigint | null>(null);
  const [allow1, setAllow1] = useState<bigint | null>(null);

  const [positions, setPositions] = useState<ParkswapLiquidityPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionMetricsById, setPositionMetricsById] = useState<Map<string, LiquidityPositionMetrics | null>>(() => new Map());
  const [positionMetricsLoading, setPositionMetricsLoading] = useState(false);

  const [pending, setPending] = useState<"approve" | "add" | "create" | null>(null);

  const syncFromPrice = useRef(false);
  const lastEditSide = useRef<"a" | "b" | null>(null);

  const tokenA = tokenByKeyOrAddress(allTokens, selA);
  const tokenB = tokenByKeyOrAddress(allTokens, selB);

  const [t0, t1] = useMemo(() => {
    if (!tokenA || !tokenB) return [null, null] as const;
    return sortTokenPair(tokenA, tokenB);
  }, [tokenA, tokenB]);

  const poolExists = Boolean(poolAddress);

  const refreshPool = useCallback(async () => {
    if (!tokenA || !tokenB || sameAddress(tokenA.address, tokenB.address)) {
      setPoolAddress(null);
      return;
    }
    setPoolLoading(true);
    try {
      const addr = await resolvePoolAddress(publicProvider, tokenA.address, tokenB.address, DEFAULT_FEE_TIER);
      setPoolAddress(addr);
    } catch {
      setPoolAddress(null);
    } finally {
      setPoolLoading(false);
    }
  }, [tokenA, tokenB]);

  useEffect(() => {
    void refreshPool();
  }, [refreshPool]);

  useEffect(() => {
    if (!poolAddress) {
      setPoolSqrtPriceX96(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pool = new Contract(poolAddress, poolAbi, publicProvider);
        const slot0 = await pool.slot0();
        if (!cancelled) setPoolSqrtPriceX96(slot0.sqrtPriceX96 as bigint);
      } catch {
        if (!cancelled) setPoolSqrtPriceX96(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poolAddress]);

  useEffect(() => {
    lastEditSide.current = null;
    setAmountA("");
    setAmountB("");
  }, [selA, selB]);

  const sqrtForDeposit = useMemo(() => {
    if (poolSqrtPriceX96 != null) return poolSqrtPriceX96;
    if (!tokenA || !tokenB || !initialPrice.trim()) return null;
    try {
      return sqrtPriceX96FromOneTokenAEqualsXTokenB(tokenA, tokenB, initialPrice.trim());
    } catch {
      return null;
    }
  }, [poolSqrtPriceX96, tokenA, tokenB, initialPrice]);

  const loadBalancesAndAllowances = useCallback(async () => {
    if (!wallet.account || !tokenA || !tokenB || !t0 || !t1) {
      setBalA(null);
      setBalB(null);
      setAllow0(null);
      setAllow1(null);
      return;
    }
    try {
      const [bA, bB, a0, a1] = await Promise.all([
        readTokenBalance(wallet.account, tokenA.address),
        readTokenBalance(wallet.account, tokenB.address),
        readTokenAllowance(wallet.account, t0.address, CORE_ADDRESSES.positionManager),
        readTokenAllowance(wallet.account, t1.address, CORE_ADDRESSES.positionManager),
      ]);
      setBalA(bA);
      setBalB(bB);
      setAllow0(a0);
      setAllow1(a1);
    } catch {
      setBalA(null);
      setBalB(null);
      setAllow0(null);
      setAllow1(null);
    }
  }, [wallet.account, tokenA, tokenB, t0, t1]);

  useEffect(() => {
    void loadBalancesAndAllowances();
  }, [loadBalancesAndAllowances]);

  const loadPositions = useCallback(async () => {
    if (!wallet.account) {
      setPositions([]);
      return;
    }
    setPositionsLoading(true);
    try {
      const rows = await fetchParkswapLiquidityPositions(publicProvider, wallet.account);
      setPositions(rows);
    } catch {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, [wallet.account]);

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  useEffect(() => {
    if (positions.length === 0) {
      setPositionMetricsById(new Map());
      setPositionMetricsLoading(false);
      return;
    }
    let cancelled = false;
    setPositionMetricsLoading(true);
    setPositionMetricsById(new Map());
    void loadLiquidityPositionMetrics(publicProvider, positions, allTokens)
      .then((m) => {
        if (!cancelled) setPositionMetricsById(m);
      })
      .catch(() => {
        if (!cancelled) setPositionMetricsById(new Map());
      })
      .finally(() => {
        if (!cancelled) setPositionMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [positions, allTokens]);

  useEffect(() => {
    if (!presetImportAddress?.trim()) return;
    const trimmed = presetImportAddress.trim();
    if (!isAddress(trimmed)) {
      onConsumedPresetImportAddress();
      return;
    }
    setImportAddress(trimmed);
    setImportPreview(null);
    setImportError(null);
    setImportModalOpen(true);
    onConsumedPresetImportAddress();
  }, [presetImportAddress, onConsumedPresetImportAddress]);

  useEffect(() => {
    if (!presetPairFromNav) return;
    setSelA(presetPairFromNav.tokenAKey);
    setSelB(presetPairFromNav.tokenBKey);
    onConsumedPresetPairFromNav();
  }, [presetPairFromNav, onConsumedPresetPairFromNav]);

  const filteredPositions = useMemo(() => {
    if (!tokenA || !tokenB) return [];
    return positions.filter((p) =>
      positionMatchesFilter(p, { tokenA: tokenA.address, tokenB: tokenB.address, fee: DEFAULT_FEE_TIER }),
    );
  }, [positions, tokenA, tokenB]);

  const parsedA = useMemo(() => {
    if (!tokenA || !amountA.trim()) return null;
    try {
      const v = parseUnits(amountA.trim(), tokenA.decimals);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amountA, tokenA]);

  const parsedB = useMemo(() => {
    if (!tokenB || !amountB.trim()) return null;
    try {
      const v = parseUnits(amountB.trim(), tokenB.decimals);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amountB, tokenB]);

  const onAmountAChange = useCallback(
    (raw: string) => {
      setAmountA(raw);
      if (!raw.trim()) {
        lastEditSide.current = null;
        setAmountB("");
        return;
      }
      lastEditSide.current = "a";
      if (!tokenA || !tokenB || !t0 || !t1 || sqrtForDeposit == null) return;
      syncFromPrice.current = true;
      try {
        setAmountB(
          counterpartHumanFromPrimary({
            source: "a",
            primaryAmountHuman: raw,
            tokenA,
            tokenB,
            token0: t0,
            token1: t1,
            sqrtPriceX96: sqrtForDeposit,
            tickLower: FULL_RANGE_TICK_LOWER,
            tickUpper: FULL_RANGE_TICK_UPPER,
          }),
        );
      } finally {
        syncFromPrice.current = false;
      }
    },
    [tokenA, tokenB, t0, t1, sqrtForDeposit],
  );

  const onAmountBChange = useCallback(
    (raw: string) => {
      setAmountB(raw);
      if (!raw.trim()) {
        lastEditSide.current = null;
        setAmountA("");
        return;
      }
      lastEditSide.current = "b";
      if (!tokenA || !tokenB || !t0 || !t1 || sqrtForDeposit == null) return;
      syncFromPrice.current = true;
      try {
        setAmountA(
          counterpartHumanFromPrimary({
            source: "b",
            primaryAmountHuman: raw,
            tokenA,
            tokenB,
            token0: t0,
            token1: t1,
            sqrtPriceX96: sqrtForDeposit,
            tickLower: FULL_RANGE_TICK_LOWER,
            tickUpper: FULL_RANGE_TICK_UPPER,
          }),
        );
      } finally {
        syncFromPrice.current = false;
      }
    },
    [tokenA, tokenB, t0, t1, sqrtForDeposit],
  );

  useEffect(() => {
    if (syncFromPrice.current) return;
    const side = lastEditSide.current;
    if (!side || !tokenA || !tokenB || !t0 || !t1 || sqrtForDeposit == null) return;
    const primary = side === "a" ? amountA : amountB;
    if (!primary.trim()) return;
    const next = counterpartHumanFromPrimary({
      source: side,
      primaryAmountHuman: primary,
      tokenA,
      tokenB,
      token0: t0,
      token1: t1,
      sqrtPriceX96: sqrtForDeposit,
      tickLower: FULL_RANGE_TICK_LOWER,
      tickUpper: FULL_RANGE_TICK_UPPER,
    });
    syncFromPrice.current = true;
    try {
      if (side === "a") setAmountB(next);
      else setAmountA(next);
    } finally {
      syncFromPrice.current = false;
    }
  }, [sqrtForDeposit, tokenA, tokenB, t0, t1, amountA, amountB]);

  const allowancesReady = allow0 != null && allow1 != null;

  const needsApprove = Boolean(
    t0 &&
      t1 &&
      wallet.account &&
      parsedA != null &&
      parsedB != null &&
      allowancesReady &&
      (() => {
        const { amount0, amount1 } = mapAmountsToToken01(tokenA!, tokenB!, parsedA, parsedB, t0);
        return allow0! < amount0 || allow1! < amount1;
      })(),
  );

  async function approveTokens() {
    if (!wallet.account || !wallet.isCorrectNetwork || !tokenA || !tokenB || !t0 || !t1 || !parsedA || !parsedB) return;
    const { amount0, amount1 } = mapAmountsToToken01(tokenA, tokenB, parsedA, parsedB, t0);
    setPending("approve");
    const id = "liq-approve";
    toast.loading("Approving tokens for liquidity…", { id });
    try {
      await withSigner(async (bp) => {
        const signer = await bp.getSigner();
        const c0 = new Contract(t0.address, erc20Abi, signer);
        const c1 = new Contract(t1.address, erc20Abi, signer);
        if (allow0 == null || allow0 < amount0) {
          await (await c0.approve(CORE_ADDRESSES.positionManager, MaxUint256)).wait();
        }
        if (allow1 == null || allow1 < amount1) {
          await (await c1.approve(CORE_ADDRESSES.positionManager, MaxUint256)).wait();
        }
      });
      toast.success("Tokens approved", { id });
      await loadBalancesAndAllowances();
      await onRefreshBalances();
    } catch (e) {
      toast.error(liquidityErrorMessage(e), { id });
    } finally {
      setPending(null);
    }
  }

  async function mintLiquidity() {
    if (!wallet.account || !wallet.isCorrectNetwork || !tokenA || !tokenB || !t0 || !t1 || !parsedA || !parsedB) return;
    const { amount0, amount1 } = mapAmountsToToken01(tokenA, tokenB, parsedA, parsedB, t0);
    const bal0 = sameAddress(tokenA.address, t0.address) ? balA : balB;
    const bal1 = sameAddress(tokenA.address, t0.address) ? balB : balA;
    if (bal0 != null && amount0 > bal0) {
      toast.error(`Insufficient ${t0.symbol} balance.`);
      return;
    }
    if (bal1 != null && amount1 > bal1) {
      toast.error(`Insufficient ${t1.symbol} balance.`);
      return;
    }

    setPending("add");
    const id = "liq-mint";
    toast.loading("Adding liquidity…", { id });
    try {
      await withSigner(async (bp) => {
        const signer = await bp.getSigner();
        const npm = new Contract(CORE_ADDRESSES.positionManager, positionManagerActionsAbi, signer);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
        const tx = await npm.mint({
          token0: t0.address,
          token1: t1.address,
          fee: DEFAULT_FEE_TIER,
          tickLower: FULL_RANGE_TICK_LOWER,
          tickUpper: FULL_RANGE_TICK_UPPER,
          amount0Desired: amount0,
          amount1Desired: amount1,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: wallet.account,
          deadline,
        });
        await tx.wait();
      });
      toast.success("Liquidity added", { id });
      setAmountA("");
      setAmountB("");
      await refreshPool();
      await loadPositions();
      await loadBalancesAndAllowances();
      await onRefreshBalances();
    } catch (e) {
      toast.error(liquidityErrorMessage(e), { id });
    } finally {
      setPending(null);
    }
  }

  async function createPoolAndMint() {
    if (!wallet.account || !wallet.isCorrectNetwork || !tokenA || !tokenB || !t0 || !t1 || !parsedA || !parsedB) return;

    let sqrtPriceX96: bigint;
    try {
      sqrtPriceX96 = sqrtPriceX96FromOneTokenAEqualsXTokenB(tokenA, tokenB, initialPrice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid initial price.");
      return;
    }

    const { amount0, amount1 } = mapAmountsToToken01(tokenA, tokenB, parsedA, parsedB, t0);
    const bal0 = sameAddress(tokenA.address, t0.address) ? balA : balB;
    const bal1 = sameAddress(tokenA.address, t0.address) ? balB : balA;
    if (bal0 != null && amount0 > bal0) {
      toast.error(`Insufficient ${t0.symbol} balance.`);
      return;
    }
    if (bal1 != null && amount1 > bal1) {
      toast.error(`Insufficient ${t1.symbol} balance.`);
      return;
    }

    setPending("create");
    const id = "liq-create";
    toast.loading("Creating pool…", { id });
    try {
      await withSigner(async (bp) => {
        const signer = await bp.getSigner();
        const npm = new Contract(CORE_ADDRESSES.positionManager, positionManagerActionsAbi, signer);
        const tx1 = await npm.createAndInitializePoolIfNecessary(t0.address, t1.address, DEFAULT_FEE_TIER, sqrtPriceX96);
        await tx1.wait();

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
        const tx2 = await npm.mint({
          token0: t0.address,
          token1: t1.address,
          fee: DEFAULT_FEE_TIER,
          tickLower: FULL_RANGE_TICK_LOWER,
          tickUpper: FULL_RANGE_TICK_UPPER,
          amount0Desired: amount0,
          amount1Desired: amount1,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: wallet.account,
          deadline,
        });
        await tx2.wait();
      });
      toast.success("Pool created and liquidity added", { id });
      setInitialPrice("");
      setAmountA("");
      setAmountB("");
      await refreshPool();
      await loadPositions();
      await loadBalancesAndAllowances();
      await onRefreshBalances();
    } catch (e) {
      const msg = liquidityErrorMessage(e);
      if (/pool already|already initialized/i.test(msg)) {
        toast.message("Pool may already exist — try Add Liquidity again.", { id });
        await refreshPool();
      } else {
        toast.error(msg, { id });
      }
    } finally {
      setPending(null);
    }
  }

  if (!tokenA || !tokenB) {
    return <p className="text-sm text-white/45">Loading tokens…</p>;
  }

  const sameToken = sameAddress(tokenA.address, tokenB.address);
  const canSubmitBase =
    wallet.account &&
    wallet.isCorrectNetwork &&
    !sameToken &&
    parsedA != null &&
    parsedB != null &&
    pending === null &&
    allowancesReady;

  const canAdd = canSubmitBase && poolExists && !needsApprove;
  const canCreate = canSubmitBase && !poolExists && initialPrice.trim().length > 0 && !needsApprove;

  function openImportModal() {
    setImportModalOpen(true);
    setImportAddress("");
    setImportPreview(null);
    setImportError(null);
    setImportLoading(false);
  }

  function closeImportModal() {
    setImportModalOpen(false);
    setImportAddress("");
    setImportPreview(null);
    setImportError(null);
    setImportLoading(false);
  }

  async function handleLoadImportModal() {
    setImportLoading(true);
    setImportError(null);
    const res = await loadImportTokenPreview(importAddress, importedAddresses);
    setImportLoading(false);
    if ("error" in res) {
      setImportPreview(null);
      setImportError(res.error);
    } else {
      setImportPreview(res.preview);
    }
  }

  function handleClearImportPreview() {
    setImportPreview(null);
    setImportAddress("");
    setImportError(null);
  }

  function handleConfirmImportFromModal() {
    if (!importPreview || importPreview.alreadyImported) {
      if (importPreview?.alreadyImported) {
        toast.error("Token already in your list");
      }
      return;
    }
    onAddImportedToken(importPreview.token);
    toast.success(`Imported ${importPreview.token.symbol}`);
    setSelB(importPreview.token.key);
    closeImportModal();
  }

  return (
    <div className="grid gap-5">
      <ImportTokenModal
        isOpen={importModalOpen}
        addressInput={importAddress}
        onAddressInputChange={setImportAddress}
        onClose={closeImportModal}
        onLoad={() => void handleLoadImportModal()}
        onConfirmImport={handleConfirmImportFromModal}
        onClearPreview={handleClearImportPreview}
        preview={importPreview}
        loading={importLoading}
        error={importError}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">Need another ERC-20? Import by contract address.</p>
        <button
          type="button"
          onClick={openImportModal}
          className="shrink-0 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10"
        >
          Import token
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TokenSelectMenu label="Token A" tokens={allTokens} value={selA} onChange={setSelA} />
        <TokenSelectMenu label="Token B" tokens={allTokens} value={selB} onChange={setSelB} />
      </div>

      <div className="rounded-[24px] border border-white/10 bg-black/25 p-4 text-sm text-white/70">
        {poolLoading ? (
          <p>Checking pool…</p>
        ) : sameToken ? (
          <p className="text-amber-200/90">Choose two different tokens.</p>
        ) : poolExists ? (
          <p>
            Pool found:{" "}
            <a
              href={txparkExplorerAddressUrl(poolAddress!)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-emerald-200/90 underline decoration-emerald-400/30 underline-offset-2"
            >
              {poolAddress}
            </a>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="font-medium text-amber-100/95">No pool exists for this pair</p>
            <p className="text-white/55">
              You are creating a new market. Set the initial price, then enter a deposit for one token — the other is
              filled from that price.
            </p>
          </div>
        )}
      </div>

      {!poolExists && !sameToken && !poolLoading ? (
        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span>
            Initial price (1 {tokenA.symbol} = … {tokenB.symbol})
          </span>
          <input
            value={initialPrice}
            onChange={(e) => setInitialPrice(e.target.value)}
            placeholder={`e.g. 1.0 (${tokenB.symbol} per 1 ${tokenA.symbol})`}
            className="rounded-2xl border border-white/10 bg-[#222222] px-4 py-3 text-white outline-none placeholder:text-white/25"
            inputMode="decimal"
          />
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span>Deposit {tokenA.symbol}</span>
          <input
            value={amountA}
            onChange={(e) => onAmountAChange(e.target.value)}
            className="rounded-2xl border border-white/10 bg-[#222222] px-4 py-3 text-white outline-none placeholder:text-white/25"
            placeholder="0.0"
            inputMode="decimal"
          />
          <span className="text-xs text-white/40">
            Balance: {wallet.account && balA != null ? formatUnits(balA, tokenA.decimals) : "—"}
          </span>
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span>Deposit {tokenB.symbol}</span>
          <input
            value={amountB}
            onChange={(e) => onAmountBChange(e.target.value)}
            className="rounded-2xl border border-white/10 bg-[#222222] px-4 py-3 text-white outline-none placeholder:text-white/25"
            placeholder="0.0"
            inputMode="decimal"
          />
          <span className="text-xs text-white/40">
            Balance: {wallet.account && balB != null ? formatUnits(balB, tokenB.decimals) : "—"}
          </span>
        </label>
      </div>
      <p className="text-xs text-white/40">
        {sqrtForDeposit != null
          ? "Enter an amount on one side; the other is set from the live pool price (or your initial price before the pool exists). You can switch which field you edit anytime."
          : poolExists
            ? "Loading pool price…"
            : "Set the initial price above to enable auto-filled deposit amounts."}
      </p>

      {wallet.account && needsApprove ? (
        <button
          type="button"
          onClick={() => void approveTokens()}
          disabled={!wallet.isCorrectNetwork || !parsedA || !parsedB || pending !== null}
          className="w-full rounded-[22px] border border-white/15 bg-white/10 px-4 py-4 text-base font-semibold text-white enabled:hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending === "approve" ? "Approving…" : "Approve tokens for liquidity"}
        </button>
      ) : null}

      {poolExists ? (
        <button
          type="button"
          onClick={() => void mintLiquidity()}
          disabled={!canAdd}
          className="w-full rounded-[22px] bg-white px-4 py-4 text-base font-semibold text-black enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending === "add" ? "Adding…" : "Add Liquidity"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void createPoolAndMint()}
          disabled={!canCreate}
          className="w-full rounded-[22px] bg-white px-4 py-4 text-base font-semibold text-black enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending === "create" ? "Creating pool…" : "Create Pool & Add Liquidity"}
        </button>
      )}

      <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-medium text-white/85">Your positions (this pair, 0.25% fee)</p>
        {positionsLoading ? (
          <p className="mt-2 text-sm text-white/45">Loading…</p>
        ) : filteredPositions.length === 0 ? (
          <p className="mt-2 text-sm text-white/45">No positions yet for this selection.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm text-white/70">
            {filteredPositions.map((p) => {
              const id = p.tokenId.toString();
              const s0 = token0Symbol(p, allTokens);
              const s1 = token1Symbol(p, allTokens);
              const metrics = positionMetricsById.get(id);
              return (
                <li key={id} className="rounded-xl border border-white/8 bg-white/4 px-3 py-3">
                  <div className="font-mono text-xs text-white/80">
                    #{id} · {s0} / {s1}
                  </div>
                  <PositionMetricsBlock metrics={metrics} sym0={s0} sym1={s1} loading={positionMetricsLoading} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
