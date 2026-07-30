# My Travel Map

An interactive travel map for GitHub Pages. Countries are shaded by how many
times I have visited them, dots mark visited cities, and clicking either opens a
panel with the trip details and photos.

## Files

- `index.html` — page structure
- `style.css` — all styling; colors are CSS variables at the top
- `script.js` — map rendering and interaction; tunable values are in `CONFIG` at the top
- `travels.csv` — the data
- `images/` — photos

Only `travels.csv` needs touching to add a trip. Everything else is derived from
it, including the continent grouping in the country list.

## CSV format

One row per visit.

```
country_id,country,date,city,latitude,longitude,type,name,venue,url,images
410,South Korea,2019-10,Seoul,37.5665,126.9780,Conference,PSCV 2019,KIAS,https://example.com,images/korea/kias.jpg::Venue
```

| Column | Notes |
| --- | --- |
| `country_id` | ISO 3166-1 numeric code |
| `country` | Country name in English |
| `date` | `YYYY-MM` |
| `city`, `latitude`, `longitude` | City and its coordinates |
| `type` | `Conference`, `Research Visit`, `Vacation`, … |
| `name`, `venue` | Event or trip name, and where |
| `url` | Optional link |
| `images` | Optional `path::caption`, several separated by `\|` |
| `region` | Optional; overrides the continent used to group the country |

Repeat visits: add another row with the same city. They merge into one dot, and
the coordinates do not have to match exactly. Several cities in one country: use
different city names.
