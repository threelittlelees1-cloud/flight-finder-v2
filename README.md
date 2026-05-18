# Flight Finder

This project is now built for:

- A single-file frontend in [index.html](C:\Users\ONE\Downloads\flight finder\index.html)
- Scheduled GitHub Actions scans
- Static GitHub Pages hosting
- Travelpayouts cached fare data

## What changed

This version no longer needs Cloudflare Workers.

Instead:

- GitHub Actions checks the watched routes on a schedule
- the workflow writes fresh results into `data/latest_deals.json`
- GitHub Pages serves the site and the generated JSON files

That keeps the stack free and much simpler.

## How this version works

You store the tracked routes in [data/watchlist.json](C:\Users\ONE\Downloads\flight finder\data\watchlist.json).

The workflow in [.github/workflows/scan-flights.yml](C:\Users\ONE\Downloads\flight finder\.github\workflows\scan-flights.yml) runs every 30 minutes and can also be run manually. It reads the watchlist, calls Travelpayouts, and updates [data/latest_deals.json](C:\Users\ONE\Downloads\flight finder\data\latest_deals.json).

The site in [index.html](C:\Users\ONE\Downloads\flight finder\index.html) reads those JSON files directly.

## Why GitHub Actions is the best free fit

As of May 18, 2026:

- GitHub says scheduled workflows can run as often as every `5 minutes`
- scheduled runs can be delayed during high load, especially near the top of the hour
- scheduled workflows only run from the default branch
- in public repositories, standard GitHub-hosted runners are free

This starter uses minutes `17` and `47` past the hour to avoid the worst top-of-hour congestion.

## Step 1: Create a GitHub repository

1. Create a new GitHub repository.
2. Make it `Public` if you want the easiest zero-cost setup with GitHub Free.
3. Upload this project folder to that repository.

## Step 2: Add your Travelpayouts token

In GitHub:

1. Open your repository
2. Go to `Settings`
3. Open `Secrets and variables`
4. Open `Actions`
5. Click `New repository secret`
6. Add this secret:

```text
Name: TRAVELPAYOUTS_API_TOKEN
Value: your real Travelpayouts token
```

Optional repo variables if you want to override defaults later:

```text
TRAVELPAYOUTS_API_BASE_URL=https://api.travelpayouts.com
TRAVELPAYOUTS_MARKET=us
```

## Step 3: Edit the watchlist

Open [data/watchlist.json](C:\Users\ONE\Downloads\flight finder\data\watchlist.json) and replace the sample routes with your own.

Each route object looks like this:

```json
{
  "id": "jfk-lax-summer",
  "label": "Summer trip to LA",
  "origin": "JFK",
  "destination": "LAX",
  "departureDate": "2026-06-20",
  "returnDate": "2026-06-27",
  "nonStop": false,
  "currencyCode": "USD",
  "maxPrice": 350,
  "maxResults": 3
}
```

You can also use the builder inside [index.html](C:\Users\ONE\Downloads\flight finder\index.html) to generate a JSON entry to paste into the watchlist file.

## Step 4: Turn on GitHub Pages

In GitHub:

1. Open the repository
2. Go to `Settings`
3. Open `Pages`
4. Under `Build and deployment`, choose:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
5. Save

GitHub will publish the site at a URL like:

```text
https://your-username.github.io/your-repo-name/
```

## Step 5: Run the workflow once

In GitHub:

1. Open the `Actions` tab
2. Open the `scan-flights` workflow
3. Click `Run workflow`
4. Run it on your default branch

That first run generates `data/latest_deals.json`.

## Step 6: Let the schedule keep it fresh

After the first run, GitHub Actions will keep scanning automatically every 30 minutes using this workflow:

- [.github/workflows/scan-flights.yml](C:\Users\ONE\Downloads\flight finder\.github\workflows\scan-flights.yml)

It is scheduled for:

```text
17 and 47 minutes past every hour UTC
```

## Important limitations

- This is cached deal data, not guaranteed live checkout pricing.
- GitHub Actions schedules can be delayed or occasionally dropped during high load.
- In public repositories, scheduled workflows are automatically disabled after `60 days` with no repository activity.
- If you use a private repository on GitHub Free, GitHub includes a limited monthly Actions allowance instead of unlimited public-run usage.

## Main files

- [index.html](C:\Users\ONE\Downloads\flight finder\index.html): static dashboard
- [data/watchlist.json](C:\Users\ONE\Downloads\flight finder\data\watchlist.json): routes to scan
- [data/latest_deals.json](C:\Users\ONE\Downloads\flight finder\data\latest_deals.json): generated output
- [scripts/scan-flights.mjs](C:\Users\ONE\Downloads\flight finder\scripts\scan-flights.mjs): scan script
- [.github/workflows/scan-flights.yml](C:\Users\ONE\Downloads\flight finder\.github\workflows\scan-flights.yml): scheduled workflow

## Sources

- [GitHub Actions events and schedules](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Travelpayouts Aviasales Data API](https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API)
- [Travelpayouts API reference](https://travelpayouts.github.io/slate/)
