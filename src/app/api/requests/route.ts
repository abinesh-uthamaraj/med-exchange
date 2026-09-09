import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest, Profile } from '@/types/database.types';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('requests').select('*').eq('status', 'Active');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const priorityMap = { Critical: 0, Urgent: 1, Standard: 2 };
    const sorted = ((data as MedicalRequest[]) ?? []).sort((a, b) => {
      const pDiff = priorityMap[a.urgency] - priorityMap[b.urgency];
      if (pDiff !== 0) return pDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return NextResponse.json(sorted, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { item_type, item_name, units_needed, urgency, hospital_location, contact_info } = body;

    if (!['blood', 'medicine'].includes(item_type) || !item_name?.trim() || typeof units_needed !== 'number' || units_needed < 1 || !['Critical', 'Urgent', 'Standard'].includes(urgency) || !hospital_location?.trim() || !contact_info?.trim()) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
    const requester_name = profile?.full_name || 'Verified Requester';

    const { data, error } = await supabase.from('requests').insert({
      requester_id: user.id,
      requester_name,
      item_type,
      item_name: item_name.trim(),
      units_needed,
      urgency,
      hospital_location: hospital_location.trim(),
      contact_info: contact_info.trim(),
      status: 'Active',
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 });
  }
}