import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { createQueueRealtimeChannelName } from "@/hooks/clinic/useQueueEntries";

describe("queue realtime channel naming", () => {
  it("gives every mounted queue consumer a distinct channel", () => {
    const first = createQueueRealtimeChannelName();
    const second = createQueueRealtimeChannelName();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^clinic-queue-entries-sync-\d+$/);
    expect(second).toMatch(/^clinic-queue-entries-sync-\d+$/);
  });
});
