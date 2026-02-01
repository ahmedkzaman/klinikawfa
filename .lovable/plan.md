
# Fix: Payment Initiation Error

## Problem Identified
The payment fails because the `initiatePayment` function in `VideoCall.tsx` makes **two separate calls** to the `video-payment` edge function:

1. **First call** (the problem): `supabase.functions.invoke('video-payment')` - This call does NOT include the `?action=create-deposit` query parameter, so the edge function returns `{ error: "Invalid action" }` with status 400.

2. **Second call** (correct but never reached): A `fetch` call with the proper `?action=create-deposit` parameter.

The first call fails and throws an error before the second call can execute.

---

## Solution
Simplify the `initiatePayment` function to make a single, correct API call using `fetch` with the proper action parameter.

---

## File to Modify
`src/pages/VideoCall.tsx`

---

## Changes

### Remove the redundant first call and fix the payment initiation logic:

```typescript
const initiatePayment = async () => {
  if (!roomData) return;

  setIsLoading(true);
  try {
    const paymentUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-payment?action=create-deposit`;
    
    const response = await fetch(paymentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_code: roomData.room_code }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to create payment session');
    }
    
    if (result.url) {
      window.location.href = result.url;
    } else {
      throw new Error('Failed to create payment session');
    }
  } catch (error) {
    toast({
      title: language === 'ms' ? 'Ralat' : 'Error',
      description: error instanceof Error ? error.message : 'Failed to initiate payment',
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
  }
};
```

---

## Summary
This is a simple fix that removes the unnecessary first API call and keeps only the correct one with the `action=create-deposit` query parameter. After this fix, clicking "Pay Now" will properly redirect you to the Stripe checkout page.
