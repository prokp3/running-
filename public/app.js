const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

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
    container.innerHTML = '<p class="empty">No activities have been published yet.</p>';
    return;
  }

  for (const activity of activities) {
    const item = document.createElement("article");
    item.className = "activity";
    item.innerHTML = `
      <div>
        <a href="${activityUrl(activity)}" target="_blank" rel="noreferrer">${activity.name}</a>
        <p>${activity.type} · ${activity.start ? activity.start.slice(0, 10) : "Unknown date"}</p>
      </div>
      <div class="activity-meta">${formatNumber.format(activity.distance_km)} km · ${formatNumber.format(activity.moving_hours)} h</div>
    `;
    container.appendChild(item);
  }
}

async function loadStats() {
  const response = await fetch("data/summary.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load summary.json: ${response.status}`);
  }
  const data = await response.json();

  setText("generated", `Updated ${new Date(data.generated_at).toLocaleString()}`);
  setText("activities", formatNumber.format(data.totals.activities));
  setText("distance", formatNumber.format(data.totals.distance_km));
  setText("hours", formatNumber.format(data.totals.moving_hours));
  setText("elevation", formatNumber.format(data.totals.elevation_m));
  renderRecent(data.recent || []);
}

loadStats().catch((error) => {
  setText("generated", error.message);
});
