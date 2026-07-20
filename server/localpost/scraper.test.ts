import { describe, expect, it } from "vitest";
import {
  isPrivateOrReservedIp,
  normalizeWebsiteUrl,
  rankCandidateLinks,
  WebsiteScrapeError,
} from "./scraper";

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
