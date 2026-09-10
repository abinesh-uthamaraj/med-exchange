import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest, Pledge, Profile } from '@/types/database.types';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch all requests created by this user (to identify incoming pledges)
    const { data: userRequests, error: reqErr } = await supabase
      .from('requests')
      .select('id')
      .eq('requester_id', user.id);

    if (reqErr) {
      return NextResponse.json({ error: reqErr.message }, { status: 500 });
    }

    const requesterRequestIds = (userRequests || []).map((r: { id: string }) => r.id);

    // 2. Query pledges where user is donor OR request_id is in user's requests
    let pledgesData: Pledge[] | null = null;
    let pledgesQuery = supabase.from('pledges').select('*, profiles:donor_id(full_name, phone_number)');

    if (requesterRequestIds.length > 0) {
      pledgesQuery = pledgesQuery.or(
        `donor_id.eq.${user.id},request_id.in.(${requesterRequestIds.join(',')})`
      );
    } else {
      pledgesQuery = pledgesQuery.eq('donor_id', user.id);
    }

    const resWithProfiles = await pledgesQuery.order('created_at', { ascending: false });

    if (!resWithProfiles.error && resWithProfiles.data) {
      pledgesData = resWithProfiles.data as Pledge[];
    } else {
      // Fallback query if PostgREST relationship cache is not linking pledges to profiles
      let fallbackQuery = supabase.from('pledges').select('*');
      if (requesterRequestIds.length > 0) {
        fallbackQuery = fallbackQuery.or(
          `donor_id.eq.${user.id},request_id.in.(${requesterRequestIds.join(',')})`
        );
      } else {
        fallbackQuery = fallbackQuery.eq('donor_id', user.id);
      }

      const fallbackRes = await fallbackQuery.order('created_at', { ascending: false });
      if (fallbackRes.error) {
        return NextResponse.json({ error: fallbackRes.error.message }, { status: 500 });
      }

      const rawPledges = (fallbackRes.data ?? []) as Pledge[];
      const donorIds = Array.from(new Set(rawPledges.map((p) => p.donor_id)));

      if (donorIds.length > 0) {
        const { data: profilesList } = await supabase
          .from('profiles')
          .select('id, full_name, phone_number')
          .in('id', donorIds);

        const profileMap = new Map<string, { full_name: string; phone_number: string | null }>();
        (profilesList || []).forEach((prof: { id: string; full_name: string; phone_number: string | null }) => {
          profileMap.set(prof.id, { full_name: prof.full_name, phone_number: prof.phone_number });
        });

        pledgesData = rawPledges.map((p) => ({
          ...p,
          profiles: profileMap.get(p.donor_id),
        }));
      } else {
        pledgesData = rawPledges;
      }
    }

    return NextResponse.json(pledgesData ?? [], { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: {
      request_id?: string;
      units_pledged?: number;
      eta_minutes?: number;
      last_donation_date?: string | null;
      donor_phone?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { request_id, units_pledged, eta_minutes = 30, last_donation_date, donor_phone } = body;

    // 1. Input Validation
    if (!request_id || typeof request_id !== 'string' || request_id.trim().length === 0) {
      return NextResponse.json({ error: 'Valid request_id is required' }, { status: 400 });
    }

    if (typeof units_pledged !== 'number' || !Number.isFinite(units_pledged) || units_pledged < 1) {
      return NextResponse.json({ error: 'units_pledged must be a finite number >= 1' }, { status: 400 });
    }

    if (typeof eta_minutes !== 'number' || !Number.isFinite(eta_minutes) || eta_minutes < 1) {
      return NextResponse.json({ error: 'eta_minutes must be a finite number >= 1' }, { status: 400 });
    }

    if (!donor_phone || typeof donor_phone !== 'string' || donor_phone.trim().length === 0) {
      return NextResponse.json({ error: 'donor_phone is required' }, { status: 400 });
    }

    const targetReqId = request_id.trim();

    // 2. Prevent Double-Pledging: Check if user already has a pending pledge for this request
    const { data: existingPledges, error: checkErr } = await supabase
      .from('pledges')
      .select('id, status')
      .eq('request_id', targetReqId)
      .eq('donor_id', user.id);

    if (!checkErr && existingPledges) {
      const hasPending = existingPledges.some(
        (p: { status: string }) => p.status === 'Pending' || p.status === 'Pledged'
      );
      if (hasPending) {
        return NextResponse.json(
          { error: 'You have already submitted a pending pledge for this shortage.' },
          { status: 400 }
        );
      }
    }

    // 3. Fetch user profile to check existing last_donation_date if not explicitly supplied
    const { data: profileData } = await supabase
      .from('profiles')
      .select('last_donation_date')
      .eq('id', user.id)
      .single();

    const checkDonationDate = last_donation_date || (profileData as Partial<Profile> | null)?.last_donation_date;

    // 4. Server-side calendar-day check: 90 days rule
    if (checkDonationDate) {
      const lastDate = new Date(checkDonationDate);
      if (isNaN(lastDate.getTime())) {
        return NextResponse.json({ error: 'Invalid last donation date format' }, { status: 400 });
      }

      const today = new Date();
      // Normalize to midnight UTC for calendar day calculation
      const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      const utcLast = Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
      const diffMs = utcToday - utcLast;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 90 && diffDays >= 0) {
        const remainingDays = 90 - diffDays;
        return NextResponse.json(
          {
            error: `Ineligible to pledge: 90 days must elapse between donations. You have ${remainingDays} days remaining before you can donate again.`,
          },
          { status: 400 }
        );
      }
    }

    // 5. Verify target request exists and is Active
    const { data: targetReq, error: fetchErr } = await supabase
      .from('requests')
      .select('*')
      .eq('id', targetReqId)
      .single();

    if (fetchErr) {
      if (fetchErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Emergency request not found' }, { status: 404 });
      }
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const medicalReq = targetReq as MedicalRequest;
    if (medicalReq.status !== 'Active') {
      return NextResponse.json({ error: 'Request is no longer active' }, { status: 400 });
    }

    if (medicalReq.units_needed <= 0) {
      return NextResponse.json({ error: 'Request has already reached full capacity' }, { status: 400 });
    }

    if (units_pledged > medicalReq.units_needed) {
      return NextResponse.json(
        {
          error: `Pledged units (${units_needed_text(units_pledged)}) exceed needed amount (${units_needed_text(
            medicalReq.units_needed
          )})`,
        },
        { status: 400 }
      );
    }

    // 6. Insert pledge with status 'Pending'
    const { data: createdPledge, error: insertErr } = await supabase
      .from('pledges')
      .insert({
        request_id: medicalReq.id,
        donor_id: user.id,
        units_pledged,
        status: 'Pending',
        eta_minutes: Math.round(eta_minutes),
        donor_phone: donor_phone.trim(),
      })
      .select()
      .single();

    if (insertErr || !createdPledge) {
      return NextResponse.json({ error: insertErr?.message ?? 'Failed to record pledge' }, { status: 500 });
    }

    return NextResponse.json(createdPledge as Pledge, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

function units_needed_text(units: number): string {
  return `${units} unit${units === 1 ? '' : 's'}`;
}
