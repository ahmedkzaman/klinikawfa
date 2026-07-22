import { describe, expect, it } from "vitest";
import { resolveRecoverySessionState } from "@/lib/recovery-session";

describe("reset password recovery session state", () => {
  it("allows the recovery form when a recovery token is present", () => {
    expect(
      resolveRecoverySessionState({
        session: null,
        hash: "#access_token=redacted&type=recovery",
      }),
    ).toBe(true);
  });

  it("rejects a page without a session or recovery token", () => {
    expect(
      resolveRecoverySessionState({
        session: null,
        hash: "",
      }),
    ).toBe(false);
  });
});
