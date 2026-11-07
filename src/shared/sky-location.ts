export type SkyLocation = { kind: 'city'; city: string } | { kind: 'device'; lat: number; lon: number; utcOffset: number; deviceId: string };

/** Unknown means invalid; null explicitly restores the server's configured location. */
export function parseSkyLocation(value: unknown): SkyLocation | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (v.kind === 'city' && typeof v.city === 'string' && v.city.trim().length > 0 && v.city.trim().length <= 120)
    return { kind: 'city', city: v.city.trim() };
  if (v.kind === 'device' && typeof v.lat === 'number' && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90
    && typeof v.lon === 'number' && Number.isFinite(v.lon) && Math.abs(v.lon) <= 180
    && typeof v.utcOffset === 'number' && Number.isInteger(v.utcOffset) && Math.abs(v.utcOffset) <= 840
    && typeof v.deviceId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(v.deviceId))
    return { kind: 'device', lat: Math.round(v.lat * 100) / 100, lon: Math.round(v.lon * 100) / 100, utcOffset: v.utcOffset, deviceId: v.deviceId };
  return undefined;
}
