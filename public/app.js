const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const formatWholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const themeButton = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
let activeMap;
let activeTileLayer;

const routeColors = {
  Run: "#d9462f",
  TrailRun: "#b72818",
  Ride: "#2067b0",
  MountainBikeRide: "#184d84",
  Walk: "#0f7b63",
  Hike: "#76512f",
};

const tileUrls = {
  light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

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
  themeIcon.textContent = theme === "dark" ? "Sun" : "Moon";
  themeButton.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");

  if (activeMap && activeTileLayer) {
    activeMap.removeLayer(activeTileLayer);
    activeTileLayer = createTileLayer(theme).addTo(activeMap);
  }
}

function createTileLayer(theme) {
  return L.tileLayer(tileUrls[theme], {
    attribution:
      theme === "dark"
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function activityUrl(activity) {
  return activity.url || "#";
}

function renderRecent(activities) {
  const container = document.getElementById("recent");
  container.innerHTML = "";

  if (!activities.length) {
    container.innerHTML = `
      <article class="empty">
        <strong>No recent activities yet</strong>
        <p>Once Strava data is imported, your latest runs and rides will show up here.</p>
      </article>
    `;
    return;
  }

  for (const activity of activities) {
    const item = document.createElement("article");
    item.className = "activity";
    item.innerHTML = `
      <div>
        <a href="${activityUrl(activity)}" target="_blank" rel="noreferrer">${activity.name}</a>
        <p>${activity.type} &middot; ${activity.start ? activity.start.slice(0, 10) : "Unknown date"}</p>
      </div>
      <div class="activity-meta">${formatNumber.format(activity.distance_km)} km &middot; ${formatNumber.format(activity.moving_hours)} h</div>
    `;
    container.appendChild(item);
  }
}

function routeStyle(feature) {
  return {
    color: routeColors[feature.properties.type] || "var(--ink)",
    opacity: 0.78,
    weight: 4,
  };
}

function popupContent(feature) {
  const props = feature.properties;
  const date = props.start ? props.start.slice(0, 10) : "Unknown date";
  const label = `${props.type} &middot; ${date} &middot; ${formatNumber.format(props.distance_km)} km`;
  const name = props.url
    ? `<a href="${props.url}" target="_blank" rel="noreferrer">${props.name}</a>`
    : props.name;
  return `<strong>${name}</strong><br>${label}`;
}

async function loadRoutes(mapCenter) {
  const mapElement = document.getElementById("map");
  if (!window.L) {
    mapElement.classList.add("map-empty");
    mapElement.innerHTML = "<strong>Map library could not be loaded.</strong>";
    return;
  }

  const initialCenter = mapCenter ? [mapCenter.latitude, mapCenter.longitude] : [20, 0];
  activeMap = L.map("map", { scrollWheelZoom: false }).setView(initialCenter, mapCenter ? 12 : 2);
  activeTileLayer = createTileLayer(document.documentElement.dataset.theme || "light").addTo(activeMap);

  const response = await fetch("data/routes.geojson", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load routes.geojson: ${response.status}`);
  }

  const routes = await response.json();
  if (!routes.features || routes.features.length === 0) {
    mapElement.classList.add("map-empty");
    mapElement.innerHTML = `
      <div>
        <strong>No GPS routes imported yet</strong>
        <p>Routes will appear here after the Strava refresh workflow writes route data.</p>
      </div>
    `;
    activeMap.remove();
    activeMap = undefined;
    activeTileLayer = undefined;
    return;
  }

  const routeLayer = L.geoJSON(routes, {
    style: routeStyle,
    onEachFeature(feature, layer) {
      layer.bindPopup(popupContent(feature));
    },
  }).addTo(activeMap);

  if (mapCenter) {
    activeMap.setView([mapCenter.latitude, mapCenter.longitude], 12);
  } else {
    activeMap.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
  }
}

async function loadStats() {
  const response = await fetch("data/summary.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load summary.json: ${response.status}`);
  }
  const data = await response.json();
  const hasActivities = Number(data.totals.activities) > 0;
  const updatedAt = data.source_fetched_at || data.generated_at;

  setText("generated", `Strava sync: ${new Date(updatedAt).toLocaleString()} · updates every 6 hours`);
  setText("activities", formatNumber.format(data.totals.activities));
  setText("distance", formatNumber.format(data.totals.distance_km));
  setText("hours", formatNumber.format(data.totals.moving_hours));
  setText("elevation", formatNumber.format(data.totals.elevation_m));
  setText("diet-coke", formatWholeNumber.format(data.totals.diet_coke_cans || 0));
  document.getElementById("status").hidden = hasActivities;
  renderRecent(data.recent || []);
  return data;
}

applyTheme(preferredTheme());
themeButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

loadStats()
  .then((data) => loadRoutes(data.map_center))
  .catch((error) => {
    setText("generated", error.message);
  });
