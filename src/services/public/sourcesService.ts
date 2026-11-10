import db from "@/services/db";
import { addressKey, parseAddress } from "./publicLibrary";

export class InvalidAddressError extends Error {
  constructor() {
    super("Enter an address like owner/repo, or paste the GitHub link.");
  }
}

// GitHub names ignore case, so one library is stored under one spelling.
export function normalizeAddress(input: string): string {
  const parsed = parseAddress(input);
  if (!parsed) throw new InvalidAddressError();
  return addressKey(parsed).toLowerCase();
}

export const listSources = () =>
  db.followedSources.filter((source) => !source.removed).toArray();

export async function followSource(input: string) {
  const address = normalizeAddress(input);
  await db.followedSources.put({ address, updatedAt: new Date() });
  return address;
}

// Kept as a marked record, so the unfollow reaches the other devices too.
export async function unfollowSource(address: string) {
  await db.followedSources.put({ address, updatedAt: new Date(), removed: true });
}