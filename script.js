const state = {
  lat: null,
  lon: null,
  source: null,
  loading: false,
  error: null,
  weatherLoading: false,
  weatherError: null,
  lastWeather: null,
};

const fallback = { lat: 59.3293, lon: 18.0686 };
const timeZone = "Europe/Stockholm";

const useLocationButton = document.querySelector("#use-location");
const debugLine = document.querySelector("#location-debug");
const buttons = document.querySelectorAll("button");
const tempNowEl = document.querySelector("#temp-now");
const tempYesterdayEl = document.querySelector("#temp-yesterday");
const tempDeltaEl = document.querySelector("#temp-delta");
const windNowEl = document.querySelector("#wind-now");
const rainNowEl = document.querySelector("#rain-now");
const summaryEl = document.querySelector("#summary");
const sayTextEl = document.querySelector("#say-text");
const askTextEl = document.querySelector("#ask-text");
const twistTextEl = document.querySelector("#twist-text");
const saySubEl = document.querySelector("#say-sub");
const askSubEl = document.querySelector("#ask-sub");
const twistSubEl = document.querySelector("#twist-sub");
const regenButton = document.querySelector("#regen-icebreakers");
const copyShareButton = document.querySelector("#copy-share");
const toastEl = document.querySelector("#toast");

const formatNumber = (value) => value.toFixed(4);
const formatValue = (value, unit, decimals = 0) =>
  Number.isFinite(value) ? `${value.toFixed(decimals)}${unit}` : "--";

const renderDebugLine = () => {
  if (!debugLine) return;

  debugLine.classList.toggle("error", Boolean(state.error));

  if (state.loading) {
    debugLine.textContent = "Locating...";
    return;
  }

  if (state.lat === null || state.lon === null) {
    debugLine.textContent = "Using: lat --, lon -- (not set)";
    return;
  }

  const sourceLabel = state.source === "GPS" ? "GPS" : "fallback";
  const errorSuffix = state.error ? ` — ${state.error}` : "";

  debugLine.textContent = `Using: lat ${formatNumber(state.lat)}, lon ${formatNumber(state.lon)} (${sourceLabel})${errorSuffix}`;
};

const setWeatherLoading = (isLoading) => {
  state.weatherLoading = isLoading;

  if (isLoading) {
    if (tempNowEl) tempNowEl.textContent = "Loading...";
    if (tempYesterdayEl) tempYesterdayEl.textContent = "Loading...";
    if (tempDeltaEl) tempDeltaEl.textContent = "Loading...";
    if (windNowEl) windNowEl.textContent = "Loading...";
    if (rainNowEl) rainNowEl.textContent = "Loading...";
    if (summaryEl) summaryEl.textContent = "Loading...";
  }
};

const setWeatherError = (message) => {
  state.weatherError = message;
  if (tempNowEl) tempNowEl.textContent = "--";
  if (tempYesterdayEl) tempYesterdayEl.textContent = "--";
  if (tempDeltaEl) tempDeltaEl.textContent = "--";
  if (windNowEl) windNowEl.textContent = "--";
  if (rainNowEl) rainNowEl.textContent = "--";
  if (summaryEl) summaryEl.textContent = "Weather unavailable";
};

const getZonedParts = (date) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
  };
};

const buildDateStamp = ({ year, month, day }) => `${year}-${month}-${day}`;
const buildHourStamp = ({ year, month, day, hour }) =>
  `${year}-${month}-${day}T${hour}:00`;

const findHourIndex = (times, stamp) =>
  times.findIndex((time) => time.startsWith(stamp));

const createSummary = ({ temp, rain, wind }) => {
  const tempWord = temp <= 0 ? "Icy" : temp < 8 ? "Chilly" : temp < 16 ? "Mild" : temp < 24 ? "Warm" : "Toasty";
  const rainWord = rain >= 60 ? "rainy" : rain <= 20 ? "dry" : "a bit damp";
  const windWord = wind >= 25 ? "breezy" : wind >= 12 ? "light breeze" : "calm air";

  return `${tempWord}, ${rainWord}, ${windWord}.`;
};

const buildForecastUrl = (lat, lon) => {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,windspeed_10m"
  );
  url.searchParams.set("timezone", timeZone);
  return url.toString();
};

const buildArchiveUrl = (lat, lon, dateStamp) => {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("start_date", dateStamp);
  url.searchParams.set("end_date", dateStamp);
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,windspeed_10m"
  );
  url.searchParams.set("timezone", timeZone);
  return url.toString();
};

const updateReceipt = ({ tempNow, tempYesterday, windNow, rainNow, units }) => {
  if (!tempNowEl) return;

  const tempUnit = units.temperature_2m ?? "°C";
  const windUnit = units.windspeed_10m ?? "km/h";
  const rainUnit = units.precipitation_probability ?? "%";
  const delta = tempNow - tempYesterday;
  const deltaSign = delta > 0 ? "+" : "";

  tempNowEl.textContent = formatValue(tempNow, tempUnit, 1);
  tempYesterdayEl.textContent = formatValue(tempYesterday, tempUnit, 1);
  tempDeltaEl.textContent = Number.isFinite(delta)
    ? `${deltaSign}${delta.toFixed(1)}${tempUnit}`
    : "--";
  windNowEl.textContent = formatValue(windNow, ` ${windUnit}`, 1);
  rainNowEl.textContent = formatValue(rainNow, rainUnit, 0);
  summaryEl.textContent = createSummary({ temp: tempNow, rain: rainNow, wind: windNow });
  state.lastWeather = {
    tempNow,
    tempYesterday,
    tempDelta: delta,
    windNow,
    rainProbNow: rainNow,
  };
  updateIcebreakers(state.lastWeather);
};

const setIcebreakerText = (element, text) => {
  if (!element) return;
  element.textContent = text;
};

const pick = (options) => options[Math.floor(Math.random() * options.length)];

const updateIcebreakers = () => {
  if (!sayTextEl || !askTextEl || !twistTextEl) return;

  const sayLines = [
    "Weather update: my hair has entered a new tax bracket.",
    "It’s so dramatic outside even my socks are sighing.",
    "I walked into the air and it immediately filed a complaint.",
    "The sky is doing improv and I didn’t buy a ticket.",
    "I dressed for four seasons and still picked the wrong one.",
    "It’s giving ‘freezer aisle, but make it windy.’",
    "The breeze asked for my lunch money.",
    "My scarf is now my personal assistant.",
  ];

  const askLines = [
    "Do you think the weather has a calendar or just vibes?",
    "Is it too late to send a polite email to the sky?",
    "If we made a support group for people who checked the forecast, would you join?",
    "Are we calling this a ‘coat moment’ or a ‘blanket era’?",
    "Should we negotiate with the clouds or just start a podcast about them?",
    "Is the wind charging rent or just freelancing?",
  ];

  const twistLines = [
    "Twist: the forecast was written by a cat on a keyboard.",
    "Bonus: my umbrella now needs therapy.",
    "PS: the sun is ghosting us again.",
    "Plot twist: the wind is just practicing for Eurovision.",
    "PS: fika still happens, the weather can’t stop us.",
    "Bonus: my beanie has unionized.",
  ];

  const sayLine = pick(sayLines);
  const askLine = pick(askLines);
  const twistTag = pick(twistLines);

  setIcebreakerText(sayTextEl, sayLine);
  setIcebreakerText(askTextEl, askLine);
  setIcebreakerText(twistTextEl, twistTag);

  setIcebreakerText(saySubEl, "");
  setIcebreakerText(askSubEl, "");
  setIcebreakerText(twistSubEl, "");
};

const fetchWeather = async () => {
  if (state.lat === null || state.lon === null) return;

  state.weatherError = null;
  setWeatherLoading(true);

  const nowParts = getZonedParts(new Date());
  const yesterdayParts = getZonedParts(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const nowStamp = buildHourStamp(nowParts);
  const yesterdayStamp = buildHourStamp(yesterdayParts);
  const yesterdayDate = buildDateStamp(yesterdayParts);

  try {
    const [forecastResponse, archiveResponse] = await Promise.all([
      fetch(buildForecastUrl(state.lat, state.lon)),
      fetch(buildArchiveUrl(state.lat, state.lon, yesterdayDate)),
    ]);

    if (!forecastResponse.ok || !archiveResponse.ok) {
      throw new Error("weather request failed");
    }

    const forecast = await forecastResponse.json();
    const archive = await archiveResponse.json();

    const forecastIndex = findHourIndex(forecast.hourly.time, nowStamp);
    const archiveIndex = findHourIndex(archive.hourly.time, yesterdayStamp);

    if (forecastIndex === -1 || archiveIndex === -1) {
      throw new Error("hour not found");
    }

    updateReceipt({
      tempNow: forecast.hourly.temperature_2m[forecastIndex],
      tempYesterday: archive.hourly.temperature_2m[archiveIndex],
      windNow: forecast.hourly.windspeed_10m[forecastIndex],
      rainNow: forecast.hourly.precipitation_probability[forecastIndex],
      units: forecast.hourly_units ?? {},
    });
  } catch (error) {
    setWeatherError(error?.message ?? "weather unavailable");
  } finally {
    setWeatherLoading(false);
  }
};

const setLoading = (isLoading) => {
  state.loading = isLoading;

  if (!useLocationButton) return;
  useLocationButton.disabled = isLoading;
  useLocationButton.classList.toggle("loading", isLoading);
  useLocationButton.textContent = isLoading ? "Locating..." : "Use my location";
};

const setLocation = ({ lat, lon, source, error = null }) => {
  state.lat = lat;
  state.lon = lon;
  state.source = source;
  state.error = error;
  renderDebugLine();
  fetchWeather();
};

const useFallback = (reason) => {
  setLocation({
    lat: fallback.lat,
    lon: fallback.lon,
    source: "fallback",
    error: reason,
  });
};

const requestLocation = () => {
  if (!navigator.geolocation) {
    setLoading(false);
    useFallback("geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLoading(false);
      setLocation({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: "GPS",
      });
    },
    (error) => {
      setLoading(false);
      const reason = error?.message ? error.message.toLowerCase() : "location denied";
      useFallback(reason);
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    }
  );
};

const handleUseLocation = () => {
  if (!useLocationButton || state.loading) return;
  state.error = null;
  setLoading(true);
  renderDebugLine();
  requestLocation();
};

if (useLocationButton) {
  useLocationButton.addEventListener("click", handleUseLocation);
}

const showToast = () => {
  if (!toastEl) return;
  toastEl.classList.add("show");
  window.clearTimeout(showToast.hideTimeout);
  showToast.hideTimeout = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1800);
};

const getShareUrl = () => {
  const url = new URL(window.location.href);
  if (state.lat !== null && state.lon !== null) {
    url.searchParams.set("lat", state.lat.toFixed(4));
    url.searchParams.set("lon", state.lon.toFixed(4));
  }
  return url.toString();
};

const handleCopyShare = async () => {
  const shareUrl = getShareUrl();
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast();
  } catch (error) {
    setWeatherError("copy failed");
  }
};

if (copyShareButton) {
  copyShareButton.addEventListener("click", handleCopyShare);
}

if (regenButton) {
  regenButton.addEventListener("click", () => {
    if (!state.lastWeather) return;
    updateIcebreakers(state.lastWeather);
  });
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.add("pressed");
    window.setTimeout(() => button.classList.remove("pressed"), 150);
  });
});

renderDebugLine();

const getUrlLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const lat = Number.parseFloat(params.get("lat"));
  const lon = Number.parseFloat(params.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
};

const urlLocation = getUrlLocation();
if (urlLocation) {
  setLocation({ lat: urlLocation.lat, lon: urlLocation.lon, source: "link" });
}
