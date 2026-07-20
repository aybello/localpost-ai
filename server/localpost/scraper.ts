import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_STYLESHEET_BYTES = 900_000;
const MAX_PAGE_TEXT = 14_000;
const MAX_TOTAL_TEXT = 32_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES = 4;
const MAX_STYLESHEETS = 4;
const MAX_DETECTED_COLORS = 12;

export type ColorEvidenceSource =
  | "theme-meta"
  | "css-variable"
  | "stylesheet"
  | "embedded-style"
  | "inline-style";

export type ColorEvidence = {
  color: string;
  source: ColorEvidenceSource;
  score: number;
  confidence: "high" | "medium" | "low";
  occurrences: number;
  contexts: string[];
};

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
    colorEvidence: ColorEvidence[];
    fetchedUrls: string[];
    fetchedStylesheets: string[];
  };
};

type ColorSignal = {
  color: string;
  source: ColorEvidenceSource;
  weight: number;
  context: string;
};

type ParsedPage = ScrapedPage & {
  colorSignals: ColorSignal[];
  links: URL[];
  stylesheets: URL[];
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

  if (!["http:", "https:"].includes(url.protocol)) {
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

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  tooLargeMessage: string
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > maxBytes) throw new WebsiteScrapeError(tooLargeMessage);
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new WebsiteScrapeError(tooLargeMessage);
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

      return {
        html: await readBoundedBody(
          response,
          MAX_PAGE_BYTES,
          "The website page exceeded the analysis size limit."
        ),
        finalUrl: currentUrl,
      };
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

async function fetchStylesheet(initialUrl: URL): Promise<{ css: string; finalUrl: URL }> {
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicDestination(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        headers: {
          accept: "text/css,text/plain;q=0.8,*/*;q=0.2",
          "user-agent": "LocalPostAI/1.0 (+website brand analysis)",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new WebsiteScrapeError("The stylesheet redirected too many times.");
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) throw new WebsiteScrapeError("The stylesheet could not be downloaded.");
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const appearsToBeCss = currentUrl.pathname.toLowerCase().endsWith(".css");
      if (
        !contentType.includes("text/css") &&
        !contentType.includes("text/plain") &&
        !appearsToBeCss
      ) {
        throw new WebsiteScrapeError("The linked resource was not a stylesheet.");
      }

      return {
        css: await readBoundedBody(
          response,
          MAX_STYLESHEET_BYTES,
          "The stylesheet exceeded the analysis size limit."
        ),
        finalUrl: currentUrl,
      };
    } catch (error) {
      if (error instanceof WebsiteScrapeError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WebsiteScrapeError("The stylesheet took too long to respond.");
      }
      throw new WebsiteScrapeError("The stylesheet could not be downloaded.");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new WebsiteScrapeError("The stylesheet could not be reached.");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function channelToHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase();
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

function parseAlpha(raw: string | undefined): number {
  if (!raw) return 1;
  const trimmed = raw.trim();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) return 1;
  return trimmed.endsWith("%") ? clamp(numeric / 100, 0, 1) : clamp(numeric, 0, 1);
}

function parseRgbChannel(raw: string): number | undefined {
  const trimmed = raw.trim();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) return undefined;
  return trimmed.endsWith("%")
    ? clamp((numeric / 100) * 255, 0, 255)
    : clamp(numeric, 0, 255);
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;
  const sat = clamp(saturation, 0, 1);
  const light = clamp(lightness, 0, 1);

  if (sat === 0) {
    const gray = light * 255;
    return [gray, gray, gray];
  }

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const hueToRgb = (offset: number) => {
    let value = offset;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  return [
    hueToRgb(normalizedHue + 1 / 3) * 255,
    hueToRgb(normalizedHue) * 255,
    hueToRgb(normalizedHue - 1 / 3) * 255,
  ];
}

export function normalizeCssColor(rawValue: string): { color: string; alpha: number } | undefined {
  const value = rawValue.trim();
  const hexMatch = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const rawHex = hexMatch[1];
    if (!rawHex) return undefined;
    const expanded = rawHex.length === 3 || rawHex.length === 4
      ? rawHex.split("").map(character => `${character}${character}`).join("")
      : rawHex;
    if (![6, 8].includes(expanded.length)) return undefined;
    const alpha = expanded.length === 8
      ? Number.parseInt(expanded.slice(6, 8), 16) / 255
      : 1;
    return { color: `#${expanded.slice(0, 6).toUpperCase()}`, alpha };
  }

  const rgbMatch = value.match(/^rgba?\((.*)\)$/i);
  if (rgbMatch?.[1]) {
    const body = rgbMatch[1].trim();
    const [channelPart = "", slashAlpha] = body.split("/").map(part => part.trim());
    const parts = channelPart.includes(",")
      ? channelPart.split(",").map(part => part.trim())
      : channelPart.split(/\s+/).filter(Boolean);
    const alphaToken = slashAlpha ?? (parts.length === 4 ? parts.pop() : undefined);
    if (parts.length !== 3) return undefined;
    const channels = parts.map(parseRgbChannel);
    if (channels.some(channel => channel === undefined)) return undefined;
    return {
      color: rgbToHex(channels[0]!, channels[1]!, channels[2]!),
      alpha: parseAlpha(alphaToken),
    };
  }

  const hslMatch = value.match(/^hsla?\((.*)\)$/i);
  if (hslMatch?.[1]) {
    const body = hslMatch[1].trim();
    const [channelPart = "", slashAlpha] = body.split("/").map(part => part.trim());
    const parts = channelPart.includes(",")
      ? channelPart.split(",").map(part => part.trim())
      : channelPart.split(/\s+/).filter(Boolean);
    const alphaToken = slashAlpha ?? (parts.length === 4 ? parts.pop() : undefined);
    if (parts.length !== 3) return undefined;
    const hue = Number.parseFloat(parts[0] ?? "");
    const saturation = Number.parseFloat(parts[1] ?? "") / 100;
    const lightness = Number.parseFloat(parts[2] ?? "") / 100;
    if (![hue, saturation, lightness].every(Number.isFinite)) return undefined;
    const [red, green, blue] = hslToRgb(hue, saturation, lightness);
    return { color: rgbToHex(red, green, blue), alpha: parseAlpha(alphaToken) };
  }

  return undefined;
}

function hexChannels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

export function neutralWeight(color: string): number {
  const [red, green, blue] = hexChannels(color);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if ((maximum <= 5 && chroma <= 3) || (minimum >= 250 && chroma <= 3)) return 0;
  if (lightness >= 250) return chroma >= 20 ? 0.28 : 0.08;
  if (lightness >= 245) return chroma >= 20 ? 0.5 : 0.18;
  if (lightness >= 238) return chroma >= 18 ? 0.72 : 0.38;
  if (chroma <= 4 && lightness <= 12) return 0.08;
  if (chroma <= 6) return 0.28;
  if (chroma <= 10) return 0.58;
  return 1;
}

function isUtilityColorVariable(property: string): boolean {
  return (
    property.startsWith("--tw-") ||
    /^--color-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d+$/i.test(property)
  );
}

function semanticWeight(context: string, property: string): number {
  const combined = `${context} ${property}`.toLowerCase();
  let score = 0;
  if (/brand|primary|accent|secondary|highlight|signature/.test(combined)) score += 60;
  if (/logo|hero|cta|call-to-action|button|\bbtn\b/.test(combined)) score += 34;
  if (/header|nav|heading|headline|title/.test(combined)) score += 18;
  if (/background|color|fill|stroke/.test(property.toLowerCase())) score += 8;
  return score;
}

function sourceWeight(source: ColorEvidenceSource): number {
  switch (source) {
    case "theme-meta":
      return 130;
    case "css-variable":
      return 70;
    case "inline-style":
      return 48;
    case "embedded-style":
      return 36;
    case "stylesheet":
      return 28;
  }
}

function extractColorTokens(value: string): string[] {
  return value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]{3,100}\)|hsla?\([^)]{3,100}\)/gi) ?? [];
}

function colorSignalsFromDeclaration(
  property: string,
  value: string,
  context: string,
  defaultSource: ColorEvidenceSource
): ColorSignal[] {
  if (isUtilityColorVariable(property)) return [];
  const propertyLower = property.toLowerCase();
  const isCustomProperty = propertyLower.startsWith("--");
  const isColorBearingProperty =
    isCustomProperty ||
    /^(?:color|background|background-color|border(?:-[a-z]+)*-color|outline-color|text-decoration-color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color)$/.test(propertyLower);
  if (!isColorBearingProperty) return [];

  const source: ColorEvidenceSource = isCustomProperty ? "css-variable" : defaultSource;
  const semantic = semanticWeight(context, propertyLower);

  return extractColorTokens(value).flatMap(token => {
    const normalized = normalizeCssColor(token);
    if (!normalized || normalized.alpha < 0.18) return [];
    const neutral = neutralWeight(normalized.color);
    if (neutral === 0) return [];
    return [{
      color: normalized.color,
      source,
      weight: (sourceWeight(source) + semantic) * neutral * Math.max(0.35, normalized.alpha),
      context: `${context} ${property}`.replace(/\s+/g, " ").trim().slice(0, 180),
    }];
  });
}

function extractDeclarationSignals(
  declarations: string,
  context: string,
  source: ColorEvidenceSource
): ColorSignal[] {
  const signals: ColorSignal[] = [];
  const declarationPattern = /([\w-]+)\s*:\s*([^;{}]+)/g;
  let declaration: RegExpExecArray | null;

  while ((declaration = declarationPattern.exec(declarations)) !== null) {
    signals.push(
      ...colorSignalsFromDeclaration(
        declaration[1] ?? "",
        declaration[2] ?? "",
        context,
        source
      )
    );
  }
  return signals;
}

function extractCssSignals(css: string, source: ColorEvidenceSource): ColorSignal[] {
  const signals: ColorSignal[] = [];
  const declarationPattern = /([\w-]+)\s*:\s*([^;{}]+)/g;
  let declaration: RegExpExecArray | null;

  while ((declaration = declarationPattern.exec(css)) !== null) {
    const declarationIndex = declaration.index;
    const openBrace = css.lastIndexOf("{", declarationIndex);
    const previousClose = css.lastIndexOf("}", openBrace);
    const selector = openBrace >= 0
      ? css.slice(previousClose + 1, openBrace).replace(/\s+/g, " ").trim().slice(-140)
      : "stylesheet";
    signals.push(
      ...colorSignalsFromDeclaration(
        declaration[1] ?? "",
        declaration[2] ?? "",
        selector || "stylesheet",
        source
      )
    );
  }

  return signals;
}

function sourcePriority(source: ColorEvidenceSource): number {
  switch (source) {
    case "theme-meta":
      return 5;
    case "css-variable":
      return 4;
    case "inline-style":
      return 3;
    case "embedded-style":
      return 2;
    case "stylesheet":
      return 1;
  }
}

function finalizeColorEvidence(signals: ColorSignal[]): ColorEvidence[] {
  const grouped = new Map<
    string,
    {
      rawScore: number;
      occurrences: number;
      contexts: Set<string>;
      source: ColorEvidenceSource;
      sourcePeak: number;
    }
  >();

  for (const signal of signals) {
    const existing = grouped.get(signal.color) ?? {
      rawScore: 0,
      occurrences: 0,
      contexts: new Set<string>(),
      source: signal.source,
      sourcePeak: signal.weight,
    };
    existing.rawScore += signal.weight;
    existing.occurrences += 1;
    if (signal.context) existing.contexts.add(signal.context);
    if (
      signal.weight > existing.sourcePeak ||
      (signal.weight === existing.sourcePeak &&
        sourcePriority(signal.source) > sourcePriority(existing.source))
    ) {
      existing.source = signal.source;
      existing.sourcePeak = signal.weight;
    }
    grouped.set(signal.color, existing);
  }

  const ordered = Array.from(grouped.entries())
    .map(([color, value]) => ({ color, ...value }))
    .filter(value => value.rawScore >= 8)
    .sort((a, b) => b.rawScore - a.rawScore || b.occurrences - a.occurrences);
  const maximum = ordered[0]?.rawScore ?? 1;

  return ordered.map(value => {
    const score = clamp(Math.round(38 + 60 * Math.sqrt(value.rawScore / maximum)), 0, 98);
    return {
      color: value.color,
      source: value.source,
      score,
      confidence: score >= 76 ? "high" : score >= 60 ? "medium" : "low",
      occurrences: value.occurrences,
      contexts: Array.from(value.contexts).slice(0, 4),
    };
  });
}

export function extractColorEvidenceFromCss(css: string): ColorEvidence[] {
  return finalizeColorEvidence(extractCssSignals(css, "stylesheet"));
}

function collectPageColorSignals(html: string, $: cheerio.CheerioAPI): ColorSignal[] {
  const signals: ColorSignal[] = [];
  const themeColor = $('meta[name="theme-color"]').attr("content");
  if (themeColor) {
    const normalized = normalizeCssColor(themeColor);
    if (normalized && normalized.alpha >= 0.18 && neutralWeight(normalized.color) > 0) {
      signals.push({
        color: normalized.color,
        source: "theme-meta",
        weight: sourceWeight("theme-meta") * neutralWeight(normalized.color),
        context: "meta theme-color",
      });
    }
  }

  $("style").each((_, element) => {
    signals.push(...extractCssSignals($(element).html() ?? "", "embedded-style"));
  });

  $("[style]").each((_, element) => {
    const tag = element.tagName || "element";
    const id = $(element).attr("id");
    const classes = ($(element).attr("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 3);
    const context = [tag, id ? `#${id}` : "", ...classes.map(name => `.${name}`)]
      .filter(Boolean)
      .join("");
    signals.push(
      ...extractDeclarationSignals(
        $(element).attr("style") ?? "",
        context || "inline element",
        "inline-style"
      )
    );
  });

  return signals;
}

function parsePage(html: string, url: URL): ParsedPage {
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
  const colorSignals = collectPageColorSignals(html, $);
  const links: URL[] = [];
  const stylesheets: URL[] = [];

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

  $('link[rel~="stylesheet"][href]').each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const candidate = new URL(href, url);
      candidate.hash = "";
      if (["http:", "https:"].includes(candidate.protocol)) stylesheets.push(candidate);
    } catch {
      // Ignore malformed stylesheet links found in untrusted markup.
    }
  });

  $("script, style, noscript, svg, iframe, form, nav, footer").remove();
  const bodyText = normalizeText($("main").text() || $("article").text() || $("body").text());
  const text = [description, ...headings, bodyText]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PAGE_TEXT);

  return { url: url.toString(), title, description, headings, text, colorSignals, links, stylesheets };
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

function registrableSiteHint(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

function isLikelyFirstPartyStylesheet(stylesheet: URL, page: URL): boolean {
  return (
    stylesheet.origin === page.origin ||
    registrableSiteHint(stylesheet.hostname) === registrableSiteHint(page.hostname)
  );
}

export async function scrapeBusinessWebsite(rawUrl: string): Promise<WebsiteScrapeResult> {
  const initialUrl = normalizeWebsiteUrl(rawUrl);
  const homeResponse = await fetchHtml(initialUrl);
  const home = parsePage(homeResponse.html, homeResponse.finalUrl);
  const parsedPages: ParsedPage[] = [home];

  for (const candidate of rankCandidateLinks(home.links)) {
    try {
      const response = await fetchHtml(candidate);
      const page = parsePage(response.html, response.finalUrl);
      if (parsedPages.some(existing => existing.url === page.url)) continue;
      parsedPages.push(page);
    } catch {
      // Secondary pages improve evidence but should not fail a valid homepage analysis.
    }
  }

  const stylesheetUrls: URL[] = [];
  const seenStylesheets = new Set<string>();
  for (const page of parsedPages) {
    const pageUrl = new URL(page.url);
    for (const stylesheet of page.stylesheets) {
      if (!isLikelyFirstPartyStylesheet(stylesheet, pageUrl)) continue;
      const key = stylesheet.toString();
      if (seenStylesheets.has(key)) continue;
      seenStylesheets.add(key);
      stylesheetUrls.push(stylesheet);
    }
  }

  const allSignals = parsedPages.flatMap(page => page.colorSignals);
  const fetchedStylesheets: string[] = [];
  for (const stylesheetUrl of stylesheetUrls.slice(0, MAX_STYLESHEETS)) {
    try {
      const stylesheet = await fetchStylesheet(stylesheetUrl);
      fetchedStylesheets.push(stylesheet.finalUrl.toString());
      allSignals.push(...extractCssSignals(stylesheet.css, "stylesheet"));
    } catch {
      // Stylesheet evidence improves brand accuracy but is not required for text analysis.
    }
  }

  const colorEvidence = finalizeColorEvidence(allSignals).slice(0, MAX_DETECTED_COLORS);
  const colors = colorEvidence.map(item => item.color);
  const pages: ScrapedPage[] = parsedPages.map(
    ({ colorSignals: _colorSignals, links: _links, stylesheets: _stylesheets, ...page }) => page
  );
  const text = pages
    .map(page => `PAGE: ${page.title || page.url}\n${page.text}`)
    .join("\n\n")
    .slice(0, MAX_TOTAL_TEXT);

  if (text.length < 120) {
    throw new WebsiteScrapeError("The website did not contain enough readable content to analyze.");
  }

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
      colorEvidence,
      fetchedUrls: pages.map(page => page.url),
      fetchedStylesheets,
    },
  };
}
