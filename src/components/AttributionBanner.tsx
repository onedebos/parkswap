import { ATTRIBUTION_READ_MORE_URL, IGUANADEX_HOME_URL } from "@/lib/site-metadata";

export function AttributionBanner() {
  return (
    <div className="bg-[#171717]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-3 text-[13px] leading-snug text-white/55 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0">
          This interface is a lightweight fork of{" "}
          <a
            href={IGUANADEX_HOME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white/90 hover:decoration-white/50"
          >
            IguanaDEX
          </a>{" "}
          on the Tezos X EVM testnet.
        </p>
        <a
          href={ATTRIBUTION_READ_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-white/55 no-underline hover:text-white/80 sm:text-right"
        >
          Read more
        </a>
      </div>
    </div>
  );
}
