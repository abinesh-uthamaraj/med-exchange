import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest, Pledge } from '@/types/database.types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { request_id, units_pledged } = await request.json();
    if (!request_id || typeof units_pledged !== 'number' || units_pledged < 1) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data: targetReq, error: fetchErr } = await supabase.from('requests').select('*').eq('id', request_id).single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.code === 'PGRST116' ? 'Request not found' : fetchErr.message }, { status: fetchErr.code === 'PGRST116' ? 404 : 500 });

    const medicalReq = targetReq as MedicalRequest;
    if (medicalReq.status !== 'Active') return NextResponse.json({ error: 'Request is no longer active' }, { status: 400 });
    if (units_pledged > medicalReq.units_needed) return NextResponse.json({ error: 'Pledged units exceed needed amount' }, { status: 400 });

    const { data: pledgeData, error: pledgeErr } = await supabase.from('pledges').insert({
      request_id,
      donor_id: user.id,
      units_pledged,
      status: 'Completed',
    }).select().single();
    if (pledgeErr) return NextResponse.json({ error: 'Failed to create pledge' }, { status: 500 });

    const updatedUnits = Math.max(0, medicalReq.units_needed - units_pledged);
    const newStatus = updatedUnits === 0 ? 'Fulfilled' : 'Active';

    const { data: updatedReq, error: updateErr } = await supabase.from('requests').update({ units_needed: updatedUnits, status: newStatus }).eq('id', request_id).select().single();
    if (updateErr) {
      await supabase.from('pledges').delete().eq('id', pledgeData.id);
      return NextResponse.json({ error: 'Atomic update failed; pledge reverted' }, { status: 500 });
    }
    return NextResponse.json(updatedReq, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 });
  }
}