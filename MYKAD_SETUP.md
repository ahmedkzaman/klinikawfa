# MyKad Bridge — Front Desk Setup & Recovery

This document describes how the local MyKad reader bridge is installed on front
desk workstations and what to do when the traffic-light indicator in the
registration dialog turns RED.

> The bridge is a small local HTTP service running on `127.0.0.1` that talks to
> the JPN card reader and exposes `/read-mykad` and `/health` endpoints to the
> Klinik Awfa web app.

---

## 1. Workstation Requirements

- **Expected Windows Version:** _<e.g. Windows 11 23H2 / Windows 10 LTSC 2021>_
- **CPU / RAM minimum:** _<e.g. Intel i3 8th gen / 8 GB RAM>_
- **Card reader hardware:** _<model name, e.g. ACS ACR38U-I1>_
- **USB port:** _<dedicated rear USB 2.0 port — avoid hubs>_
- **Browser:** _<Chrome 120+ or Edge 120+ — Firefox NOT supported>_

## 2. Silent Installer Dependencies

Install in the following order before deploying the bridge service:

- **.NET Framework:** _<version, e.g. .NET 8 Desktop Runtime x64>_
- **Visual C++ Redistributable:** _<year, e.g. VC++ 2015–2022 x64>_
- **PC/SC smart card service:** Windows built-in `SCardSvr` — set to Automatic.
- **JPN reader driver:** _<driver name + version>_
- **Bridge service version:** _<x.y.z>_
- **Silent install command:**
  ```
  msiexec /i mykad-bridge-<version>.msi /qn /norestart ALLUSERS=1
  ```

## 3. Browser Security Flags

The web app is served over HTTPS but the bridge runs on plain HTTP at loopback
addresses. The app first tries `localhost:8787`, then falls back to
`127.0.0.1:8787` for bridge services that bind only to IPv4 loopback. Chromium
treats loopback as a secure context, but some enterprise policies block
private-network requests -- set these flags once per workstation:

- `chrome://flags/#allow-insecure-localhost` → **Enabled**
- `chrome://flags/#block-insecure-private-network-requests` → **Disabled**
- Allowed origin for the bridge (Chrome enterprise policy):
  `https://klinikawfa.com`, `https://www.klinikawfa.com`

After changing flags, fully quit and relaunch the browser.

## 4. Restart Protocol (Front Desk Staff)

When the dot indicator in the **Register & Add to Queue** dialog is RED:

1. **Confirm** the dot is RED (hover the dot — tooltip should say "Reader offline").
2. **Unplug** the card reader USB cable, wait 5 seconds, plug it back in.
3. **Restart the bridge service:**
   - Press `Win + R`, type `services.msc`, press Enter.
   - Find _<service name, e.g. "Klinik Awfa MyKad Bridge">_, right-click → **Restart**.
4. **Reload the registration page** (`Ctrl + F5`).
5. If still RED after 60 seconds, **fall back to manual IC entry** (the text
   field is always editable) and notify IT.

> The app never blocks registration on the bridge — manual IC entry is always
> available. The dot is informational only.

## 5. Escalation

- **Tier 1 (clinic IT):** _<name / phone / WhatsApp>_
- **Tier 2 (vendor / integrator):** _<company / phone / email>_
- **After-hours hotline:** _<number>_

## 6. Change Log

- _<YYYY-MM-DD>_ — Initial document.
