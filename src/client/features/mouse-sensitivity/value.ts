export const DEFAULT_SENSITIVITY = .5;
export const SENSITIVITY_KEY = 'office.mouseSensitivity';
let current: number | undefined;

export function normalizeSensitivity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(2, Math.max(.1, value)) : DEFAULT_SENSITIVITY;
}

export function mouseSensitivity(): number {
  if (current === undefined) {
    try {
      const saved = localStorage.getItem(SENSITIVITY_KEY);
      current = normalizeSensitivity(saved?.trim() ? Number(saved) : undefined);
    } catch { current = DEFAULT_SENSITIVITY; }
  }
  return current;
}

export function setMouseSensitivity(value: number): number {
  current = normalizeSensitivity(value);
  try { localStorage.setItem(SENSITIVITY_KEY, String(current)); } catch { /* Still works for this visit. */ }
  return current;
}
