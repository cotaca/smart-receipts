import { describe, expect, it } from "vitest";

import { checkPassword, isValidEmail, isValidPassword } from "./password";

describe("checkPassword", () => {
  it("checks each rule on its own", () => {
    expect(checkPassword("Ab1-xyz").length).toBe(false);
    expect(checkPassword("Ab1-xyzz").length).toBe(true);
    expect(checkPassword("abc").upper).toBe(false);
    expect(checkPassword("aBc").upper).toBe(true);
    expect(checkPassword("ABC").lower).toBe(false);
    expect(checkPassword("aBC").lower).toBe(true);
    expect(checkPassword("abc").digit).toBe(false);
    expect(checkPassword("ab1").digit).toBe(true);
    expect(checkPassword("abc1").special).toBe(false);
    expect(checkPassword("abc!").special).toBe(true);
  });

  it("classifies Unicode like the backend", () => {
    expect(checkPassword("Ä").upper).toBe(true);
    expect(checkPassword("ß").lower).toBe(true);
    expect(checkPassword("€").special).toBe(true);
    expect(checkPassword(" ").special).toBe(true);
    expect(checkPassword("😀").special).toBe(true);
  });

  it("counts length in characters and the limit in bytes", () => {
    expect(checkPassword("😀".repeat(8)).length).toBe(true);
    expect(checkPassword("ä".repeat(36)).tooLong).toBe(false);
    expect(checkPassword("ä".repeat(37)).tooLong).toBe(true);
  });
});

describe("isValidPassword", () => {
  it("accepts a compliant password and rejects weak or overlong ones", () => {
    expect(isValidPassword("Kassenbon-2026")).toBe(true);
    expect(isValidPassword("Äpfel-und-1")).toBe(true);
    expect(isValidPassword("kassenbon-2026")).toBe(false);
    expect(isValidPassword("Aa1-" + "ä".repeat(37))).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("needs a dot in the domain", () => {
    expect(isValidEmail("anna@web.de")).toBe(true);
    expect(isValidEmail("anna@web")).toBe(false);
    expect(isValidEmail("anna web@x.de")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
