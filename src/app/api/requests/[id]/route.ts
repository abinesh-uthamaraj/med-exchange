import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest } from '@/types/database.types';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: targetReq, error: fetchErr } = await supabase.from('requests').select('*').eq('id', id).single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.code === 'PGRST116' ? 'Not found' : fetchErr.message }, { status: fetchErr.code === 'PGRST116' ? 404 : 500 });
    if ((targetReq as MedicalRequest).requester_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const payload: Partial<MedicalRequest> = {};
    if (['Fulfilled', 'Archived', 'Active'].includes(body.status)) payload.status = body.status;
    if (typeof body.units_needed === 'number' && body.units_needed >= 0) payload.units_needed = body.units_needed;
    if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

    const { data: updatedData, error: updateErr } = await supabase.from('requests').update(payload).eq('id', id).select().single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true, request: updatedData }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: targetReq, error: fetchErr } = await supabase.from('requests').select('*').eq('id', id).single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.code === 'PGRST116' ? 'Not found' : fetchErr.message }, { status: fetchErr.code === 'PGRST116' ? 404 : 500 });
    if ((targetReq as MedicalRequest).requester_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error: delErr } = await supabase.from('requests').delete().eq('id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 });
  }
}