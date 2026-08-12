"use server";

import { getCities, getBarangays, getProvinces, getRegions, type PhOption } from "@/lib/ph-address";
import { getCurrentUser } from "@/lib/session";

/**
 * Reference-data reads for the cascading PH address picker. Gated on being
 * signed in — not a specific permission — since this is geography, not a
 * domain record; every screen that needs an address picker already sits
 * behind its own page/action guard.
 */
async function requireSignedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
}

export async function fetchRegions(): Promise<PhOption[]> {
  await requireSignedIn();
  return getRegions();
}

export async function fetchProvinces(regionCode: string): Promise<PhOption[]> {
  await requireSignedIn();
  return regionCode ? getProvinces(regionCode) : [];
}

export async function fetchCities(provinceCode: string): Promise<PhOption[]> {
  await requireSignedIn();
  return provinceCode ? getCities(provinceCode) : [];
}

export async function fetchBarangays(cityCode: string): Promise<PhOption[]> {
  await requireSignedIn();
  return cityCode ? getBarangays(cityCode) : [];
}
