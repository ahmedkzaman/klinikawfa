import { describe, expect, it } from "vitest";

import { deriveMyKadDemographics } from "@/lib/clinic/myKadDemographics";

describe("deriveMyKadDemographics", () => {
  it("derives a 2000s birth date and male gender from a valid MyKad", () => {
    expect(deriveMyKadDemographics("060309-11-0289", new Date("2026-08-11T00:00:00Z"))).toEqual({
      dateOfBirth: "2006-03-09",
      gender: "male",
    });
  });

  it("derives a 1900s birth date and female gender", () => {
    expect(deriveMyKadDemographics("900101010102", new Date("2026-08-11T00:00:00Z"))).toEqual({
      dateOfBirth: "1990-01-01",
      gender: "female",
    });
  });

  it.each(["", "ABC", "060231110289", "06030911028"])(
    "rejects an invalid or non-MyKad identifier: %s",
    (value) => expect(deriveMyKadDemographics(value, new Date("2026-08-11T00:00:00Z"))).toBeNull(),
  );
});
