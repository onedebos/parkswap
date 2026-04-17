import { NextResponse } from "next/server";
import { APP_BUNDLED_ICON_IDS } from "@/lib/cryptoicons";

const TREE_URL =
  "https://api.github.com/repos/Cryptofonts/cryptoicons/git/trees/master?recursive=1";

type TreeEntry = { path?: string; type?: string };

export async function GET() {
  try {
    const res = await fetch(TREE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "parkswap-dex-ui",
      },
      next: { revalidate: 86_400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    const tree = data.tree ?? [];
    const prefix = "SVG/";
    const suffix = ".svg";

    const icons: string[] = [];
    for (const entry of tree) {
      if (entry.type !== "blob" || !entry.path) continue;
      if (!entry.path.startsWith(prefix) || !entry.path.endsWith(suffix)) continue;
      const base = entry.path.slice(prefix.length, -suffix.length);
      if (base) icons.push(base);
    }

    const merged = new Set<string>(icons);
    for (const id of APP_BUNDLED_ICON_IDS) {
      merged.add(id);
    }
    const iconList = [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    return NextResponse.json(
      { icons: iconList, truncated: Boolean(data.truncated) },
      {
        headers: {
          // Short browser max-age so new bundled icons (merged server-side) are not stuck behind a day-long stale list.
          "Cache-Control": "public, max-age=120, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load icon index" }, { status: 502 });
  }
}
