import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const rootDir = process.cwd();
const watchlistPath = join(rootDir, "data", "watchlist.json");
const outputPath = join(rootDir, "data", "latest_deals.json");

const env = {
  token: process.env.TRAVELPAYOUTS_API_TOKEN || "",
  baseUrl: process.env.TRAVELPAYOUTS_API_BASE_URL || "https://api.travelpayouts.com",
  market: (process.env.TRAVELPAYOUTS_MARKET || "us").toLowerCase()
};

async function main() {
  const watchlistPayload = await readJson(watchlistPath, { watchlist: [] });
  const watchlist = Array.isArray(watchlistPayload.watchlist) ? watchlistPayload.watchlist : [];

  if (!watchlist.length) {
    await writeJson(outputPath, {
      generatedAt: new Date().toISOString(),
      source: "travelpayouts-aviasales-data-api",
      market: env.market,
      deals: []
    });
    console.log("No watchlist routes found. Wrote an empty deals file.");
    return;
  }

  if (!env.token) {
    throw new Error("TRAVELPAYOUTS_API_TOKEN is missing. Add it as a GitHub Actions secret.");
  }

  const deals = [];
  for (const route of watchlist) {
    const normalized = normalizeRoute(route);
    try {
      const offers = await searchFlights(normalized);
      const cheapest = offers[0] || null;

      deals.push({
        label: normalized.label,
        route: normalized,
        checkedAt: new Date().toISOString(),
        bestPrice: cheapest ? cheapest.price : null,
        currency: cheapest ? cheapest.currency : normalized.currencyCode,
        underTarget: cheapest && normalized.maxPrice ? Number(cheapest.price) <= Number(normalized.maxPrice) : Boolean(cheapest),
        offer: cheapest
      });
    } catch (error) {
      deals.push({
        label: normalized.label,
        route: normalized,
        checkedAt: new Date().toISOString(),
        bestPrice: null,
        currency: normalized.currencyCode,
        underTarget: false,
        offer: null,
        error: error.message || "Scan failed."
      });
    }
  }

  const sortedDeals = deals.sort((left, right) => {
    const leftPrice = left.bestPrice == null ? Number.POSITIVE_INFINITY : Number(left.bestPrice);
    const rightPrice = right.bestPrice == null ? Number.POSITIVE_INFINITY : Number(right.bestPrice);
    return leftPrice - rightPrice;
  });

  await writeJson(outputPath, {
    generatedAt: new Date().toISOString(),
    source: "travelpayouts-aviasales-data-api",
    market: env.market,
    deals: sortedDeals
  });

  console.log(`Scanned ${watchlist.length} route${watchlist.length === 1 ? "" : "s"}.`);
}

function normalizeRoute(route) {
  const normalized = {
    id: String(route.id || "").trim() || cryptoSafeId(route),
    label: String(route.label || "").trim() || `${route.origin} to ${route.destination}`,
    origin: String(route.origin || "").trim().toUpperCase(),
    destination: String(route.destination || "").trim().toUpperCase(),
    departureDate: String(route.departureDate || "").trim(),
    returnDate: String(route.returnDate || "").trim(),
    nonStop: normalizeBoolean(route.nonStop),
    currencyCode: String(route.currencyCode || "USD").trim().toUpperCase() || "USD",
    maxPrice: route.maxPrice ? Number(route.maxPrice) : null,
    maxResults: clamp(Number(route.maxResults || 3), 1, 5)
  };

  if (!/^[A-Z]{3}$/.test(normalized.origin) || !/^[A-Z]{3}$/.test(normalized.destination)) {
    throw new Error(`Invalid route ${normalized.id}: origin and destination must be 3-letter IATA codes.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.departureDate)) {
    throw new Error(`Invalid route ${normalized.id}: departureDate must use YYYY-MM-DD.`);
  }

  if (normalized.returnDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.returnDate)) {
    throw new Error(`Invalid route ${normalized.id}: returnDate must use YYYY-MM-DD.`);
  }

  return normalized;
}

function cryptoSafeId(route) {
  return `${String(route.origin || "from").toLowerCase()}-${String(route.destination || "to").toLowerCase()}-${String(route.departureDate || "date")}`;
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

async function searchFlights(params) {
  const query = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    departure_at: params.departureDate,
    one_way: String(!params.returnDate),
    direct: String(Boolean(params.nonStop)),
    currency: params.currencyCode.toLowerCase(),
    market: env.market,
    sorting: "price",
    unique: "false",
    limit: String(params.maxResults),
    page: "1"
  });

  if (params.returnDate) {
    query.set("return_at", params.returnDate);
  }

  const response = await fetch(`${env.baseUrl}/aviasales/v3/prices_for_dates?${query.toString()}`, {
    headers: {
      "x-access-token": env.token,
      accept: "application/json"
    }
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(payload.error || `Travelpayouts request failed with status ${response.status}.`);
  }

  const rawOffers = extractOffers(payload);
  return rawOffers
    .filter((offer) => matchesSearch(offer, params))
    .map((offer) => normalizeOffer(offer, params, payload.currency))
    .filter((offer) => {
      if (!params.maxPrice) {
        return true;
      }
      return Number(offer.price) <= Number(params.maxPrice);
    })
    .sort((left, right) => Number(left.price) - Number(right.price))
    .slice(0, params.maxResults);
}

function extractOffers(payload) {
  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (Array.isArray(payload.prices)) {
    return payload.prices;
  }

  return [];
}

function matchesSearch(rawOffer, params) {
  const departureDate = String(rawOffer.depart_date || rawOffer.departure_at || "").slice(0, 10);
  const returnDate = String(rawOffer.return_date || rawOffer.return_at || "").slice(0, 10);
  const origin = String(rawOffer.origin || rawOffer.origin_code || "").toUpperCase();
  const destination = String(rawOffer.destination || rawOffer.destination_code || "").toUpperCase();

  if (origin && origin !== params.origin) {
    return false;
  }

  if (destination && destination !== params.destination) {
    return false;
  }

  if (departureDate && departureDate !== params.departureDate) {
    return false;
  }

  if (params.returnDate) {
    return !returnDate || returnDate === params.returnDate;
  }

  return true;
}

function normalizeOffer(rawOffer, params, responseCurrency) {
  const stops = Number(rawOffer.number_of_changes ?? rawOffer.transfers ?? 0);
  const price = Number(rawOffer.value ?? rawOffer.price ?? 0);
  const durationMinutes = rawOffer.duration ? Number(rawOffer.duration) : null;
  const currency = String(responseCurrency || params.currencyCode || "USD").toUpperCase();
  const linkPath = rawOffer.link ? String(rawOffer.link).replace(/^\/+/, "") : "";

  return {
    price,
    currency,
    origin: String(rawOffer.origin || rawOffer.origin_code || params.origin).toUpperCase(),
    destination: String(rawOffer.destination || rawOffer.destination_code || params.destination).toUpperCase(),
    departureDate: String(rawOffer.depart_date || rawOffer.departure_at || params.departureDate).slice(0, 10),
    returnDate: String(rawOffer.return_date || rawOffer.return_at || "").slice(0, 10),
    stops,
    stopsLabel: stops === 0 ? "Nonstop" : `${stops} stop${stops === 1 ? "" : "s"}`,
    durationMinutes,
    provider: rawOffer.gate || rawOffer.airline || "Aviasales cache",
    foundAt: rawOffer.found_at || null,
    actual: rawOffer.actual !== false,
    deepLink: linkPath ? `https://www.aviasales.com/search/${linkPath}` : null
  };
}

async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
