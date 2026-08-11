import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The QNX QSERV-MCSU lockup.
 *
 * Two variants exist because the master artwork is deep blue: `colour` reads on
 * white and light greys, `white` is a monochrome cut for the brand panel and
 * dark surfaces. Both are generated from the master by
 * `scripts/build-brand-assets.mjs` — see docs/DESIGN.md.
 *
 * The intrinsic aspect ratio is 1484:264 (~5.62:1), so callers set a height and
 * the width follows.
 */

const LOGO_ASPECT = 1484 / 264;

type LogoProps = {
  variant?: "colour" | "white";
  /** Rendered height in pixels. Width is derived from the lockup's ratio. */
  height?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({ variant = "colour", height = 40, className, priority = false }: LogoProps) {
  return (
    <Image
      src={variant === "white" ? "/brand/logo-white.png" : "/brand/logo.png"}
      alt="QNX Questronix — QSERV-MCSU"
      width={Math.round(height * LOGO_ASPECT)}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto select-none", className)}
      style={{ height }}
    />
  );
}

const MARK_ASPECT = 208 / 228;

type MarkProps = {
  variant?: "colour" | "white";
  size?: number;
  className?: string;
};

/** The QSERV quadrant mark on its own — for tight spaces and the collapsed nav. */
export function BrandMark({ variant = "colour", size = 32, className }: MarkProps) {
  return (
    <Image
      src={variant === "white" ? "/brand/mark-white.png" : "/brand/mark.png"}
      alt=""
      aria-hidden
      width={Math.round(size * MARK_ASPECT)}
      height={size}
      className={cn("select-none", className)}
      style={{ height: size, width: "auto" }}
    />
  );
}
