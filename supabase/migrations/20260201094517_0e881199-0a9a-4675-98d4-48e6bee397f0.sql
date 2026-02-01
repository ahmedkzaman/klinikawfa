-- Video Rooms table for managing video call sessions
CREATE TABLE public.video_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code text UNIQUE NOT NULL,
    patient_name text NOT NULL,
    patient_phone text NOT NULL,
    patient_email text,
    created_by uuid REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'active', 'ended', 'cancelled')),
    deposit_amount integer NOT NULL DEFAULT 5000, -- RM50 in cents
    per_minute_rate integer NOT NULL DEFAULT 500, -- RM5 in cents
    call_started_at timestamp with time zone,
    call_ended_at timestamp with time zone,
    total_duration_seconds integer,
    total_amount integer,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Video Payments table for tracking all payment transactions
CREATE TABLE public.video_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid REFERENCES public.video_rooms(id) ON DELETE CASCADE NOT NULL,
    payment_type text NOT NULL CHECK (payment_type IN ('deposit', 'additional')),
    amount integer NOT NULL,
    stripe_payment_intent_id text,
    stripe_checkout_session_id text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.video_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_rooms
CREATE POLICY "Staff/Admin can view all video rooms"
ON public.video_rooms FOR SELECT
USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can create video rooms"
ON public.video_rooms FOR INSERT
WITH CHECK (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update video rooms"
ON public.video_rooms FOR UPDATE
USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete video rooms"
ON public.video_rooms FOR DELETE
USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Patients can view their room by code"
ON public.video_rooms FOR SELECT
USING (true);

-- RLS Policies for video_payments
CREATE POLICY "Staff/Admin can view all payments"
ON public.video_payments FOR SELECT
USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Anyone can view payment by room"
ON public.video_payments FOR SELECT
USING (true);

CREATE POLICY "System can insert payments"
ON public.video_payments FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update payments"
ON public.video_payments FOR UPDATE
USING (true);

-- Enable realtime for video_rooms (for WebRTC signaling)
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_rooms;

-- Add signaling columns for WebRTC
ALTER TABLE public.video_rooms ADD COLUMN sdp_offer jsonb;
ALTER TABLE public.video_rooms ADD COLUMN sdp_answer jsonb;
ALTER TABLE public.video_rooms ADD COLUMN ice_candidates jsonb DEFAULT '[]'::jsonb;

-- Indexes for performance
CREATE INDEX idx_video_rooms_room_code ON public.video_rooms(room_code);
CREATE INDEX idx_video_rooms_status ON public.video_rooms(status);
CREATE INDEX idx_video_payments_room_id ON public.video_payments(room_id);

-- Trigger for updated_at
CREATE TRIGGER update_video_rooms_updated_at
BEFORE UPDATE ON public.video_rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_video_payments_updated_at
BEFORE UPDATE ON public.video_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();