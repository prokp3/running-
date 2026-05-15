const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const routeColors = {
  Run: "#d9462f",
  TrailRun: "#b72818",
  Ride: "#2067b0",
  MountainBikeRide: "#184d84",
  Walk: "#0f7b63",
  Hike: "#76512f",
};

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
    color: routeColors[feature.properties.type] || "#172019",
    opacity: 0.72,
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

async function loadRoutes() {
  const mapElement = document.getElementById("map");
  if (!window.L) {
    mapElement.classList.add("map-empty");
    mapElement.innerHTML = "<strong>Map library could not be loaded.</strong>";
    return;
  }

  const map = L.map("map", { scrollWheelZoom: false }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

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
    map.remove();
    return;
  }

  const routeLayer = L.geoJSON(routes, {
    style: routeStyle,
    onEachFeature(feature, layer) {
      layer.bindPopup(popupContent(feature));
    },
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
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
  document.getElementById("status").hidden = hasActivities;
  renderRecent(data.recent || []);
}

Promise.all([loadStats(), loadRoutes()]).catch((error) => {
  setText("generated", error.message);
});
