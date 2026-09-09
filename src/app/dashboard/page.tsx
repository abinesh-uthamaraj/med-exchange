'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MedicalRequest, Profile } from '@/types/database.types';
import {
  Activity,
  Droplet,
  Pill,
  MapPin,
  User,
  Phone,
  LogOut,
  PlusCircle,
  Archive,
  HeartHandshake,
  Loader2,
  Inbox,
} from 'lucide-react';

type Filter = 'all' | 'blood' | 'medicine' | 'critical' | 'mine';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<Profile | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const [requests, setRequests] = useState<MedicalRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>('all');

  const [itemType, setItemType] = useState<'blood' | 'medicine'>('blood');
  const [itemName, setItemName] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [urgency, setUrgency] = useState<'Critical' | 'Urgent' | 'Standard'>('Critical');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (!authUser || authError) {
          router.push('/auth');
          return;
        }

        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileErr && profileErr.code === 'PGRST116') {
          setUser({
            id: authUser.id,
            full_name: authUser.email ?? 'Verified User',
            role: 'caregiver',
            hospital_name: null,
            phone_number: null,
            created_at: new Date().toISOString(),
          });
          setHasProfile(false);
        } else if (profileData) {
          setUser(profileData as Profile);
          setHasProfile(true);
        }

        const res = await fetch('/api/requests');
        if (res.ok) {
          const fetchedReqs = (await res.json()) as MedicalRequest[];
          if (Array.isArray(fetchedReqs)) {
            setRequests(fetchedReqs);
          }
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router, supabase]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  };

  const handlePostRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!itemName.trim() || !hospitalLocation.trim() || !contactInfo.trim() || unitsNeeded < 1) {
      setFormError('Please enter all required fields with valid units.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: itemType,
          item_name: itemName.trim(),
          units_needed: Number(unitsNeeded),
          urgency,
          hospital_location: hospitalLocation.trim(),
          contact_info: contactInfo.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Failed to publish request.');
      }

      const created = (await res.json()) as MedicalRequest;
      setRequests((prev) => [created, ...prev]);
      setItemName('');
      setHospitalLocation('');
      setContactInfo('');
      setUnitsNeeded(1);
      setFormSuccess('Emergency supply request published to the live network.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePledge = async (requestId: string) => {
    if (actionLoading[requestId]) return;
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));

    try {
      const res = await fetch('/api/pledges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, units_pledged: 1 }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Pledge failed');
      }

      const updated = (await res.json()) as MedicalRequest;
      if (updated.status === 'Fulfilled' || updated.units_needed <= 0) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      } else {
        setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error pledging');
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleArchive = async (requestId: string) => {
    if (actionLoading[requestId]) return;
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));

    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Archived' }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Archive failed');
      }

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error archiving');
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (activeFilter === 'blood') return r.item_type === 'blood';
    if (activeFilter === 'medicine') return r.item_type === 'medicine';
    if (activeFilter === 'critical') return r.urgency === 'Critical';
    if (activeFilter === 'mine') return user ? r.requester_id === user.id : false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white tracking-wide">LifeFlow</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/70 border border-red-800/40 text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live Network
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-slate-200">{user?.full_name}</div>
              <div className="text-xs text-slate-400">
                {hasProfile && user?.role && (
                  <span className="capitalize">{user.role}</span>
                )}
                {user?.hospital_name && ` • ${user.hospital_name}`}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs text-slate-400 mb-1">Active Emergencies</div>
            <div className="text-2xl font-bold text-white">{requests.length}</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs text-red-400 mb-1">Critical Urgency</div>
            <div className="text-2xl font-bold text-red-500">
              {requests.filter((r) => r.urgency === 'Critical').length}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs text-slate-400 mb-1">My Active Posts</div>
            <div className="text-2xl font-bold text-slate-200">
              {user ? requests.filter((r) => r.requester_id === user.id).length : 0}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 sticky top-24">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-red-500" />
                Post Emergency Request
              </h2>

              {formError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs">
                  {formSuccess}
                </div>
              )}

              <form onSubmit={handlePostRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Item Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setItemType('blood')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        itemType === 'blood'
                          ? 'bg-red-600 border-red-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Droplet className="w-3.5 h-3.5" /> Blood
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('medicine')}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        itemType === 'medicine'
                          ? 'bg-red-600 border-red-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Pill className="w-3.5 h-3.5" /> Medicine
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Specific Item Name</label>
                  <input
                    type="text"
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder={itemType === 'blood' ? 'e.g., O-Negative Blood' : 'e.g., IVIG 10g'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Units Needed</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={unitsNeeded}
                      onChange={(e) => setUnitsNeeded(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Urgency</label>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as 'Critical' | 'Urgent' | 'Standard')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                    >
                      <option value="Critical">Critical</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Standard">Standard</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Hospital / Ward Location</label>
                  <input
                    type="text"
                    required
                    value={hospitalLocation}
                    onChange={(e) => setHospitalLocation(e.target.value)}
                    placeholder="St. Jude ICU, 3rd Floor"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Emergency Contact Phone</label>
                  <input
                    type="tel"
                    required
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-900/30"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Publish Emergency Request'}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {(['all', 'blood', 'medicine', 'critical', 'mine'] as Filter[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    activeFilter === tab
                      ? 'bg-red-600 text-white shadow-md shadow-red-900/20'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {tab === 'mine' ? 'My Posts' : tab}
                </button>
              ))}
            </div>

            {filteredRequests.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-xl">
                <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">No active shortages found</h3>
                <p className="text-xs text-slate-500 mt-1">Check back later or change your selected filter.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              req.urgency === 'Critical'
                                ? 'bg-red-950/80 border border-red-800 text-red-400'
                                : req.urgency === 'Urgent'
                                ? 'bg-amber-950/80 border border-amber-800 text-amber-400'
                                : 'bg-sky-950/80 border border-sky-800 text-sky-400'
                            }`}
                          >
                            {req.urgency}
                          </span>
                          <span className="text-xs text-slate-400 capitalize flex items-center gap-1">
                            {req.item_type === 'blood' ? (
                              <Droplet className="w-3 h-3 text-red-500" />
                            ) : (
                              <Pill className="w-3 h-3 text-emerald-500" />
                            )}
                            {req.item_type}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-white">{req.item_name}</h3>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xl font-extrabold text-red-500">{req.units_needed}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">Units Needed</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 border-t border-slate-800/60 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{req.hospital_location}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{req.requester_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <a href={`tel:${req.contact_info}`} className="hover:text-red-400 underline decoration-slate-700">
                          {req.contact_info}
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/60">
                      {hasProfile && user?.role === 'donor' && req.requester_id !== user.id && (
                        <button
                          type="button"
                          disabled={actionLoading[req.id]}
                          onClick={() => handlePledge(req.id)}
                          className="px-3 py-1.5 bg-red-600/90 hover:bg-red-600 disabled:bg-red-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {actionLoading[req.id] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <HeartHandshake className="w-3.5 h-3.5" />
                          )}
                          Pledge 1 Unit
                        </button>
                      )}

                      {user && req.requester_id === user.id && (
                        <button
                          type="button"
                          disabled={actionLoading[req.id]}
                          onClick={() => handleArchive(req.id)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                        >
                          {actionLoading[req.id] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Archive className="w-3.5 h-3.5" />
                          )}
                          Archive Post
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}