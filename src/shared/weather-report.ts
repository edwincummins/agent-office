/** Provenance of the conditions being rendered, separate from the sky's clock. */
export type WeatherReport =
  | { source: 'simulated' | 'pinned' }
  | { source: 'forecast'; status: 'pending' | 'unavailable' }
  | { source: 'forecast'; status: 'current' | 'stale'; fetchedAt: number };

/** A failed refresh preserves the last known conditions without calling them current. */
export function missedForecast(report: WeatherReport): WeatherReport {
  return report.source === 'forecast' && 'fetchedAt' in report
    ? { source: 'forecast', status: 'stale', fetchedAt: report.fetchedAt }
    : { source: 'forecast', status: 'unavailable' };
}
