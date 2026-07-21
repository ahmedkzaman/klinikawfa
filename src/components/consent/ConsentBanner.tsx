import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  readMarketingConsent,
  writeMarketingConsent,
} from "@/features/consent/consentStore";
import type {
  MarketingConsent,
  MarketingConsentChoice,
} from "@/features/consent/types";

type ConsentBannerProps = {
  consentVersion: number;
  onConsentChange?: (consent: MarketingConsent) => void;
};

const acceptLabel = "Terima pemasaran / Accept marketing";
const rejectLabel = "Tolak pemasaran / Reject marketing";

export function ConsentBanner({
  consentVersion,
  onConsentChange,
}: ConsentBannerProps) {
  const [consent, setConsent] = useState<MarketingConsent>(() =>
    readMarketingConsent(consentVersion),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);

  const saveChoice = (marketing: MarketingConsentChoice) => {
    const nextConsent = writeMarketingConsent({
      marketing,
      version: consentVersion,
    });

    setConsent(nextConsent);
    setStorageFailed(nextConsent.status === "unknown");
    onConsentChange?.(nextConsent);

    if (nextConsent.status === "known") setSettingsOpen(false);
  };

  if (consent.status === "known") return null;

  return (
    <>
      <section
        aria-labelledby="marketing-consent-title"
        className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-5xl rounded-xl border bg-background p-5 shadow-xl"
      >
        <div className="space-y-2">
          <h2 id="marketing-consent-title" className="font-semibold">
            Pilihan privasi / Privacy choice
          </h2>
          <p className="text-sm text-muted-foreground">
            Kami menggunakan Google Analytics dan Google Ads hanya selepas anda
            memilih kuki pemasaran. Kuki yang perlu untuk laman ini sentiasa
            tersedia.
          </p>
          <p className="text-sm text-muted-foreground">
            We use Google Analytics and Google Ads only after you choose marketing
            cookies. Cookies necessary for this site remain available.
          </p>
          {storageFailed ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              Pilihan tidak dapat disimpan. Kuki pemasaran kekal dimatikan. / Your
              choice could not be saved. Marketing cookies remain off.
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button type="button" onClick={() => saveChoice("accepted")}>
            {acceptLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => saveChoice("rejected")}
          >
            {rejectLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSettingsOpen(true)}
          >
            Tetapan kuki / Cookie settings
          </Button>
        </div>
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Tetapan kuki pemasaran / Marketing cookie settings
            </DialogTitle>
            <DialogDescription>
              Kuki yang perlu kekal aktif supaya laman berfungsi. Marketing
              cookies are optional and remain off unless you accept them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              Google Analytics dan Google Ads hanya digunakan untuk pengukuran
              laman dan iklan selepas persetujuan anda.
            </p>
            <p>
              Google Analytics and Google Ads are used for site and advertising
              measurement only after your consent.
            </p>
            <p className="text-muted-foreground">
              Menarik balik pilihan menghentikan pengukuran seterusnya; ia tidak
              memadam data yang telah dihantar kepada Google. / Withdrawing your
              choice stops future measurement; it does not erase data already
              sent to Google.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={() => saveChoice("accepted")}>
              {acceptLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => saveChoice("rejected")}
            >
              {rejectLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
