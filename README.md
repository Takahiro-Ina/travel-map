# My Travel Map with City Pins

An interactive travel map for GitHub Pages.

- Country color intensity represents the total number of visits.
- City dots mark visited cities; repeat visits make a dot slightly larger.
- Event or project URLs are displayed only when a URL is provided.
- Photos can be attached to each visit.

## Files

- `index.html` — Page structure
- `style.css` — Page, country, and city-pin styling
- `script.js` — Map rendering and interaction
- `travels.csv` — Travel records
- `images/` — Travel photos

## CSV format

```csv
country_id,country,date,city,latitude,longitude,type,name,venue,url,images
156,China,2025-09,Beijing,39.9042,116.4074,Conference,YMWSCV 2025,Beijing Normal University,https://example.com,
```

## Columns

- `country_id` — ISO 3166-1 numeric country code
- `country` — Country name in English
- `date` — `YYYY-MM`
- `city` — City name
- `latitude` — City latitude
- `longitude` — City longitude
- `type` — `Conference`, `Research Visit`, `Vacation`, and so on
- `name` — Conference, project, or trip name
- `venue` — University, institute, hotel, or other venue
- `url` — Optional related website
- `images` — Optional photo paths and captions
- `region` — Optional. Overrides the continent used to group the country in the
  list below the map. Leave it out and the continent is looked up from
  `country_id` automatically

## Multiple visits to one city

Add one row per visit using the same city and coordinates:

```csv
156,China,2025-09,Beijing,39.9042,116.4074,Conference,YMWSCV 2025,Beijing Normal University,https://example.com,
156,China,2026-07,Beijing,39.9042,116.4074,Conference,Complex Analysis Workshop,Peking University,,
```

Both rows merge into a single Beijing dot. Hovering it shows `2 visits` and
both entries; clicking opens the full list.

Cities are merged by **country + city name only**, not by coordinates, so the
lat/lon in the two rows do not have to match exactly.

## Multiple cities in one country

Use different city names and coordinates:

```csv
156,China,2025-09,Beijing,39.9042,116.4074,Conference,YMWSCV 2025,Beijing Normal University,,
156,China,2026-03,Shanghai,31.2304,121.4737,Research Visit,Joint Research Visit,Fudan University,,
```

China will be shaded for two total visits, and separate pins will appear in Beijing and Shanghai.

## Photos

Example:

```csv
156,China,2025-09,Beijing,39.9042,116.4074,Conference,YMWSCV 2025,Beijing Normal University,https://example.com,images/china/beijing-1.jpg::Conference venue
```

Multiple images are separated with `|`:

```text
images/china/photo-1.jpg::Venue|images/china/photo-2.jpg::Beijing
```

## Appearance settings

All visual knobs live in the `CONFIG` object at the top of `script.js`:

| Key | Default | Meaning |
| --- | --- | --- |
| `showCountryCounts` | `false` | `false` = shading only; `true` = faint numbers, auto-sized so they never overflow a country (countries too small to fit a legible number are skipped) |
| `cityDotRadius` | `2.1` | City dot radius, in on-screen units. Stays constant while zooming |
| `cityDotStroke` | `0.7` | White outline width of a city dot |
| `cityDotGrowthExponent` | `0.28` | Repeat visits enlarge a dot by `visits ^ exponent` (1 visit = 1.00x, 2 = 1.21x, 4 = 1.47x). Set to `0` for uniform dots |
| `cityDotMaxGrowth` | `1.9` | Ceiling on that growth |
| `cityDotGap` | `1.3` | Minimum clear space between two dots. Dots that would overlap are nudged apart and joined to their true position by a hairline |
| `minLabelSize` | `5.5` | Smallest label that is still drawn |
| `shadeHalfway` | `7` | Country shading is absolute — a country's tone depends only on its own visit count, never on the rest of the data. This is the count that lands halfway along the ramp. Raise it to spread the gradient over more visits, lower it to darken faster. There is no top bucket: every extra visit still darkens the country |
| `hideAntarctica` | `true` | Drops Antarctica so the map fills the frame |
| `maxZoom` | `14` | Zoom ceiling |

Colors are CSS variables at the top of `style.css` (`--l1` … `--l4` for the
visit ramp, `--pin` for city dots, `--land-0` for unvisited countries).

The page is the map, the country list, and one "Last updated" line. To drop
that line too, uncomment the rule at the top of `style.css`:

```css
/* footer { display: none; } */
```

`Last updated` reads the `Last-Modified` header of `travels.csv`, so editing
the data is enough to move the date.

Country shading is one continuous ramp, defined by `SHADE_RAMP` near the top of
`script.js`. Add or change hex values there to retune it.

## Country list

Below the map, visited countries are grouped by continent and ordered by visit
count. Clicking an entry opens the same panel as clicking the country on the
map. Nothing needs maintaining: continents come from a built-in ISO 3166-1
numeric lookup, so a new row in `travels.csv` lands in the right group by
itself. Add a `region` column if you want to override the grouping.

## Interaction

- Hover a country or a city dot for a summary; click for the full panel.
- Click anywhere outside the panel — the ocean, an unvisited country, the page
  around the map — to dismiss it. Clicking another country switches to it.
- Scroll or pinch to zoom, drag to pan, or use the buttons in the corner.
- As you zoom in, nudged dots settle back onto their true coordinates.
- `Esc` closes the panel, the photo lightbox, and any tooltip.

## Updating an existing repository

Replace these files:

1. `index.html`
2. `style.css`
3. `script.js`
4. `travels.csv`

Replacing `README.md` is optional but recommended.

Do not add `travel-data.js`; this version reads only from `travels.csv`.
