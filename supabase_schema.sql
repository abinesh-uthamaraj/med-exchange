-- ==============================================================================
-- LifeFlow | Community Blood & Rare Medicine Exchange
-- Complete Idempotent Database Migration Script
-- Compatible with Supabase Postgres & Realtime Engine
-- ==============================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. PROFILES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('donor', 'hospital', 'caregiver')),
  hospital_name TEXT,
  phone_number TEXT,
  blood_group TEXT,
  last_donation_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Ensure newly added columns exist if profiles table was already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'blood_group') THEN
    ALTER TABLE public.profiles ADD COLUMN blood_group TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_donation_date') THEN
    ALTER TABLE public.profiles ADD COLUMN last_donation_date DATE;
  END IF;
END $$;

-- ==============================================================================
-- 3. MEDICAL REQUESTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('blood', 'medicine')),
  item_name TEXT NOT NULL,
  units_needed INTEGER NOT NULL CHECK (units_needed >= 0),
  urgency TEXT NOT NULL CHECK (urgency IN ('Critical', 'Urgent', 'Standard')),
  hospital_location TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Fulfilled', 'Archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Index for live shortage feed ordering (urgency and recency)
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_urgency_created ON public.requests(urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON public.requests(requester_id);

-- ==============================================================================
-- 4. PLEDGES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pledges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  units_pledged INTEGER NOT NULL CHECK (units_pledged > 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Pledged', 'Verified')),
  eta_minutes INTEGER NOT NULL DEFAULT 30 CHECK (eta_minutes > 0),
  donor_phone TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Ensure schema updates for pledges table exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pledges' AND column_name = 'status') THEN
    ALTER TABLE public.pledges ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending';
  END IF;
  
  -- Relax or update constraint if status already existed
  ALTER TABLE public.pledges DROP CONSTRAINT IF EXISTS pledges_status_check;
  ALTER TABLE public.pledges ADD CONSTRAINT pledges_status_check CHECK (status IN ('Pending', 'Pledged', 'Verified'));
  ALTER TABLE public.pledges ALTER COLUMN status SET DEFAULT 'Pending';

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pledges' AND column_name = 'eta_minutes') THEN
    ALTER TABLE public.pledges ADD COLUMN eta_minutes INTEGER NOT NULL DEFAULT 30 CHECK (eta_minutes > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pledges' AND column_name = 'donor_phone') THEN
    ALTER TABLE public.pledges ADD COLUMN donor_phone TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pledges' AND column_name = 'verified_at') THEN
    ALTER TABLE public.pledges ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
END $$;

-- Explicit foreign key from pledges.donor_id to profiles.id so PostgREST joins work smoothly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_pledges_profiles' AND table_name = 'pledges'
  ) THEN
    ALTER TABLE public.pledges 
      ADD CONSTRAINT fk_pledges_profiles 
      FOREIGN KEY (donor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_pledges_request_id ON public.pledges(request_id);
CREATE INDEX IF NOT EXISTS idx_pledges_donor_id ON public.pledges(donor_id);

-- ==============================================================================
-- 5. DONATION HISTORY TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.donation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  units_donated INTEGER NOT NULL CHECK (units_donated > 0),
  hospital_location TEXT NOT NULL,
  verified_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_donation_history_donor ON public.donation_history(donor_id);
CREATE INDEX IF NOT EXISTS idx_donation_history_verified_at ON public.donation_history(verified_at DESC);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_history ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Requests Policies (Permissive: Any authenticated user can create emergency requests)
DROP POLICY IF EXISTS "Requests viewable by authenticated users" ON public.requests;
CREATE POLICY "Requests viewable by authenticated users"
  ON public.requests FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Any authenticated user can create request" ON public.requests;
CREATE POLICY "Any authenticated user can create request"
  ON public.requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Requesters can update their own request" ON public.requests;
CREATE POLICY "Requesters can update their own request"
  ON public.requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Requesters can delete their own request" ON public.requests;
CREATE POLICY "Requesters can delete their own request"
  ON public.requests FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id);

-- Pledges Policies
DROP POLICY IF EXISTS "Pledges viewable by donor or requester" ON public.pledges;
DROP POLICY IF EXISTS "Pledges viewable by authenticated users" ON public.pledges;
DROP POLICY IF EXISTS "Users can view pledges" ON public.pledges;
DROP POLICY IF EXISTS "Pledges are viewable by everyone" ON public.pledges;

CREATE POLICY "Pledges viewable by donor or requester"
  ON public.pledges FOR SELECT
  TO authenticated
  USING (
    auth.uid() = donor_id 
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = pledges.request_id AND r.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create pledge" ON public.pledges;
CREATE POLICY "Authenticated users can create pledge"
  ON public.pledges FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = donor_id);

DROP POLICY IF EXISTS "Users or Requesters can update pledges" ON public.pledges;
CREATE POLICY "Users or Requesters can update pledges"
  ON public.pledges FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = donor_id OR
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = pledges.request_id AND r.requester_id = auth.uid()
    )
  );

-- Donation History Policies
DROP POLICY IF EXISTS "Donation history viewable by authenticated users" ON public.donation_history;
CREATE POLICY "Donation history viewable by authenticated users"
  ON public.donation_history FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Requesters or RPC can record verified donation" ON public.donation_history;
CREATE POLICY "Requesters or RPC can record verified donation"
  ON public.donation_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = verified_by);

-- ==============================================================================
-- 7. ATOMIC TRANSACTION RPC: verify_donation_pledge
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.verify_donation_pledge(
  target_pledge_id UUID,
  verifying_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pledge RECORD;
  v_request RECORD;
  v_new_units INTEGER;
  v_new_status TEXT;
  v_now TIMESTAMPTZ := TIMEZONE('utc'::text, NOW());
  v_today DATE := CURRENT_DATE;
BEGIN
  -- 1. Fetch target pledge
  SELECT * INTO v_pledge
  FROM public.pledges
  WHERE id = target_pledge_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pledge record not found',
      'status', 404
    );
  END IF;

  IF v_pledge.status = 'Verified' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pledge has already been verified',
      'status', 400
    );
  END IF;

  -- 2. Lock and fetch target emergency request
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = v_pledge.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Associated emergency request not found',
      'status', 404
    );
  END IF;

  -- 3. Authorization check: Only the original requester can verify
  IF v_request.requester_id <> verifying_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Forbidden: only the requester can verify this pledge',
      'status', 403
    );
  END IF;

  -- 4. Calculate updated request capacity and status
  v_new_units := GREATEST(0, v_request.units_needed - v_pledge.units_pledged);
  IF v_new_units = 0 THEN
    v_new_status := 'Fulfilled';
  ELSE
    v_new_status := v_request.status;
  END IF;

  -- 5. Mark pledge as verified
  UPDATE public.pledges
  SET
    status = 'Verified',
    verified_at = v_now
  WHERE id = target_pledge_id;

  -- 6. Update emergency request
  UPDATE public.requests
  SET
    units_needed = v_new_units,
    status = v_new_status
  WHERE id = v_request.id;

  -- 7. Record entry into verified donation history
  INSERT INTO public.donation_history (
    donor_id,
    request_id,
    item_name,
    units_donated,
    hospital_location,
    verified_by,
    verified_at
  ) VALUES (
    v_pledge.donor_id,
    v_request.id,
    v_request.item_name,
    v_pledge.units_pledged,
    v_request.hospital_location,
    verifying_user_id,
    v_now
  );

  -- 8. Reset donor's 90-day clinical cool-off clock
  UPDATE public.profiles
  SET last_donation_date = v_today
  WHERE id = v_pledge.donor_id;

  RETURN jsonb_build_object(
    'success', true,
    'pledge_id', target_pledge_id,
    'request_id', v_request.id,
    'units_needed', v_new_units,
    'request_status', v_new_status
  );
END;
$$;

-- ==============================================================================
-- 8. REALTIME REPLICATION CONFIGURATION
-- ==============================================================================
-- Enable full replica identity so updates deliver full payload
ALTER TABLE public.requests REPLICA IDENTITY FULL;
ALTER TABLE public.pledges REPLICA IDENTITY FULL;
ALTER TABLE public.donation_history REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pledges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pledges;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'donation_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.donation_history;
  END IF;
END $$;
