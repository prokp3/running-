const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const formatWholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const themeButton = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const filterButtons = document.querySelectorAll("[data-filter]");

let dashboardData = null;
let currentFilter = "recent";
const routeMaps = new Map();

function preferredTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  themeIcon.textContent = theme === "dark" ? "Light" : "Dark";
  themeButton.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function isRunType(type) {
  return type && type.toLowerCase().includes("run");
}

function distanceKm(activity) {
  return Number(activity.distance_km || 0);
}

function movingHours(activity) {
  return Number(activity.moving_hours || 0);
}

function paceMinutesPerKm(activity) {
  const distance = distanceKm(activity);
  const hours = movingHours(activity);
  if (!distance || !hours) {
    return null;
  }
  return (hours * 60) / distance;
}

function formatPace(minutes) {
  if (!Number.isFinite(minutes)) {
    return "-";
  }
  const wholeMinutes = Math.floor(minutes);
  const seconds = Math.round((minutes - wholeMinutes) * 60);
  return `${wholeMinutes}:${String(seconds).padStart(2, "0")} / km`;
}

function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countryForActivity(activity) {
  const country = activity.location_country || activity.country || activity.raw?.location_country || inferCountryFromRoute(activity);
  return country === "Unknown" ? null : country;
}

function inferCountryFromRoute(activity) {
  const coordinates = activity.geometry?.coordinates || [];
  if (!coordinates.length) {
    return "Unknown";
  }
  const [longitude, latitude] = coordinates[Math.floor(coordinates.length / 2)];
  if (latitude >= 6 && latitude <= 37 && longitude >= 68 && longitude <= 98) {
    return "India";
  }
  return "Unknown";
}

function activitySubtitle(activity) {
  const country = countryForActivity(activity);
  return [formatDate(activity.start), country].filter(Boolean).join(" - ");
}

function detailRows(activity) {
  const raw = activity.raw || activity.details || {};
  const base = {
    Name: activity.name,
    Type: activity.type,
    Date: activity.start,
    Distance: `${formatNumber.format(distanceKm(activity))} km`,
    "Moving time": `${formatNumber.format(movingHours(activity))} h`,
    Pace: formatPace(paceMinutesPerKm(activity)),
    Elevation: `${formatNumber.format(Number(activity.elevation_m || raw.total_elevation_gain || 0))} m`,
    Country: countryForActivity(activity),
  };

  return Object.entries({ ...base, ...raw })
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && typeof value !== "object")
    .map(([key, value]) => [humanizeKey(key), String(value)]);
}

function humanizeKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function showStatus(title, message) {
  const status = document.getElementById("status");
  if (!status) {
    return;
  }
  status.hidden = false;
  status.innerHTML = `
    <div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function hideStatus() {
  const status = document.getElementById("status");
  if (status) {
    status.hidden = true;
  }
}

function activityFromFeature(feature) {
  return {
    ...(feature.properties || {}),
    geometry: feature.geometry,
  };
}

function mergeActivities(summaryActivities, routeActivities) {
  const activitiesById = new Map();
  for (const activity of [...summaryActivities, ...routeActivities]) {
    const key = String(activity.id || `${activity.name}-${activity.start}`);
    activitiesById.set(key, { ...(activitiesById.get(key) || {}), ...activity });
  }
  return [...activitiesById.values()]
    .filter((activity) => distanceKm(activity) > 0)
    .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
}

function sortedRuns() {
  const runs = dashboardData.activities.filter((activity) => isRunType(activity.type));
  if (currentFilter === "longest") {
    return [...runs].sort((a, b) => distanceKm(b) - distanceKm(a));
  }
  if (currentFilter === "fastest") {
    return [...runs].sort((a, b) => (paceMinutesPerKm(a) || Infinity) - (paceMinutesPerKm(b) || Infinity));
  }
  return [...dashboardData.activities].sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
}

function renderActivities() {
  const container = document.getElementById("recent") || document.getElementById("runs");
  if (!container || !dashboardData) {
    return;
  }
  const activities = sortedRuns();
  routeMaps.forEach((map) => map.remove());
  routeMaps.clear();
  container.innerHTML = "";

  if (!activities.length) {
    container.innerHTML = `
      <article class="empty">
        <strong>No runs found yet</strong>
        <p>Once Strava data is imported, activities with distance will show up here.</p>
      </article>
    `;
    return;
  }

  for (const activity of activities) {
    const activityKey = String(activity.id || `${activity.name}-${activity.start}`).replace(/[^a-zA-Z0-9_-]/g, "-");
    const item = document.createElement("article");
    item.className = "activity";
    item.innerHTML = `
      <button class="activity-summary" type="button" aria-expanded="false">
        <span>
          <strong>${activity.name || "Untitled run"}</strong>
          <small>${activitySubtitle(activity)}</small>
        </span>
        <span class="activity-meta">
          <b>${formatNumber.format(distanceKm(activity))} km</b>
          <small>${formatPace(paceMinutesPerKm(activity))}</small>
        </span>
      </button>
      <div class="activity-detail" id="activity-detail-${activityKey}" hidden>
        ${renderRouteMap(activity, activityKey)}
        ${renderRunCharts(activity)}
        <button class="details-toggle" type="button" aria-expanded="false" aria-controls="detail-grid-${activityKey}">
          Show all details
        </button>
        <dl class="detail-grid" id="detail-grid-${activityKey}" hidden>
          ${detailRows(activity)
            .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
            .join("")}
        </dl>
      </div>
    `;

    const summary = item.querySelector(".activity-summary");
    const detail = item.querySelector(".activity-detail");
    const detailsToggle = item.querySelector(".details-toggle");
    const detailGrid = item.querySelector(".detail-grid");
    summary.addEventListener("click", () => {
      const isOpen = !detail.hidden;
      detail.hidden = isOpen;
      detail.classList.toggle("is-visible", !isOpen);
      summary.setAttribute("aria-expanded", String(!isOpen));
      item.classList.toggle("is-open", !isOpen);
      if (!isOpen) {
        requestAnimationFrame(() => initializeRouteMap(activity, activityKey));
      }
    });
    detailsToggle.addEventListener("click", () => {
      const isOpen = !detailGrid.hidden;
      detailGrid.hidden = isOpen;
      detailGrid.classList.toggle("is-visible", !isOpen);
      detailsToggle.textContent = isOpen ? "Show all details" : "Hide details";
      detailsToggle.setAttribute("aria-expanded", String(!isOpen));
    });
    container.appendChild(item);
  }
}

function renderRouteMap(activity, activityKey) {
  const coordinates = activity.geometry?.coordinates || [];
  if (coordinates.length < 2) {
    return `<div class="route-map route-empty">No route map available for this activity.</div>`;
  }

  return `
    <div id="route-map-${activityKey}" class="route-map" aria-label="Run route map"></div>
  `;
}

function initializeRouteMap(activity, activityKey) {
  const element = document.getElementById(`route-map-${activityKey}`);
  const coordinates = activity.geometry?.coordinates || [];
  if (!element || coordinates.length < 2) {
    return;
  }
  if (!window.L) {
    element.classList.add("route-empty");
    element.textContent = "Map tiles could not be loaded.";
    return;
  }

  if (routeMaps.has(activityKey)) {
    routeMaps.get(activityKey).invalidateSize();
    return;
  }

  const latLngs = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  const map = L.map(element, {
    scrollWheelZoom: false,
    zoomControl: false,
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);
  const route = L.polyline(latLngs, {
    color: "#ff2e63",
    opacity: 0.92,
    weight: 6,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);
  map.fitBounds(route.getBounds(), { padding: [24, 24] });
  routeMaps.set(activityKey, map);
  setTimeout(() => map.invalidateSize(), 120);
}

function renderRunCharts(activity) {
  const pace = paceMinutesPerKm(activity);
  const heartRate = Number(activity.average_heartrate || activity.raw?.average_heartrate || 0);
  const paceSeries = metricSeries(activity, "pace");
  const heartRateSeries = metricSeries(activity, "heartrate");

  return `
    <div class="chart-panel">
      ${renderLineChart("Pace", paceSeries, pace ? formatPace(pace) : "No pace data", true)}
      ${renderLineChart(
        "Heart rate",
        heartRateSeries,
        heartRate ? `${formatWholeNumber.format(heartRate)} bpm avg` : "No heart rate data",
        false
      )}
    </div>
  `;
}

function metricSeries(activity, metric) {
  const raw = activity.raw || {};
  const splits = raw.splits_metric || raw.splits_standard || activity.splits_metric || [];
  if (Array.isArray(splits) && splits.length) {
    const values = splits
      .map((split) => {
        if (metric === "pace" && split.moving_time && split.distance) {
          return (Number(split.moving_time) / 60) / (Number(split.distance) / 1000);
        }
        if (metric === "heartrate") {
          return Number(split.average_heartrate || split.avg_heartrate || 0);
        }
        return 0;
      })
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length) {
      return values;
    }
  }

  if (metric === "pace") {
    const pace = paceMinutesPerKm(activity);
    return Number.isFinite(pace) ? [pace] : [];
  }

  const heartRate = Number(activity.average_heartrate || raw.average_heartrate || 0);
  return heartRate > 0 ? [heartRate] : [];
}

function renderLineChart(label, values, emptyLabel, invert = false) {
  if (!values.length) {
    return `
      <section class="line-card">
        <h3>${label}</h3>
        <div class="chart-empty">${emptyLabel}</div>
      </section>
    `;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const normalized = (value - min) / span;
      const y = invert ? 24 + normalized * 92 : 116 - normalized * 92;
      if (values.length === 1) {
        return `0,${y.toFixed(1)} 300,${y.toFixed(1)}`;
      }
      const x = (index / (values.length - 1)) * 300;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `
    <section class="line-card">
      <div>
        <h3>${label}</h3>
        <span>${emptyLabel}</span>
      </div>
      <svg viewBox="0 0 300 140" preserveAspectRatio="none" aria-label="${label} graph">
        <polyline points="${points}" />
      </svg>
    </section>
  `;
}

function renderCountries() {
  const container = document.getElementById("countries");
  if (!container || !dashboardData) {
    return;
  }
  const countries = new Map();
  for (const activity of dashboardData.activities.filter((item) => isRunType(item.type))) {
    const country = countryForActivity(activity);
    if (!country) {
      continue;
    }
    const current = countries.get(country) || { count: 0, distance: 0 };
    current.count += 1;
    current.distance += distanceKm(activity);
    countries.set(country, current);
  }

  container.innerHTML = [...countries.entries()]
    .sort((a, b) => b[1].distance - a[1].distance)
    .map(
      ([country, stats]) => `
        <article>
          <strong>${country}</strong>
          <span>${formatWholeNumber.format(stats.count)} runs</span>
          <p>${formatNumber.format(stats.distance)} km</p>
        </article>
      `
    )
    .join("");

  if (!container.innerHTML) {
    container.innerHTML = `
      <article>
        <strong>No country data yet</strong>
        <span>Run locations will appear after Strava publishes country fields.</span>
      </article>
    `;
  }
}

function fallbackFromRoutes(summary, status, routes) {
  const routeActivities = (routes.features || [])
    .map(activityFromFeature)
    .filter((activity) => distanceKm(activity) > 0)
    .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  const runActivities = routeActivities.filter((activity) => isRunType(activity.type));
  const routeDistance = routeActivities.reduce((sum, activity) => sum + distanceKm(activity), 0);
  const routeHours = routeActivities.reduce((sum, activity) => sum + movingHours(activity), 0);
  const runDistance = runActivities.reduce((sum, activity) => sum + distanceKm(activity), 0);

  return {
    ...summary,
    totals: {
      activities: routeActivities.length || status.activity_count || 0,
      distance_km: routeDistance,
      run_distance_km: runDistance,
      diet_coke_cans: Math.round((runDistance * 1000) / 0.122),
      moving_hours: routeHours,
      elevation_m: summary.totals.elevation_m || 0,
    },
    recent: routeActivities.slice(0, 20),
    using_route_fallback: true,
  };
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }
  return response.json();
}

function renderStats(data, status) {
  const visibleActivities = dashboardData?.activities || [];
  const runActivities = visibleActivities.filter((activity) => isRunType(activity.type));
  const totals = visibleActivities.length
    ? {
        activities: visibleActivities.length,
        distance_km: visibleActivities.reduce((sum, activity) => sum + distanceKm(activity), 0),
        moving_hours: visibleActivities.reduce((sum, activity) => sum + movingHours(activity), 0),
        elevation_m: visibleActivities.reduce(
          (sum, activity) => sum + Number(activity.elevation_m || activity.raw?.total_elevation_gain || 0),
          0
        ),
        diet_coke_cans: Math.round(
          (runActivities.reduce((sum, activity) => sum + distanceKm(activity), 0) * 1000) / 0.122
        ),
      }
    : data.totals;
  const hasActivities = Number(totals.activities) > 0;
  const updatedAt = data.source_fetched_at || status.source_fetched_at || data.generated_at;

  setText("generated", `Strava sync: ${new Date(updatedAt).toLocaleString()} - updates every 6 hours`);
  setText("activities", formatNumber.format(totals.activities));
  setText("distance", formatNumber.format(totals.distance_km));
  setText("hours", formatNumber.format(totals.moving_hours));
  setText("elevation", formatNumber.format(totals.elevation_m));
  setText("diet-coke", formatWholeNumber.format(totals.diet_coke_cans || 0));

  if (data.using_route_fallback) {
    showStatus(
      "Strava routes are imported, summary needs rebuild",
      "I found route data from Strava, but summary.json is still empty. The page is showing route-derived stats for now; rerun the Update fitness data workflow to rebuild the full summary."
    );
  } else if (hasActivities) {
    hideStatus();
  } else {
    showStatus(
      "No imported activities yet",
      "The site is ready, but the public data files are still empty. Run the Update fitness data workflow to publish your real activities."
    );
  }
}

async function loadDashboard() {
  const [summary, status, routes] = await Promise.all([
    loadJson("data/summary.json"),
    loadJson("data/status.json"),
    loadJson("data/routes.geojson").catch(() => ({ features: [] })),
  ]);
  const summaryIsEmpty = Number(summary.totals.activities) === 0;
  const hasImportedRoutes = routes.features && routes.features.length > 0;
  const data = summaryIsEmpty && hasImportedRoutes ? fallbackFromRoutes(summary, status, routes) : summary;
  const summaryActivities = data.activities || data.recent || [];
  const routeActivities = (routes.features || []).map(activityFromFeature);

  dashboardData = {
    data,
    status,
    activities: mergeActivities(summaryActivities, routeActivities),
  };

  renderStats(data, status);
  renderCountries();
  renderActivities();
}

applyTheme(preferredTheme());
themeButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    if (dashboardData) {
      renderActivities();
    }
  });
});

loadDashboard().catch((error) => {
  setText("generated", error.message);
});
