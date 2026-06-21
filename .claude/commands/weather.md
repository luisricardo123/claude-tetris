Fetch and display current local weather conditions.

## Steps

1. **Determine location**
   - If the user passed arguments (`$ARGUMENTS`), use that string as the location query (e.g. `Madrid`, `Mexico City`, `48221`).
   - Otherwise, call `https://ipapi.co/json/` with WebFetch to auto-detect the city and country from the user's public IP. Extract `city` and `country_name`.

2. **Fetch weather data**
   - Call `https://wttr.in/{location}?format=j2&lang=es` with WebFetch (replace `{location}` with the resolved location, URL-encoding spaces as `+`).
   - This returns a JSON object. The key fields are:
     - `current_condition[0]`: current weather snapshot
       - `temp_C` / `FeelsLikeC` — temperature and feels-like in °C
       - `weatherDesc[0].value` — short description (e.g. "Partly cloudy")
       - `humidity` — relative humidity %
       - `windspeedKmph` / `winddir16Point` — wind speed and direction
       - `precipMM` — precipitation in mm
       - `uvIndex` — UV index
     - `weather[]`: array of daily forecasts (index 0 = today, 1 = tomorrow, 2 = day after)
       - `date`, `maxtempC`, `mintempC`, `hourly[4].weatherDesc[0].value` (midday description)

3. **Display output**
   Output a clean, readable summary like this (adapt units and locale as needed):

```
📍 Ciudad, País  —  <fecha y hora local>

🌡  Temperatura:  22 °C  (sensación 20 °C)
☁️  Condición:    Parcialmente nublado
💧  Humedad:      65 %
💨  Viento:       18 km/h SO
🌧  Precipitación: 0.0 mm
☀️  Índice UV:    4

─── Pronóstico 3 días ──────────────────
  Hoy          ↑28 °C  ↓18 °C  Soleado
  Mañana       ↑25 °C  ↓17 °C  Lluvia ligera
  Pasado mañana ↑23 °C  ↓16 °C  Nublado
```

If the API returns an error or the location is not found, tell the user and suggest they pass a location explicitly: `/weather Ciudad`.
