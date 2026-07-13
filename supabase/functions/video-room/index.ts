import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { generateRoomCode } from "../_shared/secure-random.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // GET: Lookup room by code (for patients)
    if (req.method === "GET" && action === "lookup") {
      const roomCode = url.searchParams.get("code");
      
      if (!roomCode) {
        return new Response(
          JSON.stringify({ error: "Room code is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { data: room, error } = await supabaseClient
        .from("video_rooms")
        .select("id, room_code, status, deposit_amount, per_minute_rate")
        .eq("room_code", roomCode.toUpperCase())
        .single();

      if (error || !room) {
        return new Response(
          JSON.stringify({ error: "Room not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // Check if room is in valid state
      if (room.status === 'ended' || room.status === 'cancelled') {
        return new Response(
          JSON.stringify({ error: "This room has ended" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      return new Response(
        JSON.stringify({ room }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // All other actions require staff/admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Create a user-scoped client to validate the token
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate the token using getClaims
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("video_room_token_invalid");
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }


    const userId = claimsData.claims.sub as string;

    // Check if user is staff or admin (covers all internal staff roles)
    const { data: isAllowed, error: roleErr } = await supabaseClient
      .rpc("is_staff_or_admin", { _user_id: userId });

    if (roleErr || !isAllowed) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }


    // POST: Create new room
    if (req.method === "POST" && action === "create") {
      const body = await req.json();
      const { patient_name, patient_phone, patient_email, notes } = body;

      if (!patient_name || !patient_phone) {
        return new Response(
          JSON.stringify({ error: "Patient name and phone are required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Generate unique room code
      let roomCode = generateRoomCode();
      let attempts = 0;
      while (attempts < 10) {
        const { data: existing } = await supabaseClient
          .from("video_rooms")
          .select("id")
          .eq("room_code", roomCode)
          .single();
        
        if (!existing) break;
        roomCode = generateRoomCode();
        attempts++;
      }

      const { data: room, error } = await supabaseClient
        .from("video_rooms")
        .insert({
          room_code: roomCode,
          patient_name,
          patient_phone,
          patient_email,
          notes,
          created_by: userId,
          status: "pending"
        })
        .select()
        .single();

      if (error) {
        console.error("video_room_create_failed", { code: error.code });
        return new Response(
          JSON.stringify({ error: "Failed to create room" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      console.log("room_created", { roomCode });


      return new Response(
        JSON.stringify({ room }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201 }
      );
    }

    // POST: Create test room (bypasses Stripe payment)
    if (req.method === "POST" && action === "create-test") {
      const body = await req.json();
      const { patient_name, patient_phone, patient_email, notes } = body;

      if (!patient_name || !patient_phone) {
        return new Response(
          JSON.stringify({ error: "Patient name and phone are required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Generate unique room code
      let roomCode = generateRoomCode();
      let attempts = 0;
      while (attempts < 10) {
        const { data: existing } = await supabaseClient
          .from("video_rooms")
          .select("id")
          .eq("room_code", roomCode)
          .single();
        
        if (!existing) break;
        roomCode = generateRoomCode();
        attempts++;
      }

      const { data: room, error } = await supabaseClient
        .from("video_rooms")
        .insert({
          room_code: roomCode,
          patient_name,
          patient_phone,
          patient_email,
          notes: notes ? `[TEST] ${notes}` : '[TEST] Teleconsultation test room',
          created_by: userId,
          status: "test", // Use "test" status to skip payment
          deposit_amount: 0, // No deposit for test
          per_minute_rate: 0 // No per-minute charge for test
        })
        .select()
        .single();

      if (error) {
        console.error("video_room_create_test_failed", { code: error.code });
        return new Response(
          JSON.stringify({ error: "Failed to create test room" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      console.log("room_created_test", { roomCode });


      return new Response(
        JSON.stringify({ room }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201 }
      );
    }

    // POST: Update room status
    if (req.method === "POST" && action === "update-status") {
      const body = await req.json();
      const { room_id, status, call_started_at, call_ended_at, total_duration_seconds } = body;

      if (!room_id || !status) {
        return new Response(
          JSON.stringify({ error: "Room ID and status are required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const updateData: Record<string, unknown> = { status };
      if (call_started_at) updateData.call_started_at = call_started_at;
      if (call_ended_at) updateData.call_ended_at = call_ended_at;
      if (total_duration_seconds !== undefined) updateData.total_duration_seconds = total_duration_seconds;

      // Calculate total amount if call ended
      if (status === 'ended' && total_duration_seconds !== undefined) {
        const { data: roomData } = await supabaseClient
          .from("video_rooms")
          .select("deposit_amount, per_minute_rate")
          .eq("id", room_id)
          .single();

        if (roomData) {
          const minutes = Math.ceil(total_duration_seconds / 60);
          const totalCost = minutes * roomData.per_minute_rate;
          updateData.total_amount = totalCost;
        }
      }

      const { data: room, error } = await supabaseClient
        .from("video_rooms")
        .update(updateData)
        .eq("id", room_id)
        .select()
        .single();

      if (error) {
        console.error("video_room_update_failed", { room_id, code: error.code });
        return new Response(
          JSON.stringify({ error: "Failed to update room" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      console.log("room_status_updated", { room_id, status });


      return new Response(
        JSON.stringify({ room }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // POST: Delete room (only cancelled/ended rooms)
    if (req.method === "POST" && action === "delete") {
      const body = await req.json();
      const { room_id } = body;

      if (!room_id) {
        return new Response(
          JSON.stringify({ error: "Room ID is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Verify room exists and is in deletable state
      const { data: room, error: roomError } = await supabaseClient
        .from("video_rooms")
        .select("id, status")
        .eq("id", room_id)
        .single();

      if (roomError || !room) {
        return new Response(
          JSON.stringify({ error: "Room not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      if (!['cancelled', 'ended'].includes(room.status)) {
        return new Response(
          JSON.stringify({ error: "Can only delete cancelled or ended rooms" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Delete related payments first
      const { error: paymentsError } = await supabaseClient
        .from("video_payments")
        .delete()
        .eq("room_id", room_id);

      if (paymentsError) {
        console.error("video_room_delete_payments_failed", { room_id, code: paymentsError.code });
        return new Response(
          JSON.stringify({ error: "Failed to delete related payments" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      // Delete the room
      const { error: deleteError } = await supabaseClient
        .from("video_rooms")
        .delete()
        .eq("id", room_id);

      if (deleteError) {
        console.error("video_room_delete_failed", { room_id, code: deleteError.code });
        return new Response(
          JSON.stringify({ error: "Failed to delete room" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      console.log("room_deleted", { room_id });


      return new Response(
        JSON.stringify({ success: true, message: "Room deleted successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // GET: List all rooms
    if (req.method === "GET" && action === "list") {
      const status = url.searchParams.get("status");
      
      let query = supabaseClient
        .from("video_rooms")
        .select("*, video_payments(*)")
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: rooms, error } = await query;

      if (error) {
        console.error("video_room_list_failed", { code: error.code });
        return new Response(
          JSON.stringify({ error: "Failed to list rooms" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }


      return new Response(
        JSON.stringify({ rooms }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error) {
    console.error("video_room_unhandled", { name: error instanceof Error ? error.name : typeof error });
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
