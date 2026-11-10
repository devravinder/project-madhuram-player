export type DeviceUsage = {
  usedBytes?: number;
  quotaBytes?: number;
  persisted: boolean;
  canPersist: boolean;
};

export async function readDeviceUsage(): Promise<DeviceUsage> {
  const storage = navigator.storage;
  if (!storage) return { persisted: false, canPersist: false };

  const [estimate, persisted] = await Promise.all([
    storage.estimate?.().catch(() => undefined),
    storage.persisted?.().catch(() => false) ?? false,
  ]);
  return {
    usedBytes: estimate?.usage,
    quotaBytes: estimate?.quota,
    persisted: Boolean(persisted),
    canPersist: typeof storage.persist === "function",
  };
}

// Asks the browser not to clear this app's data when space runs low.
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
