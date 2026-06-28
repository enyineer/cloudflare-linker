/**
 * Generates src/worker/datacenter-asns.generated.ts from an upstream, maintained
 * list of hosting/cloud/colo ASNs, so the datacenter-traffic heuristic isn't a
 * hand-curated regex. Run with: bun run gen:datacenter-asns
 *
 * Source: brianhama/bad-asn-list (MIT) - https://github.com/brianhama/bad-asn-list
 * The generated file is committed; the build never fetches at build time.
 */
const SOURCE_URL = "https://raw.githubusercontent.com/brianhama/bad-asn-list/master/bad-asn-list.csv";
const OUT = new URL("../src/worker/datacenter-asns.generated.ts", import.meta.url);

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Failed to fetch ASN list: ${res.status} ${res.statusText}`);
const csv = await res.text();

const asns = new Set<number>();
for (const line of csv.split("\n")) {
  const first = line.split(",")[0]?.trim();
  if (!first || first.toLowerCase() === "asn") continue; // skip header / blanks
  const n = Number.parseInt(first, 10);
  if (Number.isInteger(n) && n > 0) asns.add(n);
}
if (asns.size < 100) throw new Error(`Suspiciously few ASNs parsed (${asns.size}); aborting.`);

const sorted = [...asns].sort((a, b) => a - b);
const rows: string[] = [];
for (let i = 0; i < sorted.length; i += 12) rows.push("  " + sorted.slice(i, i + 12).join(", ") + ",");

const content = `// AUTO-GENERATED - do not edit by hand. Run: bun run gen:datacenter-asns
// Hosting/cloud/colo ASNs, used to optionally flag datacenter traffic as bots.
// Source: brianhama/bad-asn-list (MIT) - https://github.com/brianhama/bad-asn-list
// ${sorted.length} ASNs.
export const DATACENTER_ASNS: ReadonlySet<number> = new Set([
${rows.join("\n")}
]);
`;

await Bun.write(OUT, content);
console.log(`Wrote ${sorted.length} ASNs to ${OUT.pathname}`);
