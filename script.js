import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
import world from "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json/+esm";

const svg = d3.select("#worldMap");
const status = document.querySelector("#mapStatus");
const panel = document.querySelector("#detailPanel");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxCaption = document.querySelector("#lightboxCaption");

const width = 960;
const height = 520;
svg.attr("viewBox", `0 0 ${width} ${height}`);

function parseImages(value = "") {
  if (!value.trim()) return [];

  return value
    .split("|")
    .map(item => {
      const [src, caption = ""] = item.split("::");
      return {
        src: src.trim(),
        caption: caption.trim()
      };
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
    const countryId = String(row.country_id).padStart(3, "0");
    const latitude = parseCoordinate(row.latitude);
    const longitude = parseCoordinate(row.longitude);

    const visit = {
      countryId,
      country: row.country,
      date: row.date,
      city: row.city,
      latitude,
      longitude,
      type: row.type,
      name: row.name,
      venue: row.venue,
      url: row.url,
      images: parseImages(row.images)
    };

    visits.push(visit);

    if (!countries[countryId]) {
      countries[countryId] = {
        country: row.country,
        visits: []
      };
    }
    countries[countryId].visits.push(visit);

    if (row.city && latitude !== null && longitude !== null) {
      const cityKey = [
        countryId,
        row.city.trim().toLowerCase(),
        latitude.toFixed(4),
        longitude.toFixed(4)
      ].join("|");

      if (!cities.has(cityKey)) {
        cities.set(cityKey, {
          countryId,
          country: row.country,
          city: row.city,
          latitude,
          longitude,
          visits: []
        });
      }

      cities.get(cityKey).visits.push(visit);
    }
  }

  return {
    countries,
    cities: [...cities.values()],
    visits
  };
}

function visitLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month] = String(value).split("-");
  return month ? `${year}-${month}` : year;
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
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderVisitCards(visits) {
  return [...visits]
    .sort((a, b) => b.date.localeCompare(a.date))
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

          ${url ? `
            <a class="event-link"
               href="${escapeAttribute(url)}"
               target="_blank"
               rel="noopener noreferrer">
              Visit website
            </a>
          ` : ""}
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
        image.caption ||
        `${fallbackPlace} — ${visit.date}`
    }))
  );
}

function renderPhotos(photos) {
  if (!photos.length) {
    return `<p class="no-photos">No photos have been added yet.</p>`;
  }

  return `
    <div class="gallery">
      ${photos.map((photo, index) => `
        <button type="button" data-photo-index="${index}">
          <img src="${escapeAttribute(photo.src)}"
               alt="${escapeAttribute(photo.caption || photo.fallbackCaption)}"
               loading="lazy">
        </button>
      `).join("")}
    </div>
  `;
}

function bindPhotoButtons(photos) {
  panel.querySelectorAll("[data-photo-index]").forEach(button => {
    button.addEventListener("click", () => {
      const photo = photos[Number(button.dataset.photoIndex)];
      lightboxImage.src = photo.src;
      lightboxImage.alt = photo.caption || photo.fallbackCaption;
      lightboxCaption.textContent = photo.caption || photo.fallbackCaption;
      lightbox.hidden = false;
    });
  });
}

function setupMap(data) {
  const countryFeatures = feature(world, world.objects.countries);
  const projection = d3.geoNaturalEarth1()
    .fitExtent([[14, 14], [width - 14, height - 14]], countryFeatures);
  const path = d3.geoPath(projection);

  function clearSelection() {
    svg.selectAll(".country").classed("selected", false);
    svg.selectAll(".city-pin").classed("selected", false);
  }

  function updateStats() {
    const sortedVisits = [...data.visits]
      .sort((a, b) => b.date.localeCompare(a.date));

    document.querySelector("#countryCount").textContent =
      Object.keys(data.countries).length;
    document.querySelector("#cityCount").textContent =
      data.cities.length;
    document.querySelector("#tripCount").textContent =
      data.visits.length;
    document.querySelector("#latestVisit").textContent =
      sortedVisits.length
        ? `${sortedVisits[0].date} ${sortedVisits[0].city}`
        : "—";
    document.querySelector("#lastUpdated").textContent =
      new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date());
  }

  function renderCountry(countryId) {
    const item = data.countries[countryId];
    if (!item) return;

    clearSelection();
    svg.selectAll(".country")
      .classed(
        "selected",
        d => String(d.id).padStart(3, "0") === countryId
      );

    const cityNames = [
      ...new Set(item.visits.map(visit => visit.city).filter(Boolean))
    ];
    const photos = collectPhotos(item.visits, item.country);

    panel.innerHTML = `
      <div class="country-heading">
        <div>
          <p class="panel-kicker">COUNTRY</p>
          <h2>${escapeHtml(item.country)}</h2>
          <p>${cityNames.map(escapeHtml).join(" · ")}</p>
        </div>
        <span class="visit-badge">
          ${item.visits.length} visit${item.visits.length === 1 ? "" : "s"}
        </span>
      </div>

      <div class="visit-list">
        ${renderVisitCards(item.visits)}
      </div>

      <h3 class="photos-heading">Photos</h3>
      ${renderPhotos(photos)}
    `;

    bindPhotoButtons(photos);
  }

  function renderCity(cityItem, cityKey) {
    clearSelection();

    svg.selectAll(".country")
      .classed(
        "selected",
        d => String(d.id).padStart(3, "0") === cityItem.countryId
      );

    svg.selectAll(".city-pin")
      .classed("selected", d => d.key === cityKey);

    const photos = collectPhotos(cityItem.visits, cityItem.city);

    panel.innerHTML = `
      <div class="country-heading">
        <div>
          <p class="panel-kicker">CITY</p>
          <h2>${escapeHtml(cityItem.city)}</h2>
          <p>${escapeHtml(cityItem.country)}</p>
        </div>
        <span class="visit-badge">
          ${cityItem.visits.length} visit${cityItem.visits.length === 1 ? "" : "s"}
        </span>
      </div>

      <div class="visit-list">
        ${renderVisitCards(cityItem.visits)}
      </div>

      <h3 class="photos-heading">Photos</h3>
      ${renderPhotos(photos)}
    `;

    bindPhotoButtons(photos);
  }

  svg.append("g")
    .attr("class", "countries-layer")
    .selectAll("path")
    .data(countryFeatures.features)
    .join("path")
    .attr("class", d => {
      const id = String(d.id).padStart(3, "0");
      const count = data.countries[id]?.visits.length || 0;
      return `country ${count ? "visited" : ""} visits-${visitLevel(count)}`;
    })
    .attr("d", path)
    .attr("tabindex", d =>
      data.countries[String(d.id).padStart(3, "0")] ? 0 : null
    )
    .attr("aria-label", d => {
      const item = data.countries[String(d.id).padStart(3, "0")];
      return item
        ? `${item.country}: ${item.visits.length} visits`
        : null;
    })
    .filter(d => data.countries[String(d.id).padStart(3, "0")])
    .on("click", (_, d) =>
      renderCountry(String(d.id).padStart(3, "0"))
    )
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        renderCountry(String(d.id).padStart(3, "0"));
      }
    });

  const cityData = data.cities
    .map((city, index) => {
      const point = projection([city.longitude, city.latitude]);
      return point
        ? {
            ...city,
            x: point[0],
            y: point[1],
            key: `${city.countryId}-${city.city}-${index}`
          }
        : null;
    })
    .filter(Boolean);

  const pinGroups = svg.append("g")
    .attr("class", "pins-layer")
    .selectAll("g")
    .data(cityData)
    .join("g")
    .attr("class", "city-pin")
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      d => `${d.city}, ${d.country}: ${d.visits.length} visits`
    );

  pinGroups.append("circle")
    .attr("r", d => d.visits.length > 9 ? 13 : 11);

  pinGroups.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text(d => d.visits.length);

  pinGroups.append("title")
    .text(d => `${d.city}, ${d.country} — ${d.visits.length} visits`);

  pinGroups
    .on("click", (event, d) => {
      event.stopPropagation();
      renderCity(d, d.key);
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        renderCity(d, d.key);
      }
    });

  status.remove();
  updateStats();

  if (cityData.length) {
    renderCity(cityData[0], cityData[0].key);
  } else {
    const firstCountry = Object.keys(data.countries)[0];
    if (firstCountry) renderCountry(firstCountry);
  }
}

try {
  const rows = await d3.csv("travels.csv");
  const data = buildTravelData(rows);
  setupMap(data);
} catch (error) {
  console.error(error);
  status.textContent =
    "The map could not be loaded. Check the CSV filename, column names, and formatting.";
}

document.querySelector("#closeLightbox").addEventListener("click", () => {
  lightbox.hidden = true;
});

lightbox.addEventListener("click", event => {
  if (event.target === lightbox) {
    lightbox.hidden = true;
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    lightbox.hidden = true;
  }
});
