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
 * Convert the images column into an array.
 *
 * Examples:
 * images/south-korea/photo1.jpg
 *
 * images/south-korea/photo1.jpg|images/south-korea/photo2.jpg
 *
 * The old ::caption format also remains supported.
 */
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

/*
 * Build country, city, and visit data from travels.csv.
 */
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

    /*
     * Group multiple visits to the same city into one city pin.
     */
    if (
      row.city &&
      latitude !== null &&
      longitude !== null
    ) {
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

/*
 * Country color level based on visit count.
 */
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

/*
 * Create visit information cards.
 */
function renderVisitCards(visits) {
  return [...visits]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
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

/*
 * Collect all photos belonging to the selected city or country.
 */
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

/*
 * Open the full-size photo viewer.
 */
function bindPhotoButtons(photos) {
  panel
    .querySelectorAll("[data-photo-index]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.photoIndex);
        const photo = photos[index];

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
 * Shift pins that are too close to each other.
 *
 * The real latitude and longitude are not changed.
 * Only the displayed SVG position is moved.
 */
function spreadNearbyPins(cities, minimumDistance = 32) {
  const placedPins = [];

  return cities.map(city => {
    const anchorX = city.x;
    const anchorY = city.y;

    let displayX = anchorX;
    let displayY = anchorY;

    let radius = 0;
    let angle = 0;
    let attempts = 0;

    const overlapsAnotherPin = () =>
      placedPins.some(pin =>
        Math.hypot(
          displayX - pin.x,
          displayY - pin.y
        ) < minimumDistance
      );

    while (overlapsAnotherPin() && attempts < 60) {
      /*
       * Move in a gradually expanding spiral.
       */
      attempts += 1;
      radius = 12 + attempts * 2.2;
      angle = attempts * 2.4;

      displayX =
        anchorX + Math.cos(angle) * radius;

      displayY =
        anchorY + Math.sin(angle) * radius;
    }

    placedPins.push({
      x: displayX,
      y: displayY
    });

    return {
      ...city,
      anchorX,
      anchorY,
      x: displayX,
      y: displayY
    };
  });
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
      .selectAll(".city-pin")
      .classed("selected", false);
  }

  function closePanel() {
    panel.classList.remove("is-open");
    clearSelection();
  }

  /*
   * Open country details.
   */
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

  /*
   * Open city details.
   */
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
      .selectAll(".city-pin")
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
   * Draw countries.
   */
  svg
    .append("g")
    .attr("class", "countries-layer")
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
    })
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
   * Convert city latitude and longitude into SVG positions.
   */
  const projectedCities = data.cities
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
   * Automatically separate nearby city pins.
   */
  const cityData = spreadNearbyPins(
    projectedCities,
    32
  );

  const pinsLayer = svg
    .append("g")
    .attr("class", "pins-layer");

  /*
   * Draw connector lines for pins that were moved.
   */
  pinsLayer
    .selectAll(".pin-connector")
    .data(
      cityData.filter(city => {
        const movedDistance = Math.hypot(
          city.x - city.anchorX,
          city.y - city.anchorY
        );

        return movedDistance > 2;
      })
    )
    .join("line")
    .attr("class", "pin-connector")
    .attr("x1", city => city.anchorX)
    .attr("y1", city => city.anchorY)
    .attr("x2", city => city.x)
    .attr("y2", city => city.y);

  /*
   * Draw city pins.
   */
  const pinGroups = pinsLayer
    .selectAll(".city-pin")
    .data(cityData)
    .join("g")
    .attr("class", "city-pin")
    .attr(
      "transform",
      city => `translate(${city.x},${city.y})`
    )
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      city =>
        `${city.city}, ${city.country}: ${city.visits.length} visits`
    );

  pinGroups
    .append("circle")
    .attr(
      "r",
      city => (city.visits.length > 9 ? 13 : 11)
    );

  pinGroups
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text(city => city.visits.length);

  pinGroups
    .append("title")
    .text(
      city =>
        `${city.city}, ${city.country} — ${city.visits.length} visits`
    );

  pinGroups
    .on("click", (event, city) => {
      event.stopPropagation();
      renderCity(city, city.key);
    })
    .on("keydown", (event, city) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        renderCity(city, city.key);
      }
    });

  /*
   * Close the detail card when the × button is clicked.
   */
  panel.addEventListener("click", event => {
    if (event.target.closest("[data-close-panel]")) {
      closePanel();
    }
  });

  /*
   * Remove the loading message.
   */
  if (status) {
    status.remove();
  }

  /*
   * Do not automatically select the first city.
   * The initial screen therefore shows only the map.
   */
}

/*
 * Load travels.csv and initialize the map.
 */
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

/*
 * Photo lightbox controls.
 */
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
    .selectAll(".city-pin")
    .classed("selected", false);
});
