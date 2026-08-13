"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchBarangays, fetchCities, fetchProvinces, fetchRegions } from "@/server/ph-address/actions";
import type { EmployeeFormInput } from "@/lib/validation/employee";
import { ADDRESS_FIELD_KEYS } from "@/lib/validation/ph";

type AddressPrefix = "currentAddress" | "permanentAddress";

type PhAddressPickerProps = {
  prefix: AddressPrefix;
  disabled?: boolean;
  /**
   * When set, every change made here is also written to this other address —
   * "Same as current address" needs the permanent address to stay valid no
   * matter whether the user checks the box before or after filling in the
   * current one, so this keeps them in sync live rather than copying once.
   */
  mirrorTo?: AddressPrefix;
};

/**
 * Four cascading selects (Region → Province → City/Municipality → Barangay)
 * plus a free-text house/unit number and street line. Each level only fetches
 * its own slice of the bundled PSGC dataset through a server action — the
 * ~6 MB dataset never reaches the browser whole.
 */
export function PhAddressPicker({ prefix, disabled, mirrorTo }: PhAddressPickerProps) {
  const form = useFormContext<EmployeeFormInput>();

  const regionCode = useWatch({ control: form.control, name: `${prefix}.regionCode` });
  const provinceCode = useWatch({ control: form.control, name: `${prefix}.provinceCode` });
  const cityCode = useWatch({ control: form.control, name: `${prefix}.cityCode` });

  // Called after every field update below, once the write to `prefix` has
  // already landed in RHF's internal state — `getValues` reads it back
  // synchronously, so the mirrored address is always a faithful copy.
  // Field-by-field rather than one `setValue(mirrorTo, wholeObject)` call:
  // the latter doesn't reliably reach every already-mounted descendant
  // `FormField` in a single call, so a couple of leaves (typically province
  // and city) can silently stay stale.
  function mirror() {
    if (!mirrorTo) return;
    const source = form.getValues(prefix);
    for (const key of ADDRESS_FIELD_KEYS) {
      form.setValue(`${mirrorTo}.${key}`, source[key], { shouldValidate: true, shouldDirty: true });
    }
  }

  const regionsQuery = useQuery({ queryKey: ["ph-address", "regions"], queryFn: () => fetchRegions() });
  const provincesQuery = useQuery({
    queryKey: ["ph-address", "provinces", regionCode],
    queryFn: () => fetchProvinces(regionCode ?? ""),
    enabled: Boolean(regionCode),
  });
  const citiesQuery = useQuery({
    queryKey: ["ph-address", "cities", provinceCode],
    queryFn: () => fetchCities(provinceCode ?? ""),
    enabled: Boolean(provinceCode),
  });
  const barangaysQuery = useQuery({
    queryKey: ["ph-address", "barangays", cityCode],
    queryFn: () => fetchBarangays(cityCode ?? ""),
    enabled: Boolean(cityCode),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name={`${prefix}.regionCode`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Region</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                // Radix's Select can call onValueChange on its own — with the
                // *current* value, or with `""` — while a programmatically-set
                // value's matching SelectItem hasn't rendered yet (e.g. right
                // after "Same as current address" copies a value in before
                // this select's options have finished loading). A real user
                // can never pick an empty option, so both cases are spurious;
                // without this guard they'd misread as "user cleared this
                // field" and wipe out the province/city/barangay reset below.
                if (!value || value === field.value) return;
                const region = regionsQuery.data?.find((option) => option.code === value);
                field.onChange(value);
                form.setValue(`${prefix}.regionName`, region?.name ?? "");
                // Reset everything downstream so a stale province/city/barangay
                // from the previous region can never be submitted.
                form.setValue(`${prefix}.provinceCode`, "");
                form.setValue(`${prefix}.provinceName`, "");
                form.setValue(`${prefix}.cityCode`, "");
                form.setValue(`${prefix}.cityName`, "");
                form.setValue(`${prefix}.barangayCode`, "");
                form.setValue(`${prefix}.barangayName`, "");
                mirror();
              }}
              disabled={disabled || regionsQuery.isPending}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={regionsQuery.isPending ? "Loading…" : "Select region"} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {regionsQuery.data?.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${prefix}.provinceCode`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Province / District</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                if (!value || value === field.value) return;
                const province = provincesQuery.data?.find((option) => option.code === value);
                field.onChange(value);
                form.setValue(`${prefix}.provinceName`, province?.name ?? "");
                form.setValue(`${prefix}.cityCode`, "");
                form.setValue(`${prefix}.cityName`, "");
                form.setValue(`${prefix}.barangayCode`, "");
                form.setValue(`${prefix}.barangayName`, "");
                mirror();
              }}
              disabled={disabled || !regionCode || provincesQuery.isPending}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={!regionCode ? "Select a region first" : provincesQuery.isPending ? "Loading…" : "Select province"}
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {provincesQuery.data?.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${prefix}.cityCode`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>City / Municipality</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                if (!value || value === field.value) return;
                const city = citiesQuery.data?.find((option) => option.code === value);
                field.onChange(value);
                form.setValue(`${prefix}.cityName`, city?.name ?? "");
                form.setValue(`${prefix}.barangayCode`, "");
                form.setValue(`${prefix}.barangayName`, "");
                mirror();
              }}
              disabled={disabled || !provinceCode || citiesQuery.isPending}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={!provinceCode ? "Select a province first" : citiesQuery.isPending ? "Loading…" : "Select city"}
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {citiesQuery.data?.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${prefix}.barangayCode`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Barangay</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                if (!value || value === field.value) return;
                const barangay = barangaysQuery.data?.find((option) => option.code === value);
                field.onChange(value);
                form.setValue(`${prefix}.barangayName`, barangay?.name ?? "");
                mirror();
              }}
              disabled={disabled || !cityCode || barangaysQuery.isPending}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={!cityCode ? "Select a city first" : barangaysQuery.isPending ? "Loading…" : "Select barangay"}
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {barangaysQuery.data?.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${prefix}.addressLine`}
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>House/unit/building number and street</FormLabel>
            <FormControl>
              <Input
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  mirror();
                }}
                disabled={disabled}
                placeholder="123 Rizal St., Sample Subdivision"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
