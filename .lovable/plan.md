

# Update WhatsApp Link to Official Format

## Overview
Replace the third-party `wasap.my` shortener with the official WhatsApp `wa.me` URL format for better reliability and compatibility across all devices.

---

## Current Issue

The current WhatsApp link uses a third-party service:
```
http://www.wasap.my/60182523531
```

Problems with this approach:
- Uses `http` instead of `https` (security warning on some browsers)
- Relies on a third-party redirect service that may be blocked or down
- Not the official WhatsApp format

---

## Solution

Update to the official WhatsApp click-to-chat format:
```
https://wa.me/60182523531
```

Benefits:
- Direct link to WhatsApp servers
- Works reliably on mobile and desktop
- HTTPS secure connection
- No third-party dependency

---

## File to Modify

| File | Change |
|------|--------|
| `src/lib/constants.ts` | Update `whatsapp` value from `http://www.wasap.my/60182523531` to `https://wa.me/60182523531` |

---

## Impact

This single change will automatically update all WhatsApp buttons across the site:
- Footer WhatsApp link
- Mobile CTA bar
- Services page CTA
- Any other component using `CLINIC_INFO.whatsapp`

