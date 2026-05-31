# MyKad Light Hardening + Fallback UI

Retain the existing localhost MyKad bridge but make the UI resilient when it's unreachable. No new reader implementation.

## 1. New polling hook — `src/hooks/useMyKadBridge.ts`

```ts
type BridgeStatus = 'connected_card_ready' | 'connected_no_card' | 'disconnected';
export function useMyKadBridge(intervalMs = 10_000): { status: BridgeStatus }
```

Behavior:
- On mount, immediately ping bridge status URL, then `setInterval` every 10s. Clean up on unmount.
- Endpoint: derive from `VITE_MYKAD_BRIDGE_URL` (replace trailing `/read-mykad` with `/status`); fallback to `http://127.0.0.1:8787/status`.
- Use `fetch(url, { signal: AbortSignal.timeout(2000) })`. Wrap the whole call in `try/catch` and return `'disconnected'` on any throw — no `console.error`/`console.warn` (silent).
- Parse JSON `{ card_present: boolean }` (or similar). Map:
  - HTTP ok + `card_present === true` → `connected_card_ready`
  - HTTP ok + `card_present === false` → `connected_no_card`
  - Any network/timeout/non-ok → `disconnected`
- Pause polling while `document.hidden` to avoid background spam; resume on `visibilitychange`.

## 2. Fortify `src/components/clinic/RegisterAndCheckInDialog.tsx`

- **Traffic-light dot** in the `DialogHeader` row (right of `DialogTitle`):
  - 8px circle: green / amber / red based on hook status, with `title` tooltip ("MyKad reader ready" / "Reader connected, no card" / "Reader offline — type IC manually").
- **IC input is always first-class**: keep the existing manual `Input` visible and labelled regardless of bridge state. Never hide it behind a tab or "Reader Failed" panel.
- **Accelerator button** next to the IC input: replace/augment the existing `ReadMyKadButton` usage with an inline button that:
  1. Calls `readMyKad()` from `useMyKadReader` wrapped in `Promise.race([readMyKad(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))])`.
  2. On success → autofill fields (existing logic preserved).
  3. On timeout/error → **no modal popup, no blocking toast**. Use a single low-intrusion `toast.message()` (auto-dismiss) at most, and immediately call `icInputRef.current?.focus()` and `select()` so the cashier can type without an extra click.
- Add `const icInputRef = useRef<HTMLInputElement>(null)` and wire it to the IC `<Input ref={icInputRef} id="ic-input" />`.
- Disable the accelerator button only while a read is in flight; do **not** disable it when status is `disconnected` — clicking it will just trigger the 3s timeout + focus fallback, which is the desired graceful degradation.

Internals only — no schema, backend, or RPC changes. Existing `useMyKadReader` and `ReadMyKadButton` helpers remain; this dialog stops relying on `ReadMyKadButton` for the in-dialog UX and uses an inline button so it can own the timeout + focus behavior. `ReadMyKadButton` stays for other call sites.

## 3. Disaster recovery doc — `MYKAD_SETUP.md` (repo root)

Structured template with placeholders:

```
# MyKad Bridge — Front Desk Setup & Recovery

## 1. Workstation Requirements
- Expected Windows Version: <e.g. Windows 11 23H2 / Windows 10 LTSC 2021>
- Reader hardware: <model, USB port>

## 2. Silent Installer Dependencies
- .NET Framework: <version>
- Visual C++ Redistributable: <version>
- Bridge service version: <x.y.z>
- Install command: <silent flags>

## 3. Browser Security Flags (Chrome / Edge)
- chrome://flags/#allow-insecure-localhost → Enabled
- chrome://flags/#block-insecure-private-network-requests → Disabled
- Allowed origin for mixed content: https://klinikawfa.com

## 4. Restart Protocol (Front Desk Staff)
1. Confirm the dot indicator in the registration dialog is RED.
2. Unplug the card reader USB cable, wait 5 seconds, plug back in.
3. Open Services.msc → restart "Klinik Awfa MyKad Bridge".
4. Reload the registration page (Ctrl+F5).
5. If still RED after 60 seconds, fall back to manual IC entry and notify IT.

## 5. Escalation
- Tier 1: <name / phone>
- Tier 2: <vendor support contact>
```

## Files touched

- **Create** `src/hooks/useMyKadBridge.ts`
- **Create** `MYKAD_SETUP.md`
- **Edit** `src/components/clinic/RegisterAndCheckInDialog.tsx` (status dot, IC ref, inline Read button with 3s race + focus fallback)

## Out of scope

- No WebUSB / PC/SC implementation.
- No changes to `useMyKadReader.ts`, `ReadMyKadButton.tsx`, or other call sites.
- No bridge-side code, installers, or backend changes.
