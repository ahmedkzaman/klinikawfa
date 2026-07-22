import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrashActions } from "@/components/editor/content-list/TrashActions";
import { toMalaysiaDateTimeInput, toScheduleTimestamp } from "@/features/website-cms/api/lifecycle";
import * as lifecycleApi from "@/features/website-cms/api/lifecycle";

vi.mock("@/features/website-cms/api/lifecycle", async (load) => {
  const actual = await load<typeof import("@/features/website-cms/api/lifecycle")>();
  return { ...actual, restore: vi.fn(), permanentlyDelete: vi.fn() };
});

describe("website content lifecycle", () => {
  it("restores Trash content as Draft", async () => {
    vi.mocked(lifecycleApi.restore).mockResolvedValue({ status: "draft" });
    render(<TrashActions resourceId="3f1d9427-1f06-4e18-9bf1-d5dd1f242948" resourceType="page" />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(lifecycleApi.restore).toHaveBeenCalledWith("page", "3f1d9427-1f06-4e18-9bf1-d5dd1f242948"));
    expect(screen.getByText("Restored to Draft")).toBeVisible();
  });

  it("converts Malaysia-local scheduling time to UTC", () => {
    expect(toScheduleTimestamp("2026-07-24", "09:30", "Asia/Kuala_Lumpur")).toBe("2026-07-24T01:30:00.000Z");
    expect(toMalaysiaDateTimeInput("2026-07-24T01:30:00.000Z")).toBe("2026-07-24T09:30");
  });
});
