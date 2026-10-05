// Country metadata: codes, capitals (for kernel distances) and tile-grid positions.
// eu: Eurostat geo code, iso3: ISO-3166 alpha-3, ea: euro-area member (EA21, 2026).

export const EU = [
  // eu, iso3, name, lat, lon, col, row, ea
  ['SE', 'SWE', 'Sweden', 59.33, 18.07, 5, 0, 0],
  ['FI', 'FIN', 'Finland', 60.17, 24.94, 6, 0, 1],
  ['IE', 'IRL', 'Ireland', 53.35, -6.26, 1, 1, 1],
  ['DK', 'DNK', 'Denmark', 55.68, 12.57, 4, 1, 0],
  ['EE', 'EST', 'Estonia', 59.44, 24.75, 6, 1, 1],
  ['NL', 'NLD', 'Netherlands', 52.37, 4.9, 3, 2, 1],
  ['DE', 'DEU', 'Germany', 52.52, 13.4, 4, 2, 1],
  ['PL', 'POL', 'Poland', 52.23, 21.01, 5, 2, 0],
  ['LV', 'LVA', 'Latvia', 56.95, 24.11, 6, 2, 1],
  ['BE', 'BEL', 'Belgium', 50.85, 4.35, 2, 3, 1],
  ['LU', 'LUX', 'Luxembourg', 49.61, 6.13, 3, 3, 1],
  ['CZ', 'CZE', 'Czechia', 50.08, 14.44, 4, 3, 0],
  ['SK', 'SVK', 'Slovakia', 48.15, 17.11, 5, 3, 1],
  ['LT', 'LTU', 'Lithuania', 54.69, 25.28, 6, 3, 1],
  ['FR', 'FRA', 'France', 48.86, 2.35, 2, 4, 1],
  ['AT', 'AUT', 'Austria', 48.21, 16.37, 4, 4, 1],
  ['HU', 'HUN', 'Hungary', 47.5, 19.04, 5, 4, 0],
  ['RO', 'ROU', 'Romania', 44.43, 26.1, 6, 4, 0],
  ['PT', 'PRT', 'Portugal', 38.72, -9.14, 0, 5, 1],
  ['ES', 'ESP', 'Spain', 40.42, -3.7, 1, 5, 1],
  ['IT', 'ITA', 'Italy', 41.9, 12.5, 3, 5, 1],
  ['SI', 'SVN', 'Slovenia', 46.06, 14.51, 4, 5, 1],
  ['HR', 'HRV', 'Croatia', 45.81, 15.98, 5, 5, 1],
  ['BG', 'BGR', 'Bulgaria', 42.7, 23.32, 6, 5, 1],
  ['MT', 'MLT', 'Malta', 35.9, 14.51, 3, 6, 1],
  ['EL', 'GRC', 'Greece', 37.98, 23.73, 5, 6, 1],
  ['CY', 'CYP', 'Cyprus', 35.19, 33.38, 7, 6, 1],
].map(([eu, iso3, name, lat, lon, col, row, ea]) => ({ eu, iso3, name, lat, lon, col, row, ea: !!ea }));

// Global panel: G20 economies plus large regional anchors.
export const GLOBAL = [
  ['USA', 'United States', 38.9, -77.04, 'USD'],
  ['CAN', 'Canada', 45.42, -75.7, 'CAD'],
  ['MEX', 'Mexico', 19.43, -99.13, 'MXN'],
  ['BRA', 'Brazil', -15.79, -47.88, 'BRL'],
  ['ARG', 'Argentina', -34.6, -58.38, 'ARS'],
  ['GBR', 'United Kingdom', 51.51, -0.13, 'GBP'],
  ['CHE', 'Switzerland', 46.95, 7.45, 'CHF'],
  ['NOR', 'Norway', 59.91, 10.75, 'NOK'],
  ['DEU', 'Germany', 52.52, 13.4, 'EUR'],
  ['FRA', 'France', 48.86, 2.35, 'EUR'],
  ['ITA', 'Italy', 41.9, 12.5, 'EUR'],
  ['ESP', 'Spain', 40.42, -3.7, 'EUR'],
  ['NLD', 'Netherlands', 52.37, 4.9, 'EUR'],
  ['POL', 'Poland', 52.23, 21.01, 'PLN'],
  ['TUR', 'Türkiye', 39.93, 32.86, 'TRY'],
  ['RUS', 'Russia', 55.76, 37.62, 'RUB'],
  ['SAU', 'Saudi Arabia', 24.71, 46.68, 'SAR'],
  ['ARE', 'United Arab Emirates', 24.45, 54.38, 'AED'],
  ['EGY', 'Egypt', 30.04, 31.24, 'EGP'],
  ['NGA', 'Nigeria', 9.08, 7.4, 'NGN'],
  ['KEN', 'Kenya', -1.29, 36.82, 'KES'],
  ['ZAF', 'South Africa', -25.75, 28.19, 'ZAR'],
  ['IND', 'India', 28.61, 77.21, 'INR'],
  ['CHN', 'China', 39.9, 116.4, 'CNY'],
  ['JPN', 'Japan', 35.68, 139.69, 'JPY'],
  ['KOR', 'Korea', 37.57, 126.98, 'KRW'],
  ['IDN', 'Indonesia', -6.21, 106.85, 'IDR'],
  ['SGP', 'Singapore', 1.35, 103.82, 'SGD'],
  ['AUS', 'Australia', -35.28, 149.13, 'AUD'],
].map(([iso3, name, lat, lon, ccy]) => ({ iso3, name, lat, lon, ccy }));

export const EU_BY_CODE = Object.fromEntries(EU.map(c => [c.eu, c]));

// Great-circle distance in km between two {lat, lon} points.
export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
