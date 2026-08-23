/* Weather: Open-Meteo — free, no key, no attribution requirement. */

const Weather = {
  CODES: {
    0:  ['Clear', '☀️'],  1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
    61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
    66: ['Freezing rain', '🌨️'], 67: ['Freezing rain', '🌨️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'],
    80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
    85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️']
  },
  describe(code) { return Weather.CODES[code] || ['—', '·']; },

  async forCity(city, opts) {
    if (!city || typeof city.lat !== 'number' || typeof city.lon !== 'number') {
      return { data: null, at: null, state: 'never', error: 'no coordinates' };
    }
    const url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + city.lat + '&longitude=' + city.lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&current=temperature_2m,weather_code' +
      '&timezone=auto&forecast_days=10';
    return Net.get('wx.' + city.id, url, Object.assign({
      pick: function (j) {
        return {
          tz: j.timezone,
          current: j.current || null,
          days: (j.daily && j.daily.time || []).map(function (d, i) {
            return {
              date: d,
              code: j.daily.weather_code[i],
              max: j.daily.temperature_2m_max[i],
              min: j.daily.temperature_2m_min[i],
              rain: j.daily.precipitation_probability_max[i]
            };
          })
        };
      }
    }, opts || {}));
  },

  /* Weather-informed packing (spec §12): a display-time join between the
     packing checklist and the live forecast — no new stored data. */
  RAIN_THRESHOLD: 55,
  rainyDaysInWindow(wx, startISO, endISO) {
    if (!wx || !wx.days) return [];
    return wx.days.filter(function (d) {
      return d.rain >= Weather.RAIN_THRESHOLD &&
        (!startISO || !endISO || U.inRange(d.date, startISO, endISO));
    });
  },
  coldDaysInWindow(wx, startISO, endISO) {
    if (!wx || !wx.days) return [];
    return wx.days.filter(function (d) {
      return d.min <= 5 && (!startISO || !endISO || U.inRange(d.date, startISO, endISO));
    });
  }
};
