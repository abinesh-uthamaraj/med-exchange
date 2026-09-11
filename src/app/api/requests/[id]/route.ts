import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest } from '@/types/database.types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Missing or invalid request ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: targetReq, error: fetchErr } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id.trim())
      .single();

    if (fetchErr) {
      if (fetchErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const medicalReq = targetReq as MedicalRequest;
    if (medicalReq.requester_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: only the requester can modify this request' }, { status: 403 });
    }

    let body: {
      status?: 'Fulfilled' | 'Archived' | 'Active';
      units_needed?: number;
      item_name?: string;
      item_type?: 'blood' | 'medicine';
      urgency?: 'Critical' | 'Urgent' | 'Standard';
      hospital_location?: string;
      contact_info?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload: Partial<MedicalRequest> = {};
    if (body.status && ['Fulfilled', 'Archived', 'Active'].includes(body.status)) {
      payload.status = body.status;
    }
    if (typeof body.units_needed === 'number' && Number.isFinite(body.units_needed) && body.units_needed >= 0) {
      payload.units_needed = body.units_needed;
    }
    if (typeof body.item_name === 'string' && body.item_name.trim().length > 0) {
      payload.item_name = body.item_name.trim();
    }
    if (body.item_type && (body.item_type === 'blood' || body.item_type === 'medicine')) {
      payload.item_type = body.item_type;
    }
    if (body.urgency && ['Critical', 'Urgent', 'Standard'].includes(body.urgency)) {
      payload.urgency = body.urgency;
    }
    if (typeof body.hospital_location === 'string' && body.hospital_location.trim().length > 0) {
      payload.hospital_location = body.hospital_location.trim();
    }
    if (typeof body.contact_info === 'string' && body.contact_info.trim().length > 0) {
      payload.contact_info = body.contact_info.trim();
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided to update' }, { status: 400 });
    }

    const { data: updatedData, error: updateErr } = await supabase
      .from('requests')
      .update(payload)
      .eq('id', id.trim())
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, request: updatedData as MedicalRequest }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Missing or invalid request ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: targetReq, error: fetchErr } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id.trim())
      .single();

    if (fetchErr) {
      if (fetchErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if ((targetReq as MedicalRequest).requester_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: only the requester can delete this request' }, { status: 403 });
    }

    const { error: delErr } = await supabase.from('requests').delete().eq('id', id.trim());
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
