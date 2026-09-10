import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest, Pledge } from '@/types/database.types';

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

    let body: { pledge_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { pledge_id } = body;
    if (!pledge_id || typeof pledge_id !== 'string' || pledge_id.trim().length === 0) {
      return NextResponse.json({ error: 'pledge_id is required' }, { status: 400 });
    }

    const trimmedPledgeId = pledge_id.trim();

    // 1. Fetch target pledge upfront to check verification status defensively
    const { data: pledgeData, error: pledgeFetchErr } = await supabase
      .from('pledges')
      .select('*')
      .eq('id', trimmedPledgeId)
      .single();

    if (pledgeFetchErr) {
      if (pledgeFetchErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Pledge not found' }, { status: 404 });
      }
      return NextResponse.json({ error: pledgeFetchErr.message }, { status: 500 });
    }

    const targetPledge = pledgeData as Pledge;

    // DIRECTIVE 5: Prevent duplicate donation history entries
    if (targetPledge.status === 'Verified') {
      return NextResponse.json(
        { error: 'Pledge has already been verified' },
        { status: 400 }
      );
    }

    // 2. Fetch the associated emergency request
    const { data: requestData, error: requestFetchErr } = await supabase
      .from('requests')
      .select('*')
      .eq('id', targetPledge.request_id)
      .single();

    if (requestFetchErr || !requestData) {
      return NextResponse.json({ error: 'Associated request not found' }, { status: 404 });
    }

    const targetRequest = requestData as MedicalRequest;

    // Strict ownership verification: Only the requester can verify
    if (targetRequest.requester_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: only the requester can verify this pledge' },
        { status: 403 }
      );
    }

    // Secondary check: verify donation history hasn't already been inserted
    const { data: existingHistory } = await supabase
      .from('donation_history')
      .select('id')
      .eq('request_id', targetRequest.id)
      .eq('donor_id', targetPledge.donor_id)
      .limit(1);

    if (existingHistory && existingHistory.length > 0) {
      return NextResponse.json(
        { error: 'Donation history already recorded for this pledge' },
        { status: 400 }
      );
    }

    // 3. Attempt verification via PostgreSQL RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'verify_donation_pledge',
      {
        target_pledge_id: trimmedPledgeId,
        verifying_user_id: user.id,
      }
    );

    if (!rpcError && rpcResult) {
      const result = rpcResult as {
        success: boolean;
        error?: string;
        status?: number;
        pledge_id?: string;
        request_id?: string;
        units_needed?: number;
        request_status?: string;
      };

      if (!result.success) {
        return NextResponse.json(
          { error: result.error ?? 'Verification failed' },
          { status: result.status ?? 400 }
        );
      }

      return NextResponse.json(result, { status: 200 });
    }

    // 4. Sequential fallback if RPC function is not yet created in PostgreSQL
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    // Mark pledge as verified
    const { error: pledgeUpdateErr } = await supabase
      .from('pledges')
      .update({
        status: 'Verified',
        verified_at: nowIso,
      })
      .eq('id', trimmedPledgeId);

    if (pledgeUpdateErr) {
      return NextResponse.json({ error: pledgeUpdateErr.message }, { status: 500 });
    }

    // Decrement request units
    const updatedUnits = Math.max(0, targetRequest.units_needed - targetPledge.units_pledged);
    const updatedStatus = updatedUnits === 0 ? 'Fulfilled' : targetRequest.status;

    const { error: requestUpdateErr } = await supabase
      .from('requests')
      .update({
        units_needed: updatedUnits,
        status: updatedStatus,
      })
      .eq('id', targetRequest.id);

    if (requestUpdateErr) {
      // Revert pledge status on failure
      await supabase
        .from('pledges')
        .update({ status: 'Pending', verified_at: null })
        .eq('id', trimmedPledgeId);

      return NextResponse.json(
        { error: 'Failed to update request units; verification reverted' },
        { status: 500 }
      );
    }

    // Insert into donation_history
    await supabase.from('donation_history').insert({
      donor_id: targetPledge.donor_id,
      request_id: targetRequest.id,
      item_name: targetRequest.item_name,
      units_donated: targetPledge.units_pledged,
      hospital_location: targetRequest.hospital_location,
      verified_by: user.id,
      verified_at: nowIso,
    });

    // Update donor's last_donation_date to today
    await supabase
      .from('profiles')
      .update({ last_donation_date: todayDate })
      .eq('id', targetPledge.donor_id);

    return NextResponse.json(
      {
        success: true,
        pledge_id: trimmedPledgeId,
        request_id: targetRequest.id,
        units_needed: updatedUnits,
        request_status: updatedStatus,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
