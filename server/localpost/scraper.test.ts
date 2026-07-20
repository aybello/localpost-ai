import { afterEach, describe, expect, it, vi } from "vitest";

const dnsLookup = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
);

vi.mock("node:dns/promises", () => ({ lookup: dnsLookup }));

import {
  extractColorEvidenceFromCss,
  isPrivateOrReservedIp,
  neutralWeight,
  normalizeCssColor,
  normalizeWebsiteUrl,
  rankCandidateLinks,
  scrapeBusinessWebsite,
  WebsiteScrapeError,
} from "./scraper";

afterEach(() => {
  vi.restoreAllMocks();
  dnsLookup.mockReset();
  dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

describe("website scraper safety", () => {
  it("normalizes public website inputs and removes fragments", () => {
    expect(normalizeWebsiteUrl("example.com/about#team").toString()).toBe(
      "https://example.com/about"
    );
    expect(normalizeWebsiteUrl("http://example.com/").protocol).toBe("http:");
  });

  it("rejects credentials and non-web schemes", () => {
    expect(() => normalizeWebsiteUrl("https://user:secret@example.com")).toThrow(
      WebsiteScrapeError
    );
    expect(() => normalizeWebsiteUrl("ftp://example.com/file")).toThrow(
      "Only HTTP and HTTPS websites can be analyzed."
    );
    expect(() => normalizeWebsiteUrl("file:///etc/passwd")).toThrow(
      "Only HTTP and HTTPS websites can be analyzed."
    );
  });

  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.4",
    "172.16.0.1",
    "192.0.0.8",
    "192.0.2.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.20",
    "203.0.113.9",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("blocks private or reserved destination %s", address => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public destination %s",
    address => {
      expect(isPrivateOrReservedIp(address)).toBe(false);
    }
  );

  it("prioritizes useful same-site brand evidence links and deduplicates them", () => {
    const links = [
      new URL("https://example.com/contact"),
      new URL("https://example.com/blog/post"),
      new URL("https://example.com/services"),
      new URL("https://example.com/about"),
      new URL("https://example.com/about#team"),
      new URL("https://example.com/products"),
    ];

    expect(rankCandidateLinks(links).map(url => url.pathname)).toEqual([
      "/services",
      "/about",
      "/products",
    ]);
  });
});

describe("brand color extraction", () => {
  it.each([
    ["#4a7", "#44AA77", 1],
    ["#4a7c", "#44AA77", 0.8],
    ["#4a7c59", "#4A7C59", 1],
    ["#4a7c5980", "#4A7C59", 128 / 255],
    ["rgb(74, 124, 89)", "#4A7C59", 1],
    ["rgba(74, 124, 89, 0.5)", "#4A7C59", 0.5],
    ["rgb(74 124 89 / 50%)", "#4A7C59", 0.5],
    ["hsl(0, 100%, 50%)", "#FF0000", 1],
    ["hsla(120, 100%, 25%, 0.25)", "#008000", 0.25],
  ])("normalizes %s to six-digit hex with alpha", (raw, color, alpha) => {
    const normalized = normalizeCssColor(raw);
    expect(normalized?.color).toBe(color);
    expect(normalized?.alpha).toBeCloseTo(alpha, 5);
  });

  it("rejects unsupported and malformed color values", () => {
    expect(normalizeCssColor("transparent")).toBeUndefined();
    expect(normalizeCssColor("#12")).toBeUndefined();
    expect(normalizeCssColor("rgb(1, 2)")).toBeUndefined();
  });

  it("suppresses near-black, near-white, and generic gray while preserving chromatic colors", () => {
    expect(neutralWeight("#000000")).toBe(0);
    expect(neutralWeight("#FFFFFF")).toBe(0);
    expect(neutralWeight("#FAFAFA")).toBe(0);
    expect(neutralWeight("#808080")).toBeLessThan(0.5);
    expect(neutralWeight("#4A7C59")).toBe(1);
    expect(neutralWeight("#D4A853")).toBe(1);
  });

  it("extracts CSS variables and color declarations while filtering neutrals, utilities, and transparent values", () => {
    const evidence = extractColorEvidenceFromCss(`
      :root {
        --brand-primary: #4a7c59;
        --brand-accent: rgb(212, 168, 83);
        --surface: #fff;
        --ink: #000;
        --tw-ring-color: #2563eb;
      }
      .hero { background-color: #4A7C59; }
      .button { border-color: rgba(212, 168, 83, 0.8); }
      .overlay { color: rgba(200, 80, 90, 0.05); }
    `);

    expect(evidence.map(item => item.color)).toEqual(
      expect.arrayContaining(["#4A7C59", "#D4A853"])
    );
    expect(evidence.map(item => item.color)).not.toEqual(
      expect.arrayContaining(["#FFFFFF", "#000000", "#2563EB", "#C8505A"])
    );
    expect(evidence.find(item => item.color === "#4A7C59")).toMatchObject({
      source: "css-variable",
      occurrences: 2,
    });
  });

  it("normalizes duplicate formats to one color and retains the strongest source", () => {
    const evidence = extractColorEvidenceFromCss(`
      :root { --brand-primary: #abc; }
      .hero { color: #AABBCC; }
      .button { background-color: rgb(170, 187, 204); }
    `);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      color: "#AABBCC",
      source: "css-variable",
      occurrences: 3,
    });
  });

  it("ranks semantically named brand variables ahead of repeated generic declarations", () => {
    const evidence = extractColorEvidenceFromCss(`
      :root { --brand-primary: #4A7C59; }
      .utility-one { color: #123456; }
      .utility-two { border-color: #123456; }
      .utility-three { background-color: #123456; }
    `);

    expect(evidence[0]?.color).toBe("#4A7C59");
    expect(evidence[0]?.score).toBeGreaterThan(evidence[1]?.score ?? 0);
  });

  it("fetches and ranks colors from a linked first-party stylesheet", async () => {
    const homepage = `<!doctype html>
      <html>
        <head>
          <title>North Star Wellness</title>
          <meta name="description" content="An inclusive neighborhood wellness studio with movement, education, and community programs." />
          <link rel="stylesheet" href="/assets/brand.css" />
        </head>
        <body>
          <main>
            <h1>Movement and wellness for the whole community</h1>
            <p>Join accessible classes, supportive workshops, and welcoming local events designed to build confidence, connection, and sustainable wellbeing for every participant.</p>
          </main>
        </body>
      </html>`;
    const stylesheet = `
      .hero { background-color: #8B2252; color: rgb(242, 160, 184); }
      .primary-button { background-color: #8B2252; border-color: #F2A0B8; }
      .panel { border-color: #8B2252; }
      .surface { background-color: #ffffff; }
    `;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = input instanceof URL
        ? input.toString()
        : typeof input === "string"
          ? input
          : input.url;
      if (url === "https://example.com/") {
        return new Response(homepage, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url === "https://example.com/assets/brand.css") {
        return new Response(stylesheet, {
          status: 200,
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await scrapeBusinessWebsite("https://example.com");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.metadata.fetchedStylesheets).toEqual([
      "https://example.com/assets/brand.css",
    ]);
    expect(result.detectedColors.slice(0, 2)).toEqual(["#8B2252", "#F2A0B8"]);
    expect(result.metadata.colorEvidence[0]).toMatchObject({
      color: "#8B2252",
      source: "stylesheet",
      confidence: "high",
      occurrences: 3,
    });
    expect(result.detectedColors).not.toContain("#FFFFFF");
  });
});
