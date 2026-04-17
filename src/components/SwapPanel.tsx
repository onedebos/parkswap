"use client";

import { BrowserProvider, Contract, JsonRpcProvider, MaxUint256, formatUnits, parseUnits } from "ethers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImportTokenModal, loadImportTokenPreview, type ImportedTokenPreview } from "@/components/ImportTokenModal";
import { SwapTokenSelect } from "@/components/SwapTokenSelect";
import { loadRecentTokenKeys, pushRecentTokenKey } from "@/lib/recent-tokens";
import { midAmountOutPerIn } from "@/lib/swap-mid-price";
import {
  CORE_ADDRESSES,
  DEFAULT_FEE_TIER,
  DEFAULT_SWAP_TOKEN_IN,
  DEFAULT_SWAP_TOKEN_OUT,
  DEX_NETWORK_DISPLAY_NAME,
  FEATURED_TOKENS,
  configuredNetworkMismatchMessage,
  getFeaturedTokensOrdered,
  TXPARK_CHAIN_ID,
  TXPARK_RPC_URL,
  erc20Abi,
  poolAbi,
  quoterAbi,
  resolvePoolAddress,
  sameAddress,
  sortTokenPair,
  swapRouterAbi,
  type TokenConfig,
} from "@/lib/txpark";

const publicProvider = new JsonRpcProvider(TXPARK_RPC_URL, TXPARK_CHAIN_ID);

function getReadableErrorMessage(error: unknown) {
  if (!error) return "Something went wrong. Please try again.";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message) : "";
  if (code === "4001" || code === "ACTION_REJECTED" || /user denied|user rejected|rejected/i.test(message)) {
    return "Transaction cancelled in wallet.";
  }
  if (/insufficient funds/i.test(message)) return "Insufficient funds for this transaction.";
  if (/wallet not available/i.test(message)) {
    return "No wallet detected. Open the app in MetaMask or another injected wallet.";
  }
  if (/network switch failed/i.test(message)) {
    return configuredNetworkMismatchMessage();
  }
  return message || "Something went wrong. Please try again.";
}

function tokenByKey(merged: TokenConfig[], key: string) {
  return merged.find((t) => t.key === key) ?? null;
}

async function hasPoolAtAppFee(tokenA: string, tokenB: string): Promise<boolean> {
  const addr = await resolvePoolAddress(publicProvider, tokenA, tokenB, DEFAULT_FEE_TIER).catch(() => null);
  return Boolean(addr);
}

async function hasPoolWithAnyFeatured(token: TokenConfig, featured: TokenConfig[]): Promise<boolean> {
  const others = featured.filter((f) => !sameAddress(f.address, token.address));
  if (others.length === 0) return false;
  const checks = await Promise.all(others.map((f) => hasPoolAtAppFee(token.address, f.address)));
  return checks.some(Boolean);
}

function parseInputAmount(value: string, decimals: number) {
  if (!value || Number(value) <= 0) return null;
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

function formatBalance(value: bigint | null | undefined, decimals: number, fractionDigits = 4) {
  if (value == null) return "0";
  const formatted = Number(formatUnits(value, decimals));
  if (!Number.isFinite(formatted)) return "0";
  return formatted.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}

type Props = {
  wallet: { account: string | null; chainId: number | null; isCorrectNetwork: boolean };
  mergedTokens: TokenConfig[];
  /** Lowercased addresses from locally stored “Create Token” deployments. */
  deployedAddresses: Set<string>;
  /** Same tokens as merged deploy entries, ordered newest-first (matches Create Token list). */
  deployedTokensOrdered: TokenConfig[];
  importedAddresses: Set<string>;
  balancesByKey: Record<string, bigint | null>;
  onAddImportedToken: (token: TokenConfig) => void;
  onOpenLiquidityWithPair: (args: { tokenAKey: string; tokenBKey: string }) => void;
  onRefreshBalances: () => Promise<void>;
};

export function SwapPanel({
  wallet,
  mergedTokens,
  deployedAddresses,
  deployedTokensOrdered,
  importedAddresses,
  balancesByKey,
  onAddImportedToken,
  onOpenLiquidityWithPair,
  onRefreshBalances,
}: Props) {
  const [tokenInKey, setTokenInKey] = useState<string>(DEFAULT_SWAP_TOKEN_IN);
  const [tokenOutKey, setTokenOutKey] = useState<string>(DEFAULT_SWAP_TOKEN_OUT);
  const [swapAmount, setSwapAmount] = useState("100");
  const [recentKeys, setRecentKeys] = useState<string[]>([]);

  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [sqrtPriceX96, setSqrtPriceX96] = useState<bigint | null>(null);

  const [quote, setQuote] = useState<{ amountOut: string | null; error: string | null }>({ amountOut: null, error: null });
  const [swapAllowance, setSwapAllowance] = useState<bigint>(0n);
  const [pendingAction, setPendingAction] = useState<"approve-swap" | "swap" | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<"in" | "out">("in");
  const [importAddress, setImportAddress] = useState("");
  const [importPreview, setImportPreview] = useState<ImportedTokenPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setRecentKeys(loadRecentTokenKeys());
  }, []);

  const featuredOrdered = useMemo(() => getFeaturedTokensOrdered(), []);
  const featuredAddr = useMemo(() => new Set(featuredOrdered.map((t) => t.address.toLowerCase())), [featuredOrdered]);

  const yourTokens = useMemo(
    () => mergedTokens.filter((t) => !featuredAddr.has(t.address.toLowerCase())),
    [mergedTokens, featuredAddr],
  );

  const [recentForInDropdown, setRecentForInDropdown] = useState<TokenConfig[]>([]);
  const [recentForOutDropdown, setRecentForOutDropdown] = useState<TokenConfig[]>([]);

  const tokenIn = tokenByKey(mergedTokens, tokenInKey);
  const tokenOut = tokenByKey(mergedTokens, tokenOutKey);

  useEffect(() => {
    const keys = new Set(mergedTokens.map((t) => t.key));
    setTokenInKey((cur) => (keys.has(cur) ? cur : DEFAULT_SWAP_TOKEN_IN));
    setTokenOutKey((cur) => (keys.has(cur) ? cur : DEFAULT_SWAP_TOKEN_OUT));
  }, [mergedTokens]);

  useEffect(() => {
    if (tokenIn && tokenOut && sameAddress(tokenIn.address, tokenOut.address)) {
      const alt = mergedTokens.find((t) => !sameAddress(t.address, tokenIn.address));
      if (alt) setTokenOutKey(alt.key);
    }
  }, [tokenIn, tokenOut, mergedTokens]);

  /**
   * Recent = (1) tokens you deployed (local storage), then (2) keys from recent activity that have a v3 pool
   * with at least one featured token at the app fee (0.25%). Excludes the token selected on the other leg.
   */
  useEffect(() => {
    let cancelled = false;
    const map = new Map(mergedTokens.map((t) => [t.key, t] as const));

    async function buildRecent(excludeKey: string | null) {
      const list: TokenConfig[] = [];
      const seen = new Set<string>();

      for (const dt of deployedTokensOrdered) {
        const t = mergedTokens.find((m) => sameAddress(m.address, dt.address)) ?? dt;
        if (excludeKey && t.key === excludeKey) continue;
        if (seen.has(t.key)) continue;
        list.push(t);
        seen.add(t.key);
      }

      for (const k of recentKeys) {
        const t = map.get(k);
        if (!t || seen.has(t.key)) continue;
        if (excludeKey && t.key === excludeKey) continue;
        if (deployedAddresses.has(t.address.toLowerCase())) continue;
        if (await hasPoolWithAnyFeatured(t, featuredOrdered)) {
          list.push(t);
          seen.add(t.key);
        }
        if (cancelled) return list;
      }
      return list;
    }

    void (async () => {
      const [nextIn, nextOut] = await Promise.all([buildRecent(tokenOutKey), buildRecent(tokenInKey)]);
      if (!cancelled) {
        setRecentForInDropdown(nextIn);
        setRecentForOutDropdown(nextOut);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergedTokens, recentKeys, featuredOrdered, deployedAddresses, deployedTokensOrdered, tokenInKey, tokenOutKey]);

  const [t0, t1] = useMemo(() => {
    if (!tokenIn || !tokenOut) return [null, null] as const;
    return sortTokenPair(tokenIn, tokenOut);
  }, [tokenIn, tokenOut]);

  const poolExists = Boolean(poolAddress && tokenIn && tokenOut && !sameAddress(tokenIn.address, tokenOut.address));

  const midOutPerIn = useMemo(() => {
    if (!poolExists || !tokenIn || !tokenOut || !t0 || !t1 || sqrtPriceX96 == null) return null;
    return midAmountOutPerIn(tokenIn, tokenOut, t0, t1, sqrtPriceX96);
  }, [poolExists, tokenIn, tokenOut, t0, t1, sqrtPriceX96]);

  const swapInputParsed = tokenIn ? parseInputAmount(swapAmount, tokenIn.decimals) : null;

  const refreshPool = useCallback(async () => {
    if (!tokenIn || !tokenOut || sameAddress(tokenIn.address, tokenOut.address)) {
      setPoolAddress(null);
      setSqrtPriceX96(null);
      return;
    }
    setPoolLoading(true);
    try {
      const addr = await resolvePoolAddress(publicProvider, tokenIn.address, tokenOut.address, DEFAULT_FEE_TIER);
      setPoolAddress(addr);
    } catch {
      setPoolAddress(null);
      setSqrtPriceX96(null);
    } finally {
      setPoolLoading(false);
    }
  }, [tokenIn, tokenOut]);

  useEffect(() => {
    void refreshPool();
  }, [refreshPool]);

  useEffect(() => {
    if (!poolAddress) {
      setSqrtPriceX96(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pool = new Contract(poolAddress, poolAbi, publicProvider);
        const slot0 = await pool.slot0();
        if (!cancelled) {
          setSqrtPriceX96(slot0.sqrtPriceX96 as bigint);
        }
      } catch {
        if (!cancelled) {
          setSqrtPriceX96(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poolAddress]);

  const readAllowance = useCallback(async () => {
    if (!wallet.account || !tokenIn) {
      setSwapAllowance(0n);
      return;
    }
    try {
      const c = new Contract(tokenIn.address, erc20Abi, publicProvider);
      const a = (await c.allowance(wallet.account, CORE_ADDRESSES.swapRouter)) as bigint;
      setSwapAllowance(a);
    } catch {
      setSwapAllowance(0n);
    }
  }, [wallet.account, tokenIn]);

  useEffect(() => {
    void readAllowance();
  }, [readAllowance, tokenInKey, wallet.account, poolAddress]);

  useEffect(() => {
    if (!poolExists || !swapInputParsed || !tokenIn || !tokenOut) {
      setQuote({ amountOut: null, error: null });
      return;
    }
    let cancelled = false;
    const quoter = new Contract(CORE_ADDRESSES.quoterV2, quoterAbi, publicProvider);
    void quoter.quoteExactInputSingle
      .staticCall({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: swapInputParsed,
        fee: DEFAULT_FEE_TIER,
        sqrtPriceLimitX96: 0,
      })
      .then((result: { amountOut: bigint }) => {
        if (cancelled) return;
        setQuote({
          amountOut: formatUnits(result.amountOut, tokenOut.decimals),
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setQuote({ amountOut: null, error: "Quote unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [poolExists, swapInputParsed, tokenIn, tokenOut]);

  const needsSwapApproval = swapInputParsed ? swapAllowance < swapInputParsed : true;

  const setInKey = (key: string) => {
    setTokenInKey(key);
    pushRecentTokenKey(key);
    setRecentKeys(loadRecentTokenKeys());
  };
  const setOutKey = (key: string) => {
    setTokenOutKey(key);
    pushRecentTokenKey(key);
    setRecentKeys(loadRecentTokenKeys());
  };

  const flip = () => {
    const a = tokenInKey;
    setTokenInKey(tokenOutKey);
    setTokenOutKey(a);
  };

  async function withSigner<T>(callback: (provider: BrowserProvider) => Promise<T>) {
    const ethereum =
      typeof window !== "undefined" ? (window as Window & { ethereum?: { request: (a: { method: string }) => Promise<unknown> } }).ethereum : null;
    if (!ethereum) throw new Error("Wallet not available");
    const browserProvider = new BrowserProvider(ethereum);
    return callback(browserProvider);
  }

  async function approveSwapToken() {
    if (!wallet.isCorrectNetwork) {
      toast.error(`Switch to ${DEX_NETWORK_DISPLAY_NAME} before approving.`);
      return;
    }
    if (!swapInputParsed || !tokenIn) {
      toast.error("Enter a valid swap amount first.");
      return;
    }
    setPendingAction("approve-swap");
    toast.loading(`Approving ${tokenIn.symbol} for swap...`, { id: "approve-swap" });
    try {
      await withSigner(async (browserProvider) => {
        const signer = await browserProvider.getSigner();
        const c = new Contract(tokenIn.address, erc20Abi, signer);
        const tx = await c.approve(CORE_ADDRESSES.swapRouter, MaxUint256);
        await tx.wait();
      });
      toast.success(`Approved ${tokenIn.symbol} for swaps`, { id: "approve-swap" });
      await readAllowance();
      await onRefreshBalances();
    } catch (error) {
      toast.error(getReadableErrorMessage(error), { id: "approve-swap" });
    } finally {
      setPendingAction(null);
    }
  }

  async function runSwap() {
    if (!wallet.isCorrectNetwork) {
      toast.error(`Switch to ${DEX_NETWORK_DISPLAY_NAME} before swapping.`);
      return;
    }
    if (!swapInputParsed || !tokenIn || !tokenOut || !wallet.account) {
      toast.error("Enter a valid swap amount.");
      return;
    }
    setPendingAction("swap");
    toast.loading(`Submitting ${tokenIn.symbol} → ${tokenOut.symbol} swap...`, { id: "swap" });
    try {
      await withSigner(async (browserProvider) => {
        const signer = await browserProvider.getSigner();
        const router = new Contract(CORE_ADDRESSES.swapRouter, swapRouterAbi, signer);
        const tx = await router.exactInputSingle({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee: DEFAULT_FEE_TIER,
          recipient: wallet.account,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20,
          amountIn: swapInputParsed,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        });
        await tx.wait();
      });
      toast.success(`Swap confirmed on ${DEX_NETWORK_DISPLAY_NAME}`, { id: "swap" });
      await onRefreshBalances();
      await readAllowance();
      void refreshPool();
    } catch (error) {
      toast.error(getReadableErrorMessage(error), { id: "swap" });
    } finally {
      setPendingAction(null);
    }
  }

  const openImport = (target: "in" | "out") => {
    setImportTarget(target);
    setImportAddress("");
    setImportPreview(null);
    setImportError(null);
    setImportModalOpen(true);
  };

  const onLoadImportPreview = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await loadImportTokenPreview(importAddress, importedAddresses);
      if ("error" in res) {
        setImportPreview(null);
        setImportError(res.error);
      } else {
        setImportPreview(res.preview);
        setImportError(null);
      }
    } finally {
      setImportLoading(false);
    }
  };

  const onConfirmImport = () => {
    if (!importPreview) return;
    onAddImportedToken(importPreview.token);
    if (importTarget === "in") setInKey(importPreview.token.key);
    else setOutKey(importPreview.token.key);
    setImportModalOpen(false);
    setImportPreview(null);
    setImportAddress("");
  };

  const usdHint = useMemo(() => {
    if (!tokenIn || !swapAmount || Number(swapAmount) <= 0) return "$0";
    const n = Number(swapAmount);
    if (tokenIn.symbol === "USDC" || tokenIn.key === FEATURED_TOKENS.usdc.key) {
      return `≈ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`;
    }
    if (tokenOut?.symbol === "USDC" || tokenOut?.key === FEATURED_TOKENS.usdc.key) {
      if (quote.amountOut) return `≈ ${Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`;
    }
    if (midOutPerIn != null && tokenOut) {
      return `≈ ${(n * midOutPerIn).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
    }
    return "—";
  }, [tokenIn, tokenOut, swapAmount, quote.amountOut, midOutPerIn]);

  const priceLine =
    midOutPerIn != null && tokenIn && tokenOut
      ? `1 ${tokenIn.symbol} ≈ ${midOutPerIn.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${tokenOut.symbol}`
      : poolLoading
        ? "Loading…"
        : "—";

  return (
    <>
      <div className="rounded-[30px] bg-[#191919] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="rounded-[24px] border border-white/10 bg-[#151515] p-5">
          <div className="mb-3 flex items-center justify-between text-sm text-white/55">
            <span>Sell</span>
            <span>{wallet.account && tokenIn ? formatBalance(balancesByKey[tokenIn.key], tokenIn.decimals) : "0"}</span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                className="w-full bg-transparent text-5xl font-medium tracking-tight outline-none placeholder:text-white/20"
                placeholder="0.0"
                inputMode="decimal"
              />
              <div className="mt-2 text-sm text-white/35">{usdHint}</div>
            </div>
            {tokenIn ? (
              <SwapTokenSelect
                ariaLabel="Select token to sell"
                valueKey={tokenInKey}
                onChange={setInKey}
                registry={mergedTokens}
                featured={featuredOrdered}
                yourTokens={yourTokens}
                recentTokens={recentForInDropdown}
                excludeKey={tokenOutKey}
                onImportClick={() => openImport("in")}
              />
            ) : null}
          </div>
        </div>

        <div className="relative z-10 -my-4 flex justify-center">
          <button
            type="button"
            onClick={flip}
            className="flex h-14 w-14 items-center justify-center rounded-2xl border-[6px] border-[#191919] bg-[#2a2a2a] text-2xl text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] hover:bg-[#363636]"
            aria-label="Flip swap direction"
          >
            ↓
          </button>
        </div>

        <div className="rounded-[24px] bg-[#222222] p-5">
          <div className="mb-3 flex items-center justify-between text-sm text-white/55">
            <span>Buy</span>
            <span>{wallet.account && tokenOut ? formatBalance(balancesByKey[tokenOut.key], tokenOut.decimals) : "0"}</span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-5xl font-medium tracking-tight text-white/90">
                {quote.amountOut ? Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0.0"}
              </div>
              <div className="mt-2 text-sm text-white/35">
                {quote.amountOut && tokenOut
                  ? `≈ ${Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`
                  : tokenOut
                    ? `0 ${tokenOut.symbol}`
                    : "—"}
              </div>
            </div>
            {tokenOut ? (
              <SwapTokenSelect
                ariaLabel="Select token to buy"
                valueKey={tokenOutKey}
                onChange={setOutKey}
                registry={mergedTokens}
                featured={featuredOrdered}
                yourTokens={yourTokens}
                recentTokens={recentForOutDropdown}
                excludeKey={tokenInKey}
                onImportClick={() => openImport("out")}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-3 space-y-3 rounded-[22px] bg-[#151515] px-4 py-3 text-sm text-white/60">
          {poolExists ? (
            <div>
              <div className="flex items-center justify-between gap-2 text-white/60">
                <span>Price</span>
                <span className="text-right text-white/85">{priceLine}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-white/60">
                <span>Quote</span>
                <span className="text-right text-white/85">
                  {quote.amountOut && tokenOut
                    ? `${Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${tokenOut.symbol}`
                    : quote.error ?? (swapInputParsed ? "—" : "Enter amount")}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-red-300/90">
              <p className="font-medium">No pool</p>
              <p className="mt-1 text-sm text-white/55">No pool exists for this pair at the 0.25% fee tier.</p>
              <button
                type="button"
                onClick={() => {
                  if (!tokenIn || !tokenOut) return;
                  onOpenLiquidityWithPair({ tokenAKey: tokenIn.key, tokenBKey: tokenOut.key });
                }}
                className="mt-3 w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
              >
                {tokenIn && tokenOut
                  ? `Create ${tokenIn.symbol}/${tokenOut.symbol} pool`
                  : "Create pool"}
              </button>
            </div>
          )}
        </div>

        {poolExists && needsSwapApproval ? (
          <button
            type="button"
            onClick={() => void approveSwapToken()}
            disabled={!wallet.account || !wallet.isCorrectNetwork || !needsSwapApproval || pendingAction !== null}
            className="mt-3 w-full rounded-[22px] bg-[#2b2b2b] px-4 py-4 text-base font-semibold text-white enabled:hover:bg-[#363636] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingAction === "approve-swap" ? "Approving…" : `Approve ${tokenIn?.symbol ?? "token"}`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void runSwap()}
          disabled={
            !wallet.account ||
            !wallet.isCorrectNetwork ||
            !poolExists ||
            needsSwapApproval ||
            !swapInputParsed ||
            pendingAction !== null
          }
          className="mt-3 w-full rounded-[22px] bg-white px-4 py-4 text-base font-semibold text-black enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {wallet.account
            ? pendingAction === "swap"
              ? "Swapping…"
              : `Swap ${tokenIn?.symbol ?? ""} for ${tokenOut?.symbol ?? ""}`
            : "Connect wallet"}
        </button>
      </div>

      <ImportTokenModal
        isOpen={importModalOpen}
        addressInput={importAddress}
        onAddressInputChange={setImportAddress}
        onClose={() => {
          setImportModalOpen(false);
          setImportPreview(null);
          setImportError(null);
        }}
        onLoad={() => void onLoadImportPreview()}
        onConfirmImport={onConfirmImport}
        onClearPreview={() => {
          setImportPreview(null);
          setImportError(null);
        }}
        preview={importPreview}
        loading={importLoading}
        error={importError}
      />
    </>
  );
}
