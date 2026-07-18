import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }


  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: "Stripe API key not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const url = new URL(req.url);
    const action = url.searchParams.get("action"); // POST: Create deposit checkout session (for patients)

    if (req.method === "POST" && action === "create-deposit") {
      const body = await req.json();
      const { room_code } = body;

      if (!room_code) {
        return new Response(JSON.stringify({ error: "Room code is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      } // Get room details

      const { data: room, error: roomError } = await supabaseClient
        .from("video_rooms")
        .select("id, room_code, status, deposit_amount, patient_email")
        .eq("room_code", room_code.toUpperCase())
        .single();


      if (roomError || !room) {
        return new Response(JSON.stringify({ error: "Room not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (room.status !== "pending") {
        return new Response(JSON.stringify({ error: "Deposit already paid or room unavailable" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      } // Create Stripe checkout session

      const origin = (Deno.env.get("SITE_URL") || "https://klinikawfa.com").replace(/\/$/, "");
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "fpx", "grabpay"],
        line_items: [
          {
            price_data: {
              currency: "myr",
              product_data: {
                name: "Video Consultation Deposit",
                description: "Deposit for video consultation (covers first 10 minutes)",
              },
              unit_amount: room.deposit_amount, // RM50 in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/video-call?room=${room.room_code}&payment=success`,
        cancel_url: `${origin}/video-call?room=${room.room_code}&payment=cancelled`,
        metadata: {
          room_id: room.id,
          payment_type: "deposit",
        },
        customer_email: room.patient_email || undefined,
      }); // Create payment record

      await supabaseClient.from("video_payments").insert({
        room_id: room.id,
        payment_type: "deposit",
        amount: room.deposit_amount,
        stripe_checkout_session_id: session.id,
        status: "pending",
      });

      console.log("checkout_created", { room_id: room.id, session_id: session.id });


      return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } // POST: Process additional charges after call ends (staff only)

    if (req.method === "POST" && action === "charge-additional") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Authorization required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseClient.auth.getUser(token);
      if (!userData.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      const { data: roleRow, error: roleError } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      const allowedRoles = new Set([
        "staff", "ops_staff", "operations", "admin", "special_admin", "doctor_admin",
      ]);
      if (roleError || !roleRow?.role || !allowedRoles.has(roleRow.role)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const body = await req.json();
      const { room_id, duration_seconds } = body;

      if (!room_id || duration_seconds === undefined) {
        return new Response(JSON.stringify({ error: "Room ID and duration are required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      } // Get room details

      const { data: room, error: roomError } = await supabaseClient
        .from("video_rooms")
        .select("id, deposit_amount, per_minute_rate")
        .eq("id", room_id)
        .single();


      if (roomError || !room) {
        return new Response(JSON.stringify({ error: "Room not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      } // Calculate charges

      const totalMinutes = Math.ceil(duration_seconds / 60);
      const freeMinutes = 10; // Deposit covers first 10 minutes
      const chargeableMinutes = Math.max(0, totalMinutes - freeMinutes);
      const additionalAmount = chargeableMinutes * room.per_minute_rate; // Update room with final amounts

      await supabaseClient
        .from("video_rooms")
        .update({
          total_duration_seconds: duration_seconds,
          total_amount: room.deposit_amount + additionalAmount,
          status: "ended",
        })
        .eq("id", room_id);

      const result = {
        total_minutes: totalMinutes,
        free_minutes: freeMinutes,
        chargeable_minutes: chargeableMinutes,
        deposit_amount: room.deposit_amount,
        additional_amount: additionalAmount,
        total_amount: room.deposit_amount + additionalAmount,
        needs_additional_payment: additionalAmount > 0,
      };

      console.log("call_ended", { room_id, totalMinutes, additionalAmount });


      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } // GET: Verify payment status

    if (req.method === "GET" && action === "verify") {
      const sessionId = url.searchParams.get("session_id");
      const roomCode = url.searchParams.get("room_code");

      if (!sessionId && !roomCode) {
        return new Response(JSON.stringify({ error: "Session ID or room code required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          // Update payment and room status
          await supabaseClient
            .from("video_payments")
            .update({
              status: "succeeded",
              stripe_payment_intent_id: session.payment_intent as string,
            })
            .eq("stripe_checkout_session_id", sessionId);

          if (session.metadata?.room_id) {
            await supabaseClient.from("video_rooms").update({ status: "paid" }).eq("id", session.metadata.room_id);
          }
        }

        return new Response(
          JSON.stringify({
            paid: session.payment_status === "paid",
            status: session.payment_status,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      if (roomCode) {
        const { data: room } = await supabaseClient
          .from("video_rooms")
          .select("status")
          .eq("room_code", roomCode.toUpperCase())
          .single();

        return new Response(
          JSON.stringify({
            paid: room?.status === "paid" || room?.status === "active" || room?.status === "ended",
            status: room?.status,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    console.error("video_payment_unhandled", { name: error instanceof Error ? error.name : typeof error });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
