export type MarketingConsentChoice = "accepted" | "rejected";

export type MarketingConsent =
  | { status: "unknown" }
  | {
      marketing: MarketingConsentChoice;
      status: "known";
      updatedAt: string;
      version: number;
    };

export type MarketingConsentSelection = {
  marketing: MarketingConsentChoice;
  version: number;
};
