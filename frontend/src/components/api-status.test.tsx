import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";

import { ApiStatus } from "./api-status";

describe("ApiStatus", () => {
  it("shows loading, then connected on success", async () => {
    vi.spyOn(api, "getHealth").mockResolvedValue({ status: "ok" });

    render(<ApiStatus />);

    expect(screen.getByText("Checking API…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("API connected")).toBeInTheDocument(),
    );
  });

  it("shows unreachable on failure", async () => {
    vi.spyOn(api, "getHealth").mockRejectedValue(new Error("network error"));

    render(<ApiStatus />);

    await waitFor(() =>
      expect(screen.getByText("API unreachable")).toBeInTheDocument(),
    );
  });
});
