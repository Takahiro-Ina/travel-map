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

  /* Repeat visits make a dot slightly larger: radius x visits^exponent,
     capped at cityDotMaxGrowth. Set the exponent to 0 for uniform dots. */
  cityDotGrowthExponent: 0.28,
  cityDotMaxGrowth: 1.9,

  /* Minimum clear space between two city dots. Dots that would overlap are
     nudged apart and joined to their true position by a hairline. */
  cityDotGap: 1.3,

  /* Smallest legible label. Countries too small for this get no number. */
  minLabelSize: 5.5,
  maxLabelSize: 12,

  /* Country shading is absolute: a country's tone depends only on its own
     visit count, never on the rest of the data, so a 2-visit country looks the
     same today and after you have added twenty more trips. This is the count
     that lands halfway along the ramp. Every extra visit still darkens the
     country a little; there is no cut-off bucket at the top. */
  shadeHalfway: 7,

  hideAntarctica: true,
  maxZoom: 14
};

const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";

const ANTARCTICA_ID = "010";

/*
 * Country shading ramp — light to deep. Interpolated, so any number of
 * visits gets its own tone.
 */
const SHADE_RAMP = [
  "#dbe8e6", "#b6d2cf", "#8dbab6", "#63a09b",
  "#3f8480", "#2f716d", "#1d5551", "#103b38"
];

/*
 * ISO 3166-1 numeric codes grouped by continent, used to build the country
 * index below the map. Nothing to maintain here: adding a row to travels.csv
 * is enough. To override a grouping, add a `region` column to the CSV.
 */
const REGION_CODES = {
  Asia:
    "004 031 048 050 051 064 096 104 116 144 156 158 268 275 344 " +
    "356 360 364 368 376 392 398 400 408 410 414 417 418 422 446 " +
    "458 462 496 512 524 586 608 626 634 682 702 704 760 762 764 " +
    "784 792 795 860 887",
  Europe:
    "008 020 040 056 070 100 112 191 196 203 208 233 234 246 248 " +
    "250 276 292 300 336 348 352 372 380 428 438 440 442 470 492 " +
    "498 499 528 578 616 620 642 643 674 688 703 705 724 744 752 " +
    "756 804 807 826 831 832 833",
  Americas:
    "028 032 044 052 060 068 076 084 092 124 136 152 170 188 192 " +
    "212 214 218 222 238 254 304 308 312 320 328 332 340 388 474 " +
    "484 500 531 533 534 535 558 581 591 600 604 630 652 659 660 " +
    "662 663 666 670 740 780 796 840 850 858 862",
  Africa:
    "012 024 072 086 108 120 132 140 148 174 175 178 180 204 226 " +
    "231 232 262 266 270 288 324 384 404 426 430 434 450 454 466 " +
    "478 480 504 508 516 562 566 624 638 646 654 678 686 690 694 " +
    "706 710 716 728 729 732 748 768 788 800 818 834 854 894",
  Oceania:
    "016 036 090 162 166 184 242 258 296 316 520 540 548 554 570 " +
    "574 580 583 584 585 598 612 772 776 798 876 882",
  Antarctic: "010 074 239 260 334"
};

const REGION_BY_ID = new Map();

for (const [region, codes] of Object.entries(REGION_CODES)) {
  for (const code of codes.trim().split(/\s+/)) {
    REGION_BY_ID.set(code, region);
  }
}

const regionOf = countryId => REGION_BY_ID.get(countryId) || "Other";

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
      region: (row.region || "").trim(),
      images: parseImages(row.images)
    };

    visits.push(visit);

    if (!countries[countryId]) {
      countries[countryId] = { country: visit.country, region: "", visits: [] };
    }

    if (visit.region) {
      countries[countryId].region = visit.region;
    }

    countries[countryId].visits.push(visit);

    /*
     * Repeat visits to one city collapse into a single dot. The key is
     * country + city name only — deliberately NOT the coordinates, so that
     * slightly different lat/lon in two rows for the same city still merge.
     * The first row's coordinates win.
     */
    if (visit.city && latitude !== null && longitude !== null) {
      const cityKey = [countryId, visit.city.toLowerCase()].join("|");

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

function visitLines(visits, limit = 5) {
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

  const shade = d3.interpolateRgbBasis(SHADE_RAMP);

  /*
   * Absolute scale. The curve saturates towards the darkest tone without ever
   * reaching it, so the ramp never runs out of room: 1 visit is the lightest
   * tone, CONFIG.shadeHalfway sits at the middle, and any further visit keeps
   * darkening the country by a smaller and smaller amount.
   */
  function countryColor(count) {
    if (count <= 0) return null;

    const steps = Math.max(0, count - 1);

    return shade(steps / (steps + Math.max(1, CONFIG.shadeHalfway - 1)));
  }

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
    .attr("class", f => (countryOf(f) ? "country visited" : "country"))
    .style("--fill", f => countryColor(countryOf(f)?.visits.length || 0))
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

      /* Repeat visits get a slightly larger dot. */
      const growth = Math.min(
        CONFIG.cityDotMaxGrowth,
        Math.pow(city.visits.length, CONFIG.cityDotGrowthExponent)
      );

      return {
        ...city,
        growth,
        x0: point[0],
        y0: point[1],
        x: point[0],
        y: point[1]
      };
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
  const radiusAt = (node, scale) =>
    (CONFIG.cityDotRadius * node.growth) / scale;

  function resolveOverlaps(scale) {
    const gap = CONFIG.cityDotGap / scale;

    for (const node of cityNodes) {
      node.vx = 0;
      node.vy = 0;
    }

    const simulation = d3
      .forceSimulation(cityNodes)
      .force("x", d3.forceX(d => d.x0).strength(0.7))
      .force("y", d3.forceY(d => d.y0).strength(0.7))
      .force(
        "collide",
        d3.forceCollide(d => radiusAt(d, scale) + gap / 2).iterations(4)
      )
      .stop();

    for (let i = 0; i < 160; i += 1) {
      simulation.tick();
    }
  }

  function applyScale(scale) {
    resolveOverlaps(scale);

    cityDots
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => radiusAt(d, scale))
      .attr("stroke-width", CONFIG.cityDotStroke / scale);

    cityHalos
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => radiusAt(d, scale) + 2.6 / scale)
      .attr("stroke-width", 1 / scale);

    cityLeaders
      .attr("x1", d => d.x0)
      .attr("y1", d => d.y0)
      .attr("x2", d => d.x)
      .attr("y2", d => d.y)
      .attr("stroke-width", 0.6 / scale)
      .attr("visibility", d =>
        Math.hypot(d.x - d.x0, d.y - d.y0) > radiusAt(d, scale) * 0.8
          ? null
          : "hidden"
      );

    if (labels) {
      labels
        .attr("font-size", d => d.size / scale)
        .attr("stroke-width", d => (d.size * 0.2) / scale);
    }
  }

  /* --- selection ------------------------------------------------------ */

  const indexHost = document.querySelector("#countryIndex");
  let chips = [];

  function syncChips(countryId) {
    for (const chip of chips) {
      chip.classList.toggle("is-active", chip.dataset.countryId === countryId);
    }
  }

  function clearSelection() {
    countryPaths.classed("selected", false);
    cityDots.classed("selected", false);
    cityHalos.classed("is-on", false);
    syncChips(null);
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
    syncChips(countryId);
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
    syncChips(city.countryId);
    bindPhotoButtons(photos);
  }

  /*
   * Visited countries listed below the map, grouped by continent. Regions and
   * countries are both ordered by visit count, so the list reorders itself as
   * travels.csv grows.
   */
  function buildCountryIndex() {
    if (!indexHost) return;

    const groups = new Map();

    for (const [id, item] of Object.entries(data.countries)) {
      const region = item.region || regionOf(id);

      if (!groups.has(region)) groups.set(region, []);
      groups.get(region).push({ id, ...item });
    }

    const ordered = [...groups.entries()]
      .map(([region, list]) => ({
        region,
        list: list.sort(
          (a, b) =>
            b.visits.length - a.visits.length ||
            a.country.localeCompare(b.country)
        ),
        total: list.reduce((sum, item) => sum + item.visits.length, 0)
      }))
      .sort((a, b) => b.total - a.total || a.region.localeCompare(b.region));

    indexHost.innerHTML = ordered
      .map(
        group => `
          <div class="index-group">
            <h2>${escapeHtml(group.region)}</h2>
            <div class="index-chips">
              ${group.list
                .map(
                  item => `
                    <button class="index-chip" type="button"
                            data-country-id="${escapeAttribute(item.id)}"
                            style="--swatch:${countryColor(item.visits.length)}"
                            aria-label="${escapeAttribute(
                              `${item.country}: ${plural(item.visits.length, "visit")}`
                            )}">
                      <i></i>${escapeHtml(item.country)}<b>${item.visits.length}</b>
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
        `
      )
      .join("");

    chips = [...indexHost.querySelectorAll(".index-chip")];

    for (const chip of chips) {
      chip.addEventListener("click", () => {
        renderCountry(chip.dataset.countryId);

        document
          .querySelector(".map-frame")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  /* --- interaction ---------------------------------------------------- */

  let panned = false;
  let panEndedAt = 0;

  const justPanned = () => Date.now() - panEndedAt < 200;

  countryPaths
    .filter(f => Boolean(countryOf(f)))
    .on("mouseenter", (event, f) => showTooltip(event, countryTooltipHtml(countryOf(f))))
    .on("mousemove", event => moveTooltip(event))
    .on("mouseleave", hideTooltip)
    .on("click", (event, f) => {
      if (justPanned()) return;
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
      if (justPanned()) return;

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

  /*
   * Clicking anywhere outside the panel dismisses it — the ocean, an unvisited
   * country, the page around the map. Clicks that select something else are
   * left alone so they can switch the panel's contents instead of closing it.
   */
  const KEEPS_PANEL_OPEN =
    ".detail-panel, .country.visited, .city-dot, .index-chip, " +
    ".zoom-controls, .lightbox";

  document.addEventListener("click", event => {
    if (!panel.classList.contains("is-open")) return;
    if (justPanned()) return;
    if (event.target.closest(KEEPS_PANEL_OPEN)) return;

    closePanel();
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
      if (panned) panEndedAt = Date.now();
      panned = false;
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

  buildCountryIndex();
  applyScale(1);

  if (status) {
    status.remove();
  }
}

/* ==========================================================================
   Last updated
   ========================================================================== */

/*
 * "Last updated" reports when travels.csv itself last changed, so editing the
 * data is enough to move the date. Falls back to the page's own timestamp.
 */
async function renderLastUpdated() {
  const node = document.querySelector("#lastUpdated");
  if (!node) return;

  let stamp = new Date(document.lastModified);

  try {
    const response = await fetch("travels.csv", {
      method: "HEAD",
      cache: "no-cache"
    });

    const header = response.headers.get("last-modified");
    if (header && !Number.isNaN(Date.parse(header))) {
      stamp = new Date(header);
    }
  } catch {
    /* Keep the fallback. */
  }

  node.textContent = stamp.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
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

  renderLastUpdated();
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
