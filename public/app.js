const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const formatWholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const themeButton = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

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
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function isRunType(type) {
  return type && type.toLowerCase().includes("run");
}

function dietCokeCansForKm(distanceKm) {
  return Math.round((distanceKm * 1000) / 0.122);
}

function activityUrl(activity) {
  return activity.url || "#";
}

function showStatus(title, message) {
  const status = document.getElementById("status");
  status.hidden = false;
  status.innerHTML = `
    <div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function hideStatus() {
  document.getElementById("status").hidden = true;
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

function fallbackFromRoutes(summary, status, routes) {
  const features = routes.features || [];
  const routeActivities = features
    .map((feature) => feature.properties)
    .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  const routeDistance = routeActivities.reduce((sum, activity) => sum + Number(activity.distance_km || 0), 0);
  const routeHours = routeActivities.reduce((sum, activity) => sum + Number(activity.moving_hours || 0), 0);
  const runDistance = routeActivities
    .filter((activity) => isRunType(activity.type))
    .reduce((sum, activity) => sum + Number(activity.distance_km || 0), 0);

  return {
    ...summary,
    totals: {
      activities: status.activity_count || features.length,
      distance_km: routeDistance,
      run_distance_km: runDistance,
      diet_coke_cans: dietCokeCansForKm(runDistance),
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
  const hasActivities = Number(data.totals.activities) > 0;
  const updatedAt = data.source_fetched_at || status.source_fetched_at || data.generated_at;

  setText("generated", `Strava sync: ${new Date(updatedAt).toLocaleString()} · updates every 6 hours`);
  setText("activities", formatNumber.format(data.totals.activities));
  setText("distance", formatNumber.format(data.totals.distance_km));
  setText("hours", formatNumber.format(data.totals.moving_hours));
  setText("elevation", formatNumber.format(data.totals.elevation_m));
  setText("diet-coke", formatWholeNumber.format(data.totals.diet_coke_cans || 0));

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

  renderRecent(data.recent || []);
}

async function loadDashboard() {
  const [summary, status] = await Promise.all([
    loadJson("data/summary.json"),
    loadJson("data/status.json"),
  ]);
  const summaryIsEmpty = Number(summary.totals.activities) === 0;
  let data = summary;

  if (summaryIsEmpty) {
    try {
      const routes = await loadJson("data/routes.geojson");
      const hasImportedRoutes = routes.features && routes.features.length > 0;
      data = hasImportedRoutes ? fallbackFromRoutes(summary, status, routes) : summary;
    } catch (error) {
      data = summary;
    }
  }

  renderStats(data, status);
}

applyTheme(preferredTheme());
themeButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

loadDashboard().catch((error) => {
  setText("generated", error.message);
});
