import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
import world from "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json/+esm";

const svg = d3.select("#worldMap");
const status = document.querySelector("#mapStatus");
const panel = document.querySelector("#detailPanel");

const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxCaption = document.querySelector("#lightboxCaption");
const closeLightboxButton = document.querySelector("#closeLightbox");

const width = 960;
const height = 520;

svg.attr("viewBox", `0 0 ${width} ${height}`);

/*
 * Tooltip shown when the cursor is placed over a city dot.
 */
const tooltip = document.createElement("div");
tooltip.className = "city-tooltip";
tooltip.hidden = true;
document.body.appendChild(tooltip);

function parseImages(value = "") {
  if (!value.trim()) {
    return [];
  }

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
      country: row.country || "",
      date: row.date || "",
      city: row.city || "",
      latitude,
      longitude,
      type: row.type || "",
      name: row.name || "",
      venue: row.venue || "",
      url: row.url || "",
      images: parseImages(row.images)
    };

    visits.push(visit);

    if (!countries[countryId]) {
      countries[countryId] = {
        country: visit.country,
        visits: []
      };
    }

    countries[countryId].visits.push(visit);

    /*
     * Multiple visits to the same city are combined into one dot.
     */
    if (
      visit.city &&
      latitude !== null &&
      longitude !== null
    ) {
      const cityKey = [
        countryId,
        visit.city.trim().toLowerCase(),
        latitude.toFixed(4),
        longitude.toFixed(4)
      ].join("|");

      if (!cities.has(cityKey)) {
        cities.set(cityKey, {
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
  if (!value) {
    return "";
  }

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
  if (!value.trim()) {
    return "";
  }

  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function renderVisitCards(visits) {
  return [...visits]
    .sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    )
    .map(visit => {
      const url = safeUrl(visit.url);

      return `
        <article class="visit">
          <div class="visit-topline">
            <time datetime="${escapeAttribute(visit.date)}">
              ${formatDate(visit.date)}
            </time>

            ${
              visit.type
                ? `<span class="type-badge">${escapeHtml(visit.type)}</span>`
                : ""
            }
          </div>

          ${
            visit.name
              ? `<h3>${escapeHtml(visit.name)}</h3>`
              : ""
          }

          <p class="visit-location">
            ${visit.city ? escapeHtml(visit.city) : ""}
            ${
              visit.venue
                ? `<br>${escapeHtml(visit.venue)}`
                : ""
            }
          </p>

          ${
            url
              ? `
                <a
                  class="event-link"
                  href="${escapeAttribute(url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit website
                </a>
              `
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
        image.caption ||
        `${fallbackPlace} — ${visit.date}`
    }))
  );
}

function renderPhotos(photos) {
  if (!photos.length) {
    return `
      <p class="no-photos">
        No photos have been added yet.
      </p>
    `;
  }

  return `
    <div class="gallery">
      ${photos
        .map(
          (photo, index) => `
            <button
              type="button"
              data-photo-index="${index}"
            >
              <img
                src="${escapeAttribute(photo.src)}"
                alt="${escapeAttribute(
                  photo.caption || photo.fallbackCaption
                )}"
                loading="lazy"
              >
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function bindPhotoButtons(photos) {
  panel
    .querySelectorAll("[data-photo-index]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const photo =
          photos[Number(button.dataset.photoIndex)];

        if (!photo) {
          return;
        }

        const caption =
          photo.caption || photo.fallbackCaption;

        lightboxImage.src = photo.src;
        lightboxImage.alt = caption;
        lightboxCaption.textContent = caption;
        lightbox.hidden = false;
      });
    });
}

/*
 * Text displayed when hovering over a city dot.
 */
function createCityTooltip(city) {
  const visits = [...city.visits].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );

  const visitItems = visits
    .map(visit => `
      <div class="tooltip-visit">
        <div class="tooltip-date">
          ${escapeHtml(formatDate(visit.date))}
        </div>

        ${
          visit.name
            ? `
              <div class="tooltip-event">
                ${escapeHtml(visit.name)}
              </div>
            `
            : ""
        }

        ${
          visit.venue
            ? `
              <div class="tooltip-venue">
                ${escapeHtml(visit.venue)}
              </div>
            `
            : ""
        }
      </div>
    `)
    .join("");

  return `
    <div class="tooltip-city">
      ${escapeHtml(city.city)}
    </div>

    <div class="tooltip-country">
      ${escapeHtml(city.country)}
    </div>

    ${visitItems}
  `;
}

function showTooltip(event, city) {
  tooltip.innerHTML = createCityTooltip(city);
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const spacing = 14;

  let left = event.clientX + spacing;
  let top = event.clientY + spacing;

  const tooltipRect = tooltip.getBoundingClientRect();

  if (left + tooltipRect.width > window.innerWidth - 8) {
    left =
      event.clientX -
      tooltipRect.width -
      spacing;
  }

  if (top + tooltipRect.height > window.innerHeight - 8) {
    top =
      event.clientY -
      tooltipRect.height -
      spacing;
  }

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function setupMap(data) {
  const countryFeatures = feature(
    world,
    world.objects.countries
  );

  const projection = d3
    .geoNaturalEarth1()
    .fitExtent(
      [
        [14, 14],
        [width - 14, height - 14]
      ],
      countryFeatures
    );

  const path = d3.geoPath(projection);

  function clearSelection() {
    svg
      .selectAll(".country")
      .classed("selected", false);

    svg
      .selectAll(".city-dot")
      .classed("selected", false);
  }

  function closePanel() {
    panel.classList.remove("is-open");
    clearSelection();
  }

  function renderCountry(countryId) {
    const item = data.countries[countryId];

    if (!item) {
      return;
    }

    clearSelection();

    svg
      .selectAll(".country")
      .classed(
        "selected",
        country =>
          String(country.id).padStart(3, "0") ===
          countryId
      );

    const cityNames = [
      ...new Set(
        item.visits
          .map(visit => visit.city)
          .filter(Boolean)
      )
    ];

    const photos = collectPhotos(
      item.visits,
      item.country
    );

    panel.innerHTML = `
      <button
        class="panel-close"
        type="button"
        data-close-panel
        aria-label="Close details"
      >
        ×
      </button>

      <div class="country-heading">
        <div>
          <p class="panel-kicker">COUNTRY</p>
          <h2>${escapeHtml(item.country)}</h2>
          <p>
            ${cityNames.map(escapeHtml).join(" · ")}
          </p>
        </div>

        <span class="visit-badge">
          ${item.visits.length}
          visit${item.visits.length === 1 ? "" : "s"}
        </span>
      </div>

      <div class="visit-list">
        ${renderVisitCards(item.visits)}
      </div>

      <h3 class="photos-heading">Photos</h3>
      ${renderPhotos(photos)}
    `;

    panel.classList.add("is-open");
    bindPhotoButtons(photos);
  }

  function renderCity(cityItem, cityKey) {
    clearSelection();

    svg
      .selectAll(".country")
      .classed(
        "selected",
        country =>
          String(country.id).padStart(3, "0") ===
          cityItem.countryId
      );

    svg
      .selectAll(".city-dot")
      .classed(
        "selected",
        city => city.key === cityKey
      );

    const photos = collectPhotos(
      cityItem.visits,
      cityItem.city
    );

    panel.innerHTML = `
      <button
        class="panel-close"
        type="button"
        data-close-panel
        aria-label="Close details"
      >
        ×
      </button>

      <div class="country-heading">
        <div>
          <p class="panel-kicker">CITY</p>
          <h2>${escapeHtml(cityItem.city)}</h2>
          <p>${escapeHtml(cityItem.country)}</p>
        </div>

        <span class="visit-badge">
          ${cityItem.visits.length}
          visit${cityItem.visits.length === 1 ? "" : "s"}
        </span>
      </div>

      <div class="visit-list">
        ${renderVisitCards(cityItem.visits)}
      </div>

      <h3 class="photos-heading">Photos</h3>
      ${renderPhotos(photos)}
    `;

    panel.classList.add("is-open");
    bindPhotoButtons(photos);
  }

  /*
   * Draw country shapes.
   */
  const countriesLayer = svg
    .append("g")
    .attr("class", "countries-layer");

  const countryPaths = countriesLayer
    .selectAll("path")
    .data(countryFeatures.features)
    .join("path")
    .attr("class", country => {
      const id = String(country.id).padStart(3, "0");
      const count =
        data.countries[id]?.visits.length || 0;

      return [
        "country",
        count ? "visited" : "",
        `visits-${visitLevel(count)}`
      ]
        .filter(Boolean)
        .join(" ");
    })
    .attr("d", path)
    .attr("tabindex", country => {
      const id = String(country.id).padStart(3, "0");
      return data.countries[id] ? 0 : null;
    })
    .attr("aria-label", country => {
      const id = String(country.id).padStart(3, "0");
      const item = data.countries[id];

      return item
        ? `${item.country}: ${item.visits.length} visits`
        : null;
    });

  countryPaths
    .filter(country => {
      const id = String(country.id).padStart(3, "0");
      return Boolean(data.countries[id]);
    })
    .on("click", (_, country) => {
      const id = String(country.id).padStart(3, "0");
      renderCountry(id);
    })
    .on("keydown", (event, country) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        const id = String(country.id).padStart(
          3,
          "0"
        );

        renderCountry(id);
      }
    });

  /*
   * Display the visit count near the center of each visited country.
   */
  const visitedCountryFeatures =
    countryFeatures.features.filter(country => {
      const id = String(country.id).padStart(3, "0");
      return Boolean(data.countries[id]);
    });

  const countryCountLayer = svg
    .append("g")
    .attr("class", "country-count-layer");

  countryCountLayer
    .selectAll("text")
    .data(visitedCountryFeatures)
    .join("text")
    .attr("class", "country-visit-count")
    .attr("x", country => path.centroid(country)[0])
    .attr("y", country => path.centroid(country)[1])
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .text(country => {
      const id = String(country.id).padStart(3, "0");
      return data.countries[id].visits.length;
    });

  /*
   * Convert city coordinates to map coordinates.
   */
  const cityData = data.cities
    .map((city, index) => {
      const point = projection([
        city.longitude,
        city.latitude
      ]);

      if (!point) {
        return null;
      }

      return {
        ...city,
        x: point[0],
        y: point[1],
        key: `${city.countryId}-${city.city}-${index}`
      };
    })
    .filter(Boolean);

  /*
   * Draw small city dots.
   */
  const cityLayer = svg
    .append("g")
    .attr("class", "city-dots-layer");

  const cityDots = cityLayer
    .selectAll("circle")
    .data(cityData)
    .join("circle")
    .attr("class", "city-dot")
    .attr("cx", city => city.x)
    .attr("cy", city => city.y)
    .attr("r", 3.2)
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      city =>
        `${city.city}, ${city.country}: ${city.visits.length} visits`
    );

  cityDots
    .on("mouseenter", (event, city) => {
      showTooltip(event, city);
    })
    .on("mousemove", event => {
      moveTooltip(event);
    })
    .on("mouseleave", () => {
      hideTooltip();
    })
    .on("focus", (event, city) => {
      /*
       * Keyboard focus does not always have useful mouse coordinates,
       * so the browser's element position is used instead.
       */
      const rect =
        event.currentTarget.getBoundingClientRect();

      showTooltip(
        {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        },
        city
      );
    })
    .on("blur", () => {
      hideTooltip();
    })
    .on("click", (event, city) => {
      event.stopPropagation();
      hideTooltip();
      renderCity(city, city.key);
    })
    .on("keydown", (event, city) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        hideTooltip();
        renderCity(city, city.key);
      }
    });

  panel.addEventListener("click", event => {
    if (event.target.closest("[data-close-panel]")) {
      closePanel();
    }
  });

  if (status) {
    status.remove();
  }
}

try {
  const rows = await d3.csv("travels.csv");
  const data = buildTravelData(rows);

  setupMap(data);
} catch (error) {
  console.error(error);

  if (status) {
    status.textContent =
      "The map could not be loaded. Check the CSV filename, column names, and formatting.";
  }
}

if (closeLightboxButton) {
  closeLightboxButton.addEventListener("click", () => {
    lightbox.hidden = true;
  });
}

if (lightbox) {
  lightbox.addEventListener("click", event => {
    if (event.target === lightbox) {
      lightbox.hidden = true;
    }
  });
}

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") {
    return;
  }

  hideTooltip();

  if (lightbox) {
    lightbox.hidden = true;
  }

  if (panel) {
    panel.classList.remove("is-open");
  }

  svg
    .selectAll(".country")
    .classed("selected", false);

  svg
    .selectAll(".city-dot")
    .classed("selected", false);
});
