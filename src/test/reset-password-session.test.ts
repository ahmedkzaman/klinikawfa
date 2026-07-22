import { describe, expect, it } from "vitest";
import { getRecoveryTokens, resolveRecoverySessionState } from "@/lib/recovery-session";

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

  it("extracts recovery tokens from the URL hash without exposing them", () => {
    expect(getRecoveryTokens('#access_token=access-value&refresh_token=refresh-value&type=recovery')).toEqual({
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
    });
  });
});
