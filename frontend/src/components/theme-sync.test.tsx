import { render } from "@/test/render";
import { afterEach, describe, expect, it } from "vitest";

import { THEME_INIT_SCRIPT, ThemeSync } from "./theme-sync";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("ThemeSync", () => {
  // Regression: the class used to be applied only by components that call
  // useTheme(), and after a refactor none of them stayed mounted (the
  // account menu items render only while the menu is open) -- a reload
  // showed light until the menu was opened.
  it("applies a stored dark theme without any other component mounted", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeSync />);
    expect(document.documentElement).toHaveClass("dark");
  });

  it("removes the class for a stored light theme", () => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.add("dark");
    render(<ThemeSync />);
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  // Runs in <head> before React, so a reload never flashes light first.
  it("sets the class from localStorage before hydration", () => {
    localStorage.setItem("theme", "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("leaves the class off for a stored light theme", () => {
    localStorage.setItem("theme", "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
