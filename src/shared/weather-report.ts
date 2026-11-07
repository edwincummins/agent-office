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

export function describeWeatherReport(report?: WeatherReport, now = Date.now()): string {
  if (!report) return 'Weather source unavailable from this server.';
  if (report.source === 'simulated') return 'Simulated weather. Select a location to use a forecast.';
  if (report.source === 'pinned') return 'Weather is pinned by the server configuration.';
  if (report.source !== 'forecast') return 'Weather source unavailable.';
  if (report.status === 'pending') return 'Waiting for the selected location’s weather.';
  if (report.status === 'unavailable') return 'Weather unavailable. Retrying; the displayed conditions are a placeholder.';
  if (!('fetchedAt' in report)) return 'Weather receipt unavailable.';
  const age = Math.max(0, Math.floor((now - report.fetchedAt) / 60_000));
  return report.status === 'stale' || age >= 30
    ? `Weather refresh overdue or failed. Keeping the forecast received ${age} minutes ago.`
    : `Forecast received ${age} minutes ago.`;
}
