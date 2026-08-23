/* Weather: Open-Meteo — free, no key. */
import { get } from './net.js';
import { inRange } from '../lib/util.js';

const CODES = {
  0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌨️'], 67: ['Freezing rain', '🌨️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
};
export const describe = (code) => CODES[code] || ['—', '·'];

export const RAIN_THRESHOLD = 55;
export const COLD_THRESHOLD = 5;

export async function forCity(city, opts = {}) {
  if (!city || typeof city.lat !== 'number' || typeof city.lon !== 'number') {
    return { data: null, at: null, state: 'never', error: 'no coordinates' };
  }
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${city.lat}&longitude=${city.lon}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&current=temperature_2m,weather_code&timezone=auto&forecast_days=10';

  return get(`wx.${city.id}`, url, {
    ...opts,
    pick: (j) => ({
      tz: j.timezone,
      current: j.current || null,
      days: (j.daily?.time || []).map((d, i) => ({
        date: d,
        code: j.daily.weather_code[i],
        max: j.daily.temperature_2m_max[i],
        min: j.daily.temperature_2m_min[i],
        rain: j.daily.precipitation_probability_max[i],
      })),
    }),
  });
}

/* Weather-informed packing (spec §12): a display-time join between packing
   items and the live forecast. Nothing new is stored. */
const inWindow = (d, start, end) => !start || !end || inRange(d.date, start, end);
export const rainyDays = (wx, start, end) =>
  (wx?.days || []).filter((d) => d.rain >= RAIN_THRESHOLD && inWindow(d, start, end));
export const coldDays = (wx, start, end) =>
  (wx?.days || []).filter((d) => d.min <= COLD_THRESHOLD && inWindow(d, start, end));
