import { randomInt } from "node:crypto";

/** Letters and digits that are hard to mix up when read aloud or written down: no 0, O, 1, I or L. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 7;

export const newReferralCode = () => Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Accepts "rh-abc2345", "RH ABC2345" or "abc2345" and returns the stored form, or null if it cannot be a code. */
export function cleanCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^RH(?=.{7}$)/, "");
  return c.length === LENGTH ? c : null;
}

export const showCode = (code: string) => `RH-${code}`;
