"use client";

import { JsonRpcProvider, isAddress } from "ethers";
import {
  DEFAULT_FEE_TIER,
  FEATURED_TOKENS,
  configuredNetworkMismatchMessage,
  TXPARK_CHAIN_ID,
  TXPARK_RPC_URL,
  importTokenFromAddress,
  resolvePoolAddress,
  type TokenConfig,
} from "@/lib/txpark";

const publicProvider = new JsonRpcProvider(TXPARK_RPC_URL, TXPARK_CHAIN_ID);

export type ImportedTokenPreview = {
  token: TokenConfig;
  alreadyImported: boolean;
  /** v3 pool vs USDC at the app fee (0.25%). */
  hasUsdcPoolAtAppFee: boolean;
};

function getReadableErrorMessage(error: unknown) {
  if (!error) return "Something went wrong. Please try again.";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message) : "";
  if (code === "4001" || code === "ACTION_REJECTED" || /user denied|user rejected|rejected/i.test(message)) {
    return "Transaction cancelled in wallet.";
  }
  if (/wallet not available/i.test(message)) {
    return "No wallet detected. Open the app in MetaMask or another injected wallet.";
  }
  if (/network switch failed/i.test(message)) {
    return configuredNetworkMismatchMessage();
  }
  if (/call exception|execution reverted|missing revert data/i.test(message)) {
    return "Could not read token metadata.";
  }
  return message || "Something went wrong. Please try again.";
}

export function ImportTokenModal({
  isOpen,
  addressInput,
  onAddressInputChange,
  onClose,
  onLoad,
  onConfirmImport,
  onClearPreview,
  preview,
  loading,
  error,
}: {
  isOpen: boolean;
  addressInput: string;
  onAddressInputChange: (value: string) => void;
  onClose: () => void;
  onLoad: () => void;
  onConfirmImport: () => void;
  onClearPreview: () => void;
  preview: ImportedTokenPreview | null;
  loading: boolean;
  error: string | null;
}) {
  if (!isOpen) return null;

  const addressValid = isAddress(addressInput.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-[560px] rounded-[28px] border border-white/10 bg-[#171717] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Import Token</h2>
            <p className="mt-2 text-sm text-white/50">
              Paste an ERC-20 address to load token details from the network.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm text-white/55 hover:bg-white/6 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6">
          <label className="flex flex-col gap-2 text-sm text-white/70">
            <span>Token address</span>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={addressInput}
                onChange={(event) => onAddressInputChange(event.target.value)}
                placeholder="0x..."
                className="rounded-2xl border border-white/10 bg-[#222222] px-4 py-3 text-white outline-none placeholder:text-white/25"
              />
              <button
                type="button"
                onClick={onLoad}
                disabled={!addressValid || loading}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Loading..." : "Load token"}
              </button>
            </div>
          </label>

          {!addressValid && addressInput.trim() ? <p className="mt-3 text-sm text-red-300">Invalid address</p> : null}
          {loading ? <p className="mt-3 text-sm text-white/55">Loading token metadata...</p> : null}
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        </div>

        {preview ? (
          <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
            <p className="text-sm font-medium text-white/85">Token found</p>

            <div className="mt-4 grid gap-2 text-sm text-white/70">
              <p>
                <span className="text-white/40">Name:</span> {preview.token.name}
              </p>
              <p>
                <span className="text-white/40">Symbol:</span> {preview.token.symbol}
              </p>
              <p>
                <span className="text-white/40">Decimals:</span> {preview.token.decimals}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/40">Address:</span>
                <code className="rounded bg-white/5 px-2 py-1 text-xs text-white/85">{preview.token.address}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(preview.token.address).catch(() => undefined)}
                  className="rounded-full px-2 py-1 text-xs text-white/60 hover:bg-white/6 hover:text-white"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              Anyone can create a token. Verify the address before importing.
            </div>

            {preview.alreadyImported ? (
              <p className="mt-3 text-sm text-emerald-300">Token already in your list</p>
            ) : (
              <p className="mt-3 text-sm text-emerald-300">Token ready to import</p>
            )}

            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">USDC pool (0.25% fee)</p>
              <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/50">
                <span>Pool exists</span>
                <span>{preview.hasUsdcPoolAtAppFee ? "Yes" : "No"}</span>
              </div>
              {!preview.hasUsdcPoolAtAppFee ? (
                <p className="mt-2 text-[11px] text-white/40">
                  No pool found for this token against USDC at 0.25% yet. You can create one from the Liquidity page.
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClearPreview}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white/75 hover:bg-white/5 hover:text-white"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onConfirmImport}
                disabled={preview.alreadyImported}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {preview.alreadyImported ? "Already imported" : "Import Token"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function loadImportTokenPreview(
  address: string,
  importedAddresses: Set<string>,
): Promise<{ preview: ImportedTokenPreview } | { error: string }> {
  if (!isAddress(address.trim())) {
    return { error: "Invalid address" };
  }
  try {
    const token = await importTokenFromAddress(publicProvider, address.trim());
    const poolAddr = await resolvePoolAddress(
      publicProvider,
      token.address,
      FEATURED_TOKENS.usdc.address,
      DEFAULT_FEE_TIER,
    ).catch(() => null);
    const preview: ImportedTokenPreview = {
      token,
      alreadyImported: importedAddresses.has(token.address.toLowerCase()),
      hasUsdcPoolAtAppFee: Boolean(poolAddr),
    };
    return { preview };
  } catch (error) {
    return { error: getReadableErrorMessage(error) };
  }
}
