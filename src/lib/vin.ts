import { isValidVin } from "@/lib/intake";

/** Looks up year, make and model for a VIN in the public NHTSA database. Returns null if it cannot be decoded. */
export async function lookupVin(vin: string): Promise<{ year: string; make: string; model: string } | null> {
  if (!isValidVin(vin)) return null;
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin.trim().toUpperCase())}?format=json`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const r = (await res.json())?.Results?.[0];
    if (!r?.Make) return null;
    return { year: String(r.ModelYear ?? ""), make: String(r.Make ?? ""), model: String(r.Model ?? "") };
  } catch {
    return null;
  }
}
