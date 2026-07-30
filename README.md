# My Travel Map with City Pins

An interactive travel map for GitHub Pages.

- Country color intensity represents the total number of visits.
- Numbered city pins represent the number of visits to each city.
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

## Multiple visits to one city

Add one row per visit using the same city and coordinates:

```csv
156,China,2025-09,Beijing,39.9042,116.4074,Conference,YMWSCV 2025,Beijing Normal University,https://example.com,
156,China,2026-07,Beijing,39.9042,116.4074,Conference,Complex Analysis Workshop,Peking University,,
```

The Beijing pin will display `2`.

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
| `cityDotGap` | `1.3` | Minimum clear space between two dots. Dots that would overlap are nudged apart and joined to their true position by a hairline |
| `minLabelSize` | `5.5` | Smallest label that is still drawn |
| `hideAntarctica` | `true` | Drops Antarctica so the map fills the frame |
| `maxZoom` | `14` | Zoom ceiling |

Colors are CSS variables at the top of `style.css` (`--l1` … `--l4` for the
visit ramp, `--pin` for city dots, `--land-0` for unvisited countries).

`<body class="embed">` in `index.html` hides the page title and footer, which
is what you want inside a Google Sites embed. Remove `embed` to show them.

## Interaction

- Hover a country or a city dot for a summary; click for the full panel.
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
