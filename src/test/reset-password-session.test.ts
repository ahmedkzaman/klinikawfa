import { describe, expect, it } from "vitest";
import { resolveRecoverySessionState } from "@/lib/recovery-session";

describe("reset password recovery session state", () => {
  it("keeps a recovery-link session pending while Supabase processes the hash", () => {
    expect(
      resolveRecoverySessionState({
        session: null,
        hash: "#access_token=redacted&type=recovery",
      }),
    ).toBeNull();
  });
});
