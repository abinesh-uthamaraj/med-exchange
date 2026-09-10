'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MedicalRequest, Profile, Pledge, DonationHistory } from '@/types/database.types';
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
  Clock,
  CheckCircle2,
  XCircle,
  History,
  Calendar,
  ShieldAlert
} from 'lucide-react';

type Filter = 'all' | 'blood' | 'medicine' | 'critical' | 'mine';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const [requests, setRequests] = useState<MedicalRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>('all');

  // Form State
  const [itemType, setItemType] = useState<'blood' | 'medicine'>('blood');
  const [itemName, setItemName] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [urgency, setUrgency] = useState<'Critical' | 'Urgent' | 'Standard'>('Critical');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Pledge Modal State
  const [pledgeTarget, setPledgeTarget] = useState<MedicalRequest | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number>(30);
  const [lastDonationDate, setLastDonationDate] = useState<string>('');
  const [donorPhone, setDonorPhone] = useState<string>('');
  const [pledgeError, setPledgeError] = useState<string | null>(null);
  const [pledging, setPledging] = useState(false);

  // Incoming Pledges & Donor History
  const [incomingPledges, setIncomingPledges] = useState<(Pledge & { profiles?: { full_name: string; phone_number: string } })[]>([]);
  const [donationHistory, setDonationHistory] = useState<DonationHistory[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (!authUser || authError) {
        router.push('/auth');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileData) {
        setUser(profileData as Profile);
        setDonorPhone(profileData.phone_number || '');
        if (profileData.last_donation_date) {
          setLastDonationDate(profileData.last_donation_date);
        }
      }

      // Fetch active requests
      const res = await fetch('/api/requests');
      if (res.ok) {
        const fetchedReqs = (await res.json()) as MedicalRequest[];
        if (Array.isArray(fetchedReqs)) setRequests(fetchedReqs);
      }

      // Fetch active pledges
      const pledgeRes = await fetch('/api/pledges');
      if (pledgeRes.ok) {
        const pledgesData = await pledgeRes.json();
        if (Array.isArray(pledgesData)) setIncomingPledges(pledgesData);
      }

      // Fetch verified history for donor
      const { data: hist } = await supabase
        .from('donation_history')
        .select('*')
        .eq('donor_id', authUser.id)
        .order('verified_at', { ascending: false });

      if (hist) setDonationHistory(hist as DonationHistory[]);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadData();

    // Instant Realtime updates for both requests and pledges
    const channel = supabase
      .channel('realtime-dashboard-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pledges' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const eligibility = useMemo(() => {
    if (!lastDonationDate) return { eligible: true, daysRemaining: 0 };
    const lastDate = new Date(lastDonationDate);
    const diffDays = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 90) return { eligible: true, daysRemaining: 0 };
    return { eligible: false, daysRemaining: 90 - diffDays };
  }, [lastDonationDate]);

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
        const errJson = await res.json();
        throw new Error(errJson.error ?? 'Failed to publish request.');
      }

      setItemName('');
      setHospitalLocation('');
      setContactInfo('');
      setUnitsNeeded(1);
      setFormSuccess('Emergency supply request published.');
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pledgeTarget) return;
    setPledgeError(null);
    setPledging(true);

    try {
      const res = await fetch('/api/pledges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: pledgeTarget.id,
          eta_minutes: Number(etaMinutes),
          last_donation_date: lastDonationDate || null,
          donor_phone: donorPhone.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Pledge failed');

      alert('Pledge confirmed! The requester will instantly see your contact details and arrival ETA.');
      setPledgeTarget(null);
      loadData();
    } catch (err) {
      setPledgeError(err instanceof Error ? err.message : 'Error submitting pledge');
    } finally {
      setPledging(false);
    }
  };

  const handleVerifyPledge = async (pledgeId: string) => {
    if (actionLoading[pledgeId]) return;
    setActionLoading((prev) => ({ ...prev, [pledgeId]: true }));

    try {
      const res = await fetch('/api/pledges/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pledge_id: pledgeId }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Verification failed');
      }

      alert('Verified! Blood/Medicine marked as received and added to donor history.');
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error verifying donation');
    } finally {
      setActionLoading((prev) => ({ ...prev, [pledgeId]: false }));
    }
  };

  const handleArchive = async (requestId: string) => {
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Archived' }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
    } catch {
      alert('Error archiving post');
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
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white tracking-wide">LifeFlow</span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-950/70 border border-red-800/40 text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                Live Exchange
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-slate-200">{user?.full_name}</div>
              <div className="text-xs text-slate-400 capitalize">
                {user?.role} {user?.hospital_name ? `• ${user.hospital_name}` : ''}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Form & Donor History */}
          <div className="lg:col-span-1 space-y-6">
            
            {user?.role !== 'donor' ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-red-500" />
                  Post Emergency Request
                </h2>

                {formError && <div className="mb-4 p-2 bg-red-950 text-red-300 rounded text-xs">{formError}</div>}
                {formSuccess && <div className="mb-4 p-2 bg-emerald-950 text-emerald-300 rounded text-xs">{formSuccess}</div>}

                <form onSubmit={handlePostRequest} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setItemType('blood')}
                        className={`py-2 text-xs font-semibold rounded-lg border ${
                          itemType === 'blood' ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <Droplet className="w-3.5 h-3.5 inline mr-1" /> Blood
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemType('medicine')}
                        className={`py-2 text-xs font-semibold rounded-lg border ${
                          itemType === 'medicine' ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <Pill className="w-3.5 h-3.5 inline mr-1" /> Medicine
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Item / Blood Group</label>
                    <input
                      type="text"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="e.g. O-Negative or IVIG"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Units Needed</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={unitsNeeded}
                        onChange={(e) => setUnitsNeeded(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Urgency</label>
                      <select
                        value={urgency}
                        onChange={(e) => setUrgency(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-slate-100"
                      >
                        <option value="Critical">Critical</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Standard">Standard</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Hospital Location</label>
                    <input
                      type="text"
                      required
                      value={hospitalLocation}
                      onChange={(e) => setHospitalLocation(e.target.value)}
                      placeholder="e.g. Apollo Ward 4"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Emergency Phone</label>
                    <input
                      type="tel"
                      required
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors"
                  >
                    {submitting ? 'Publishing...' : 'Publish Emergency Request'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-red-500" />
                  Donation Eligibility Status
                </h3>
                {eligibility.eligible ? (
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800/40 rounded-lg">
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Eligible to Donate
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      You meet all medical safety interval criteria.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-950/60 border border-amber-800/40 rounded-lg">
                    <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                      <ShieldAlert className="w-4 h-4" /> 90-Day Recovery Period
                    </span>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Next eligible in <strong className="text-white">{eligibility.daysRemaining} days</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Donor Donation History Log */}
            {user?.role === 'donor' && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  Verified Donation History
                </h3>

                {donationHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No verified donation records yet.</p>
                ) : (
                  <div className="space-y-2">
                    {donationHistory.map((item) => (
                      <div key={item.id} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
                        <div className="font-semibold text-slate-200">{item.item_name} ({item.units_donated} Unit)</div>
                        <div className="text-slate-400">{item.hospital_location}</div>
                        <div className="text-[10px] text-emerald-400 mt-1">
                          Verified on {new Date(item.verified_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Feed and Incoming Pledges */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-wrap gap-2">
              {(['all', 'blood', 'medicine', 'critical', 'mine'] as Filter[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                    activeFilter === tab ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {tab === 'mine' ? 'My Posts' : tab}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {filteredRequests.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                  No active shortages listed.
                </div>
              ) : (
                filteredRequests.map((req) => {
                  const reqPledges = incomingPledges.filter((p) => p.request_id === req.id);

                  return (
                    <div key={req.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-950 border border-red-800 text-red-400 mr-2">
                            {req.urgency}
                          </span>
                          <h3 className="text-lg font-bold text-white inline-block">{req.item_name}</h3>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-extrabold text-red-500">{req.units_needed}</span>
                          <div className="text-[10px] text-slate-400">Units Needed</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-2 text-xs text-slate-400 border-t border-slate-800">
                        <div><MapPin className="w-3.5 h-3.5 inline mr-1 text-slate-500" />{req.hospital_location}</div>
                        <div><User className="w-3.5 h-3.5 inline mr-1 text-slate-500" />{req.requester_name}</div>
                        <div><Phone className="w-3.5 h-3.5 inline mr-1 text-slate-500" />{req.contact_info}</div>
                      </div>

                      {/* Donor Action */}
                      {user?.role === 'donor' && req.requester_id !== user.id && (
                        <div className="pt-3 border-t border-slate-800 flex justify-end">
                          <button
                            onClick={() => setPledgeTarget(req)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <HeartHandshake className="w-4 h-4" />
                            Pledge {req.item_type === 'blood' ? 'Blood' : 'Medicine'}
                          </button>
                        </div>
                      )}

                      {/* Requester Action: Automatically shows pledges with contact & time */}
                      {user && req.requester_id === user.id && (
                        <div className="pt-3 border-t border-slate-800 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold text-slate-300">Live Incoming Pledges:</span>
                            <button
                              onClick={() => handleArchive(req.id)}
                              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5" /> Archive Post
                            </button>
                          </div>

                          {reqPledges.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">No incoming pledges yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {reqPledges.map((p) => (
                                <div key={p.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="text-xs space-y-1">
                                    <div className="font-semibold text-slate-200 flex items-center gap-2">
                                      <Phone className="w-3 h-3 text-red-500" />
                                      <span>Donor Phone: <strong className="text-white">{p.donor_phone || 'Not shared'}</strong></span>
                                    </div>
                                    <div className="text-amber-400 flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> ETA: Reaching in ~{p.eta_minutes} mins
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Pledged at: {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(p.created_at).toLocaleDateString()})
                                    </div>
                                  </div>

                                  {/* Verification Button (Requester can click anytime upon receipt) */}
                                  <button
                                    disabled={actionLoading[p.id]}
                                    onClick={() => handleVerifyPledge(p.id)}
                                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20"
                                  >
                                    {actionLoading[p.id] ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    )}
                                    Mark Received & Verified
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>
      </main>

      {/* Modal: Donor Pledge Form */}
      {pledgeTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-red-500" />
                Pledge for {pledgeTarget.item_name}
              </h3>
              <button onClick={() => setPledgeTarget(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {pledgeError && (
              <div className="mb-4 p-2.5 bg-red-950/80 border border-red-800 text-red-300 rounded text-xs">
                {pledgeError}
              </div>
            )}

            <form onSubmit={submitPledge} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Estimated Arrival Time (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  required
                  value={etaMinutes}
                  onChange={(e) => setEtaMinutes(Number(e.target.value))}
                  placeholder="e.g. 30"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              {pledgeTarget.item_type === 'blood' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Last Blood Donation Date
                  </label>
                  <input
                    type="date"
                    value={lastDonationDate}
                    onChange={(e) => setLastDonationDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  />
                  <span className="text-[10px] text-slate-500">
                    Medical guidelines recommend a 90-day interval between blood donations.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Contact Phone Number (Shared with Requester)
                </label>
                <input
                  type="tel"
                  required
                  value={donorPhone}
                  onChange={(e) => setDonorPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPledgeTarget(null)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pledging}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {pledging ? 'Submitting...' : 'Confirm Pledge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}