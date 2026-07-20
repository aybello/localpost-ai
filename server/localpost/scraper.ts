import * as cheerio from "cheerio";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_PAGE_TEXT = 14_000;
const MAX_TOTAL_TEXT = 32_000;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_PAGES = 4;

export type ScrapedPage = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
};

export type WebsiteScrapeResult = {
  sourceUrl: string;
  title: string;
  description: string;
  text: string;
  detectedColors: string[];
  pages: ScrapedPage[];
  metadata: {
    pageCount: number;
    headings: string[];
    detectedColors: string[];
    fetchedUrls: string[];
  };
};

export class WebsiteScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteScrapeError";
  }
}

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("2001:db8:")) return true;

  if (normalized.startsWith("::ffff:")) {
    return isPrivateOrReservedIp(normalized.slice("::ffff:".length));
  }

  if (isIP(normalized) !== 4) return false;
  const octets = normalized.split(".").map(Number);
  const [a = 0, b = 0, c = 0] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function normalizeWebsiteUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new WebsiteScrapeError("Only HTTP and HTTPS websites can be analyzed.");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new WebsiteScrapeError("Enter a valid business website URL.");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WebsiteScrapeError("Only HTTP and HTTPS websites can be analyzed.");
  }
  if (url.username || url.password) {
    throw new WebsiteScrapeError("Website URLs cannot include credentials.");
  }

  url.hash = "";
  return url;
}

async function assertPublicDestination(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new WebsiteScrapeError("That website address is not publicly reachable.");
  }

  if (isIP(hostname) && isPrivateOrReservedIp(hostname)) {
    throw new WebsiteScrapeError("Private and reserved network addresses cannot be analyzed.");
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new WebsiteScrapeError("The website hostname could not be resolved.");
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new WebsiteScrapeError("The website does not resolve to a public address.");
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > MAX_PAGE_BYTES) {
    throw new WebsiteScrapeError("The website page is too large to analyze safely.");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new WebsiteScrapeError("The website page exceeded the analysis size limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function fetchHtml(initialUrl: URL): Promise<{ html: string; finalUrl: URL }> {
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicDestination(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9",
          "user-agent": "LocalPostAI/1.0 (+website brand analysis)",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new WebsiteScrapeError("The website redirected too many times.");
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new WebsiteScrapeError(`The website returned HTTP ${response.status}.`);
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new WebsiteScrapeError("The provided URL did not return a web page.");
      }

      return { html: await readBoundedBody(response), finalUrl: currentUrl };
    } catch (error) {
      if (error instanceof WebsiteScrapeError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WebsiteScrapeError("The website took too long to respond.");
      }
      throw new WebsiteScrapeError("The website could not be downloaded for analysis.");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new WebsiteScrapeError("The website could not be reached.");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function collectColors(html: string, $: cheerio.CheerioAPI): string[] {
  const values = new Set<string>();
  const themeColor = $('meta[name="theme-color"]').attr("content");
  const source = `${themeColor ?? ""} ${html}`;

  const colorPattern = /#(?:[\da-fA-F]{6}|[\da-fA-F]{3})(?![\da-fA-F])/g;
  let match: RegExpExecArray | null;
  while ((match = colorPattern.exec(source)) !== null) {
    const raw = match[0].toUpperCase();
    const expanded = raw.length === 4
      ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
      : raw;
    if (!["#FFFFFF", "#000000", "#F5F5F5", "#FAFAFA"].includes(expanded)) {
      values.add(expanded);
    }
    if (values.size >= 12) break;
  }

  return Array.from(values);
}

function parsePage(html: string, url: URL): ScrapedPage & { colors: string[]; links: URL[] } {
  const $ = cheerio.load(html);
  const title = normalizeText($("title").first().text()).slice(0, 500);
  const description = normalizeText(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      ""
  ).slice(0, 1_000);
  const headings = $("h1, h2, h3")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 40);
  const colors = collectColors(html, $);
  const links: URL[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const candidate = new URL(href, url);
      candidate.hash = "";
      if (candidate.origin === url.origin && candidate.protocol.startsWith("http")) {
        links.push(candidate);
      }
    } catch {
      // Ignore malformed links found in untrusted markup.
    }
  });

  $("script, style, noscript, svg, iframe, form, nav, footer").remove();
  const bodyText = normalizeText($("main").text() || $("article").text() || $("body").text());
  const text = [description, ...headings, bodyText]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PAGE_TEXT);

  return { url: url.toString(), title, description, headings, text, colors, links };
}

export function rankCandidateLinks(urls: URL[]): URL[] {
  const intentPattern = /\b(about|service|services|product|products|solution|solutions|team|contact|location|locations)\b/i;
  const seen = new Set<string>();

  return urls
    .filter(url => {
      const normalized = `${url.origin}${url.pathname}`.replace(/\/$/, "");
      if (seen.has(normalized) || !intentPattern.test(url.pathname)) return false;
      seen.add(normalized);
      return true;
    })
    .sort((a, b) => {
      const score = (url: URL) => {
        if (/about|service|services/i.test(url.pathname)) return 0;
        if (/product|solution/i.test(url.pathname)) return 1;
        return 2;
      };
      return score(a) - score(b);
    })
    .slice(0, MAX_PAGES - 1);
}

export async function scrapeBusinessWebsite(rawUrl: string): Promise<WebsiteScrapeResult> {
  const initialUrl = normalizeWebsiteUrl(rawUrl);
  const homeResponse = await fetchHtml(initialUrl);
  const home = parsePage(homeResponse.html, homeResponse.finalUrl);
  const pages: ScrapedPage[] = [home];
  const detectedColors = new Set(home.colors);

  for (const candidate of rankCandidateLinks(home.links)) {
    try {
      const response = await fetchHtml(candidate);
      const page = parsePage(response.html, response.finalUrl);
      if (pages.some(existing => existing.url === page.url)) continue;
      pages.push(page);
      page.colors.forEach(color => detectedColors.add(color));
    } catch {
      // Secondary pages improve evidence but should not fail a valid homepage analysis.
    }
  }

  const text = pages
    .map(page => `PAGE: ${page.title || page.url}\n${page.text}`)
    .join("\n\n")
    .slice(0, MAX_TOTAL_TEXT);

  if (text.length < 120) {
    throw new WebsiteScrapeError("The website did not contain enough readable content to analyze.");
  }

  const colors = Array.from(detectedColors).slice(0, 12);
  const headings = pages.flatMap(page => page.headings).slice(0, 60);

  return {
    sourceUrl: homeResponse.finalUrl.toString(),
    title: home.title,
    description: home.description,
    text,
    detectedColors: colors,
    pages,
    metadata: {
      pageCount: pages.length,
      headings,
      detectedColors: colors,
      fetchedUrls: pages.map(page => page.url),
    },
  };
}
