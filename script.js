import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

/* ==========================================================================
   Settings — the only place you normally need to edit
   ========================================================================== */

const CONFIG = {
  /* Country visit counts drawn on the map.
     false -> shading only (recommended; hover a country to see the number)
     true  -> faint numbers, auto-sized so they never overflow the country  */
  showCountryCounts: false,

  /* City dot size, in on-screen units (stays constant while zooming). */
  cityDotRadius: 2.1,
  cityDotStroke: 0.7,

  /* Minimum clear space between two city dots. Dots that would overlap are
     nudged apart and joined to their true position by a hairline. */
  cityDotGap: 1.3,

  /* Smallest legible label. Countries too small for this get no number. */
  minLabelSize: 5.5,
  maxLabelSize: 12,

  hideAntarctica: true,
  maxZoom: 14
};

const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";

const ANTARCTICA_ID = "010";

/* ==========================================================================
   Elements
   ========================================================================== */

const svg = d3.select("#worldMap");
const status = document.querySelector("#mapStatus");
const panel = document.querySelector("#detailPanel");

const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxCaption = document.querySelector("#lightboxCaption");
const closeLightboxButton = document.querySelector("#closeLightbox");

/* 960 x 430 is the tightest box that fits the land (Antarctica removed)
   with no empty bands above or below. */
const width = 960;
const height = 430;

svg
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const tooltip = document.createElement("div");
tooltip.className = "map-tooltip";
tooltip.hidden = true;
document.body.appendChild(tooltip);

/* ==========================================================================
   Data
   ========================================================================== */

function stripBom(rows) {
  const columns = rows.columns || [];
  const bomKey = columns.find(key => key.charCodeAt(0) === 0xfeff);

  if (!bomKey) {
    return rows;
  }

  const cleanKey = bomKey.slice(1);

  for (const row of rows) {
    row[cleanKey] = row[bomKey];
    delete row[bomKey];
  }

  return rows;
}

function parseImages(value = "") {
  if (!value.trim()) {
    return [];
  }

  return value
    .split("|")
    .map(item => {
      const [src, caption = ""] = item.split("::");
      return { src: src.trim(), caption: caption.trim() };
    })
    .filter(item => item.src);
}

function parseCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildTravelData(rows) {
  const countries = {};
  const cities = new Map();
  const visits = [];

  for (const row of rows) {
    if (!row.country_id) {
      continue;
    }

    const countryId = String(row.country_id).trim().padStart(3, "0");
    const latitude = parseCoordinate(row.latitude);
    const longitude = parseCoordinate(row.longitude);

    const visit = {
      countryId,
      country: (row.country || "").trim(),
      date: (row.date || "").trim(),
      city: (row.city || "").trim(),
      latitude,
      longitude,
      type: (row.type || "").trim(),
      name: (row.name || "").trim(),
      venue: (row.venue || "").trim(),
      url: (row.url || "").trim(),
      images: parseImages(row.images)
    };

    visits.push(visit);

    if (!countries[countryId]) {
      countries[countryId] = { country: visit.country, visits: [] };
    }

    countries[countryId].visits.push(visit);

    /* Repeat visits to one city collapse into a single dot. */
    if (visit.city && latitude !== null && longitude !== null) {
      const cityKey = [
        countryId,
        visit.city.toLowerCase(),
        latitude.toFixed(4),
        longitude.toFixed(4)
      ].join("|");

      if (!cities.has(cityKey)) {
        cities.set(cityKey, {
          key: cityKey,
          countryId,
          country: visit.country,
          city: visit.city,
          latitude,
          longitude,
          visits: []
        });
      }

      cities.get(cityKey).visits.push(visit);
    }
  }

  return { countries, cities: [...cities.values()], visits };
}

function visitLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/* ==========================================================================
   Formatting helpers
   ========================================================================== */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatDate(value) {
  if (!value) return "";

  const [year, month] = String(value).split("-");
  const index = Number(month) - 1;

  return MONTHS[index] ? `${MONTHS[index]} ${year}` : year;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function safeUrl(value = "") {
  if (!value.trim()) return "";

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function byDateDescending(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

/* ==========================================================================
   Detail panel
   ========================================================================== */

function renderVisitCards(visits) {
  return [...visits]
    .sort(byDateDescending)
    .map(visit => {
      const url = safeUrl(visit.url);

      return `
        <article class="visit">
          <div class="visit-topline">
            <time datetime="${escapeAttribute(visit.date)}">${formatDate(visit.date)}</time>
            ${visit.type ? `<span class="type-badge">${escapeHtml(visit.type)}</span>` : ""}
          </div>

          ${visit.name ? `<h3>${escapeHtml(visit.name)}</h3>` : ""}

          <p class="visit-location">
            ${visit.city ? escapeHtml(visit.city) : ""}
            ${visit.venue ? `<br>${escapeHtml(visit.venue)}` : ""}
          </p>

          ${
            url
              ? `<a class="event-link" href="${escapeAttribute(url)}"
                    target="_blank" rel="noopener noreferrer">Visit website ↗</a>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function collectPhotos(visits, fallbackPlace) {
  return visits.flatMap(visit =>
    visit.images.map(image => ({
      ...image,
      fallbackCaption:
        image.caption || `${fallbackPlace} — ${formatDate(visit.date)}`
    }))
  );
}

function renderPhotos(photos) {
  if (!photos.length) {
    return `<p class="no-photos">No photos have been added yet.</p>`;
  }

  return `
    <div class="gallery">
      ${photos
        .map(
          (photo, index) => `
            <button type="button" data-photo-index="${index}">
              <img src="${escapeAttribute(photo.src)}"
                   alt="${escapeAttribute(photo.caption || photo.fallbackCaption)}"
                   loading="lazy">
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function bindPhotoButtons(photos) {
  panel.querySelectorAll("[data-photo-index]").forEach(button => {
    button.addEventListener("click", () => {
      const photo = photos[Number(button.dataset.photoIndex)];
      if (!photo) return;

      const caption = photo.caption || photo.fallbackCaption;

      lightboxImage.src = photo.src;
      lightboxImage.alt = caption;
      lightboxCaption.textContent = caption;
      lightbox.hidden = false;
    });
  });
}

function panelMarkup({ kicker, title, subtitle, count, visits, photos }) {
  return `
    <button class="panel-close" type="button" data-close-panel
            aria-label="Close details">×</button>

    <div class="country-heading">
      <div>
        <p class="panel-kicker">${kicker}</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${subtitle}</p>
      </div>
      <span class="visit-badge">${plural(count, "visit")}</span>
    </div>

    <div class="visit-list">${renderVisitCards(visits)}</div>

    <h3 class="photos-heading">Photos</h3>
    ${renderPhotos(photos)}
  `;
}

/* ==========================================================================
   Tooltip
   ========================================================================== */

function visitLines(visits, limit = 4) {
  const sorted = [...visits].sort(byDateDescending);
  const shown = sorted.slice(0, limit);

  const items = shown
    .map(
      visit => `
        <div class="tooltip-visit">
          <div class="tooltip-date">${escapeHtml(formatDate(visit.date))}</div>
          ${visit.name ? `<div class="tooltip-event">${escapeHtml(visit.name)}</div>` : ""}
          ${visit.venue ? `<div class="tooltip-venue">${escapeHtml(visit.venue)}</div>` : ""}
        </div>
      `
    )
    .join("");

  const rest = sorted.length - shown.length;

  return items + (rest > 0 ? `<div class="tooltip-hint">+${rest} more</div>` : "");
}

function cityTooltipHtml(city) {
  return `
    <div class="tooltip-head">
      <span class="tooltip-city">${escapeHtml(city.city)}</span>
      <span class="tooltip-count">${plural(city.visits.length, "visit")}</span>
    </div>
    <div class="tooltip-country">${escapeHtml(city.country)}</div>
    ${visitLines(city.visits)}
  `;
}

function countryTooltipHtml(item) {
  const cityNames = [...new Set(item.visits.map(v => v.city).filter(Boolean))];

  return `
    <div class="tooltip-head">
      <span class="tooltip-city">${escapeHtml(item.country)}</span>
      <span class="tooltip-count">${plural(item.visits.length, "visit")}</span>
    </div>
    ${cityNames.length ? `<div class="tooltip-country">${cityNames.map(escapeHtml).join(" · ")}</div>` : ""}
    <div class="tooltip-hint">Click for details</div>
  `;
}

function showTooltip(event, html) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const spacing = 14;
  const rect = tooltip.getBoundingClientRect();

  let left = event.clientX + spacing;
  let top = event.clientY + spacing;

  if (left + rect.width > window.innerWidth - 8) {
    left = event.clientX - rect.width - spacing;
  }

  if (top + rect.height > window.innerHeight - 8) {
    top = event.clientY - rect.height - spacing;
  }

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

/* ==========================================================================
   Label geometry — largest landmass, and a size that fits inside it
   ========================================================================== */

function largestPart(feature) {
  const geometry = feature.geometry;

  if (geometry.type !== "MultiPolygon") {
    return feature;
  }

  let best = null;
  let bestArea = -1;

  for (const coordinates of geometry.coordinates) {
    const polygon = { type: "Polygon", coordinates };
    const area = d3.geoArea(polygon);

    if (area > bestArea) {
      bestArea = area;
      best = polygon;
    }
  }

  return best || feature;
}

function labelPlacement(path, feature) {
  const part = largestPart(feature);
  const [x, y] = path.centroid(part);
  const [[x0, y0], [x1, y1]] = path.bounds(part);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  /* Keep the glyph box comfortably inside the shape's own box. */
  const size = Math.min(
    CONFIG.maxLabelSize,
    (x1 - x0) * 0.42,
    (y1 - y0) * 0.55
  );

  return size >= CONFIG.minLabelSize ? { x, y, size } : null;
}

/* ==========================================================================
   Map
   ========================================================================== */

function setupMap(data, world) {
  const all = feature(world, world.objects.countries);

  const features = CONFIG.hideAntarctica
    ? all.features.filter(f => String(f.id).padStart(3, "0") !== ANTARCTICA_ID)
    : all.features;

  const landmass = { type: "FeatureCollection", features };

  const projection = d3
    .geoNaturalEarth1()
    .fitExtent(
      [
        [10, 10],
        [width - 10, height - 10]
      ],
      landmass
    );

  const path = d3.geoPath(projection);

  const zoomLayer = svg.append("g").attr("class", "zoom-layer");

  /* --- backdrop ------------------------------------------------------- */

  zoomLayer
    .append("path")
    .attr("class", "graticule")
    .attr("d", path(d3.geoGraticule10()));

  zoomLayer
    .append("path")
    .attr("class", "sphere")
    .attr("d", path({ type: "Sphere" }));

  /* --- countries ------------------------------------------------------ */

  const countryOf = f => data.countries[String(f.id).padStart(3, "0")];

  const countryPaths = zoomLayer
    .append("g")
    .attr("class", "countries-layer")
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("class", f => {
      const count = countryOf(f)?.visits.length || 0;
      return ["country", count ? "visited" : "", `visits-${visitLevel(count)}`]
        .filter(Boolean)
        .join(" ");
    })
    .attr("d", path)
    .attr("tabindex", f => (countryOf(f) ? 0 : null))
    .attr("aria-label", f => {
      const item = countryOf(f);
      return item ? `${item.country}: ${plural(item.visits.length, "visit")}` : null;
    });

  /* --- optional visit-count labels ------------------------------------ */

  let labels = null;

  if (CONFIG.showCountryCounts) {
    const placements = features
      .filter(countryOf)
      .map(f => {
        const placement = labelPlacement(path, f);
        return placement
          ? { ...placement, count: countryOf(f).visits.length }
          : null;
      })
      .filter(Boolean);

    labels = zoomLayer
      .append("g")
      .attr("class", "country-count-layer")
      .selectAll("text")
      .data(placements)
      .join("text")
      .attr("class", "country-visit-count")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .text(d => d.count);
  }

  /* --- city dots ------------------------------------------------------ */

  const cityNodes = data.cities
    .map(city => {
      const point = projection([city.longitude, city.latitude]);
      if (!point) return null;

      return { ...city, x0: point[0], y0: point[1], x: point[0], y: point[1] };
    })
    .filter(Boolean);

  const cityLayer = zoomLayer.append("g").attr("class", "city-layer");

  const cityGroups = cityLayer
    .selectAll("g")
    .data(cityNodes)
    .join("g")
    .attr("class", "city");

  cityGroups.append("line").attr("class", "city-leader");
  cityGroups.append("circle").attr("class", "city-halo");

  cityGroups
    .append("circle")
    .attr("class", "city-dot")
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      d => `${d.city}, ${d.country}: ${plural(d.visits.length, "visit")}`
    );

  const cityLeaders = cityGroups.select("line.city-leader");
  const cityHalos = cityGroups.select("circle.city-halo");
  const cityDots = cityGroups.select("circle.city-dot");

  /*
   * Dots keep a constant on-screen size, so the radius in map units shrinks
   * as you zoom in. Overlaps are resolved at the current radius: at zoom 1
   * close neighbours (Seoul / Daejeon) are nudged apart, and as you zoom in
   * they settle back onto their true coordinates on their own.
   */
  function resolveOverlaps(scale) {
    const radius = CONFIG.cityDotRadius / scale;
    const gap = CONFIG.cityDotGap / scale;

    for (const node of cityNodes) {
      node.vx = 0;
      node.vy = 0;
    }

    const simulation = d3
      .forceSimulation(cityNodes)
      .force("x", d3.forceX(d => d.x0).strength(0.7))
      .force("y", d3.forceY(d => d.y0).strength(0.7))
      .force("collide", d3.forceCollide(radius + gap / 2).iterations(4))
      .stop();

    for (let i = 0; i < 160; i += 1) {
      simulation.tick();
    }
  }

  function applyScale(scale) {
    const radius = CONFIG.cityDotRadius / scale;

    resolveOverlaps(scale);

    cityDots
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", radius)
      .attr("stroke-width", CONFIG.cityDotStroke / scale);

    cityHalos
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", radius + 2.6 / scale)
      .attr("stroke-width", 1 / scale);

    cityLeaders
      .attr("x1", d => d.x0)
      .attr("y1", d => d.y0)
      .attr("x2", d => d.x)
      .attr("y2", d => d.y)
      .attr("stroke-width", 0.6 / scale)
      .attr("visibility", d =>
        Math.hypot(d.x - d.x0, d.y - d.y0) > radius * 0.8 ? null : "hidden"
      );

    if (labels) {
      labels
        .attr("font-size", d => d.size / scale)
        .attr("stroke-width", d => (d.size * 0.2) / scale);
    }
  }

  /* --- selection ------------------------------------------------------ */

  function clearSelection() {
    countryPaths.classed("selected", false);
    cityDots.classed("selected", false);
    cityHalos.classed("is-on", false);
  }

  function closePanel() {
    panel.classList.remove("is-open");
    clearSelection();
  }

  function selectCountryShape(countryId) {
    countryPaths.classed(
      "selected",
      f => String(f.id).padStart(3, "0") === countryId
    );
  }

  function renderCountry(countryId) {
    const item = data.countries[countryId];
    if (!item) return;

    clearSelection();
    selectCountryShape(countryId);

    const cityNames = [...new Set(item.visits.map(v => v.city).filter(Boolean))];
    const photos = collectPhotos(item.visits, item.country);

    panel.innerHTML = panelMarkup({
      kicker: "COUNTRY",
      title: item.country,
      subtitle: cityNames.map(escapeHtml).join(" · "),
      count: item.visits.length,
      visits: item.visits,
      photos
    });

    panel.classList.add("is-open");
    bindPhotoButtons(photos);
  }

  function renderCity(city) {
    clearSelection();
    selectCountryShape(city.countryId);

    cityDots.classed("selected", d => d.key === city.key);
    cityHalos.classed("is-on", d => d.key === city.key);

    const photos = collectPhotos(city.visits, city.city);

    panel.innerHTML = panelMarkup({
      kicker: "CITY",
      title: city.city,
      subtitle: escapeHtml(city.country),
      count: city.visits.length,
      visits: city.visits,
      photos
    });

    panel.classList.add("is-open");
    bindPhotoButtons(photos);
  }

  /* --- interaction ---------------------------------------------------- */

  let panned = false;

  countryPaths
    .filter(f => Boolean(countryOf(f)))
    .on("mouseenter", (event, f) => showTooltip(event, countryTooltipHtml(countryOf(f))))
    .on("mousemove", event => moveTooltip(event))
    .on("mouseleave", hideTooltip)
    .on("click", (event, f) => {
      if (panned) return;
      renderCountry(String(f.id).padStart(3, "0"));
    })
    .on("keydown", (event, f) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        renderCountry(String(f.id).padStart(3, "0"));
      }
    });

  cityDots
    .on("mouseenter", (event, city) => {
      d3.select(event.currentTarget.parentNode)
        .select(".city-halo")
        .classed("is-on", true);

      showTooltip(event, cityTooltipHtml(city));
    })
    .on("mousemove", event => moveTooltip(event))
    .on("mouseleave", (event, city) => {
      if (!event.currentTarget.classList.contains("selected")) {
        d3.select(event.currentTarget.parentNode)
          .select(".city-halo")
          .classed("is-on", false);
      }

      hideTooltip();
    })
    .on("focus", (event, city) => {
      const rect = event.currentTarget.getBoundingClientRect();

      showTooltip(
        {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        },
        cityTooltipHtml(city)
      );
    })
    .on("blur", hideTooltip)
    .on("click", (event, city) => {
      event.stopPropagation();
      if (panned) return;

      hideTooltip();
      renderCity(city);
    })
    .on("keydown", (event, city) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        hideTooltip();
        renderCity(city);
      }
    });

  panel.addEventListener("click", event => {
    if (event.target.closest("[data-close-panel]")) {
      closePanel();
    }
  });

  /* --- zoom ----------------------------------------------------------- */

  let frame = null;

  const zoom = d3
    .zoom()
    .scaleExtent([1, CONFIG.maxZoom])
    .translateExtent([
      [0, 0],
      [width, height]
    ])
    .on("start", () => {
      panned = false;
      hideTooltip();
    })
    .on("zoom", event => {
      if (event.sourceEvent && event.sourceEvent.type === "mousemove") {
        panned = true;
      }

      zoomLayer.attr("transform", event.transform);

      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyScale(event.transform.k));
    })
    .on("end", () => {
      /* Let the click handler see the flag, then reset it. */
      setTimeout(() => {
        panned = false;
      }, 0);
    });

  svg.call(zoom).on("dblclick.zoom", null);

  const zoomBy = factor =>
    svg.transition().duration(260).call(zoom.scaleBy, factor);

  document.querySelector("#zoomIn")?.addEventListener("click", () => zoomBy(1.7));
  document.querySelector("#zoomOut")?.addEventListener("click", () => zoomBy(1 / 1.7));
  document.querySelector("#zoomReset")?.addEventListener("click", () => {
    svg.transition().duration(320).call(zoom.transform, d3.zoomIdentity);
    closePanel();
  });

  applyScale(1);

  if (status) {
    status.remove();
  }
}

/* ==========================================================================
   Summary numbers
   ========================================================================== */

function renderStats(data) {
  const set = (id, value) => {
    const node = document.querySelector(id);
    if (node) node.textContent = value;
  };

  const dates = data.visits.map(v => v.date).filter(Boolean).sort();
  const latest = dates.at(-1);

  set("#countryCount", Object.keys(data.countries).length);
  set("#cityCount", data.cities.length);
  set("#tripCount", data.visits.length);
  set("#latestVisit", latest ? formatDate(latest) : "—");

  set(
    "#lastUpdated",
    new Date(document.lastModified).toLocaleDateString("en-CA")
  );
}

/* ==========================================================================
   Boot
   ========================================================================== */

try {
  const [rows, world] = await Promise.all([
    d3.csv("travels.csv"),
    d3.json(WORLD_URL)
  ]);

  const data = buildTravelData(stripBom(rows));

  renderStats(data);
  setupMap(data, world);
} catch (error) {
  console.error(error);

  if (status) {
    status.textContent =
      "The map could not be loaded. Check the CSV filename, column names, and formatting.";
  }
}

/* Lightbox + keyboard ----------------------------------------------------- */

closeLightboxButton?.addEventListener("click", () => {
  lightbox.hidden = true;
});

lightbox?.addEventListener("click", event => {
  if (event.target === lightbox) {
    lightbox.hidden = true;
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;

  hideTooltip();

  if (lightbox) lightbox.hidden = true;

  if (panel) panel.classList.remove("is-open");

  svg.selectAll(".country").classed("selected", false);
  svg.selectAll(".city-dot").classed("selected", false);
  svg.selectAll(".city-halo").classed("is-on", false);
});
