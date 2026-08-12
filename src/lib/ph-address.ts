import "server-only";

import { listBarangays, listMuncities, listProvinces, listRegions } from "@jobuntux/psgc";

/**
 * Thin wrapper around the bundled PSGC dataset (`@jobuntux/psgc`, ~6.2 MB of
 * JSON covering every region, province, city/municipality and barangay in
 * the Philippines). The dataset must never ship to the browser whole — the
 * server actions in `src/server/ph-address/actions.ts` call these functions
 * and return only the slice a cascading select actually needs.
 *
 * `listProvinces()`'s results already include NCR's cities/districts as
 * province-level entries (verified against the package's own examples), so
 * no special-casing is needed here: Region → Province → City → Barangay
 * cascades the same way everywhere in the country.
 */

export type PhOption = { code: string; name: string };

function byName(a: PhOption, b: PhOption): number {
  return a.name.localeCompare(b.name);
}

export function getRegions(): PhOption[] {
  return listRegions()
    .map((region) => ({ code: region.regCode, name: region.regionName }))
    .sort(byName);
}

export function getProvinces(regionCode: string): PhOption[] {
  return listProvinces(regionCode)
    .filter((province) => Boolean(province.provCode))
    .map((province) => ({ code: province.provCode as string, name: province.provName }))
    .sort(byName);
}

export function getCities(provinceCode: string): PhOption[] {
  return listMuncities(provinceCode)
    .map((city) => ({ code: city.munCityCode, name: city.munCityName }))
    .sort(byName);
}

export function getBarangays(cityCode: string): PhOption[] {
  return listBarangays(cityCode)
    .map((barangay) => ({ code: barangay.brgyCode, name: barangay.brgyName }))
    .sort(byName);
}
