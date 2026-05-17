-- Internal staff messenger
CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);

CREATE INDEX idx_im_receiver_unread
  ON public.internal_messages (receiver_id, is_read, created_at DESC);
CREATE INDEX idx_im_pair_sr
  ON public.internal_messages (sender_id, receiver_id, created_at);
CREATE INDEX idx_im_pair_rs
  ON public.internal_messages (receiver_id, sender_id, created_at);

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: sender or receiver only
CREATE POLICY "im_select_participants"
  ON public.internal_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- INSERT: must be the sender, must be staff/admin/locum
CREATE POLICY "im_insert_self_staff"
  ON public.internal_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      public.is_staff_or_admin(auth.uid())
      OR public.has_role(auth.uid(), 'locum')
    )
  );

-- UPDATE: only receiver, only to mark read (column-level enforced by trigger)
CREATE POLICY "im_update_receiver_mark_read"
  ON public.internal_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Immutability trigger: receiver may only toggle is_read / read_at
CREATE OR REPLACE FUNCTION public.trg_internal_messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_id   IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.content     IS DISTINCT FROM OLD.content
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'IMMUTABLE_MESSAGE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER internal_messages_guard_update
BEFORE UPDATE ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_internal_messages_guard_update();

-- Realtime
ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;