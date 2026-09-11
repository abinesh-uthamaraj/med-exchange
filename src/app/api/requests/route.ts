import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MedicalRequest, Profile } from '@/types/database.types';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('status', 'Active');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const priorityMap: Record<MedicalRequest['urgency'], number> = {
      Critical: 0,
      Urgent: 1,
      Standard: 2,
    };

    const sorted = ((data as MedicalRequest[]) ?? []).sort((a, b) => {
      const pDiff = (priorityMap[a.urgency] ?? 99) - (priorityMap[b.urgency] ?? 99);
      if (pDiff !== 0) return pDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json(sorted, { status: 200 });
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

    let body: Partial<MedicalRequest>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { item_type, item_name, units_needed, urgency, hospital_location, contact_info } = body;

    if (
      (item_type !== 'blood' && item_type !== 'medicine') ||
      !item_name?.trim() ||
      typeof units_needed !== 'number' ||
      !Number.isFinite(units_needed) ||
      units_needed < 1 ||
      (urgency !== 'Critical' && urgency !== 'Urgent' && urgency !== 'Standard') ||
      !hospital_location?.trim() ||
      !contact_info?.trim()
    ) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    // Permissive policy: Any authenticated user can create a request
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const requester_name = (profile as Partial<Profile> | null)?.full_name || 'Verified Requester';

    // Guard against rapid duplicate submissions (within 8 seconds)
    const eightSecondsAgo = new Date(Date.now() - 8000).toISOString();
    const { data: recentDuplicate } = await supabase
      .from('requests')
      .select('id')
      .eq('requester_id', user.id)
      .eq('item_name', item_name.trim())
      .eq('item_type', item_type)
      .gte('created_at', eightSecondsAgo)
      .limit(1);

    if (recentDuplicate && recentDuplicate.length > 0) {
      return NextResponse.json(
        { error: 'A request for this item was already posted a moment ago.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('requests')
      .insert({
        requester_id: user.id,
        requester_name,
        item_type,
        item_name: item_name.trim(),
        units_needed,
        urgency,
        hospital_location: hospital_location.trim(),
        contact_info: contact_info.trim(),
        status: 'Active',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as MedicalRequest, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
