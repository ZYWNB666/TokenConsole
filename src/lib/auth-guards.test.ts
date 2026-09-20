import { describe, expect, it } from "vitest";

import { sanitizeReturnTo } from "@/lib/auth-guards";
import { CONSOLE_PATHS } from "@/lib/console-paths";
import { consoleRoutes } from "@/lib/navigation";

describe("sanitizeReturnTo (open-redirect protection)", () => {
  it("accepts plain site-relative paths", () => {
    expect(sanitizeReturnTo("/overview")).toBe("/overview");
    expect(sanitizeReturnTo("/billing?tab=invoices")).toBe("/billing?tab=invoices");
    expect(sanitizeReturnTo("/api-keys")).toBe("/api-keys");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeReturnTo("//evil.example")).toBe("/overview");
    expect(sanitizeReturnTo("//evil.example/path")).toBe("/overview");
    expect(sanitizeReturnTo("/\\evil.example")).toBe("/overview");
  });

  it("rejects absolute and scheme-carrying URLs", () => {
    expect(sanitizeReturnTo("https://evil.example")).toBe("/overview");
    expect(sanitizeReturnTo("http://evil.example")).toBe("/overview");
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/overview");
    expect(sanitizeReturnTo("/redirect?to=https://evil.example")).toBe("/overview");
  });

  it("rejects empty, relative and malformed inputs", () => {
    expect(sanitizeReturnTo(null)).toBe("/overview");
    expect(sanitizeReturnTo("")).toBe("/overview");
    expect(sanitizeReturnTo("overview")).toBe("/overview");
    expect(sanitizeReturnTo("/ok\nLocation: x")).toBe("/overview");
    expect(sanitizeReturnTo("/ok\rX")).toBe("/overview");
  });
});

describe("console path registry consistency", () => {
  it("matches the navigation metadata (used by the protection integration test)", () => {
    expect([...CONSOLE_PATHS].sort()).toEqual(
      consoleRoutes.map((route) => route.href).sort(),
    );
  });
});
