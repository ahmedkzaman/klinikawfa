import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  cleanupFails: false,
  upload: vi.fn(async () => ({ error: { message: "upload failed" } })),
  remove: vi.fn(async () => {
    mocks.calls.push("storage");
    return { error: null };
  }),
  rpc: vi.fn(async (name: string) => {
    mocks.calls.push(name);
    if (name === "permanently_delete_website_media") {
      return {
        data: { storage_bucket: "website-media", storage_path: "blog/photo.webp" },
        error: null,
      };
    }
    if (name === "discard_unstored_website_media" && mocks.cleanupFails) {
      return { data: null, error: { message: "cleanup failed" } };
    }
    return { data: null, error: null };
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "editor-user" } } }) },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "media-id" }, error: null }),
        }),
      }),
    }),
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove, upload: mocks.upload }) },
  },
}));

import { deleteMediaPermanently, uploadAndCreateMedia } from "@/features/website-cms/media/api";

describe("permanent media deletion", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.remove.mockClear();
    mocks.rpc.mockClear();
    mocks.upload.mockClear();
    mocks.cleanupFails = false;
  });

  it("uses the server authorization, removes Storage, then finalizes metadata", async () => {
    await deleteMediaPermanently("11111111-1111-4111-8111-111111111111");

    expect(mocks.calls).toEqual([
      "permanently_delete_website_media",
      "storage",
      "finalize_website_media_deletion",
    ]);
    expect(mocks.remove).toHaveBeenCalledWith(["blog/photo.webp"]);
  });

  it("does not claim rollback succeeded when failed-upload cleanup fails", async () => {
    mocks.cleanupFails = true;
    const file = new File(["video"], "clinic.mp4", { type: "video/mp4" });

    await expect(uploadAndCreateMedia(file, "home")).rejects.toThrow(
      "automatic cleanup could not be completed",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "discard_unstored_website_media",
      { p_media_id: "media-id" },
    );
  });
});
