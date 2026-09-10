'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MedicalRequest, Profile, Pledge, DonationHistory } from '@/types/database.types';
import {
  Activity,
  AlertTriangle,
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
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Calendar,
  Check,
  X,
} from 'lucide-react';

type Filter = 'all' | 'blood' | 'medicine' | 'critical' | 'mine';

interface AlertBanner {
  type: 'success' | 'error' | 'info';
  message: string;
}

function getDonationEligibility(lastDonationDate: string | null | undefined): {
  isEligible: boolean;
  daysRemaining: number;
  daysElapsed: number | null;
} {
  if (!lastDonationDate) {
    return { isEligible: true, daysRemaining: 0, daysElapsed: null };
  }

  const lastDate = new Date(lastDonationDate);
  if (isNaN(lastDate.getTime())) {
    return { isEligible: true, daysRemaining: 0, daysElapsed: null };
  }

  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcLast = Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  const diffDays = Math.floor((utcToday - utcLast) / (1000 * 60 * 60 * 24));

  if (diffDays < 90 && diffDays >= 0) {
    return { isEligible: false, daysRemaining: 90 - diffDays, daysElapsed: diffDays };
  }

  return { isEligible: true, daysRemaining: 0, daysElapsed: diffDays };
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Authentication & User State
  const [user, setUser] = useState<Profile | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Top Alert Banner (Auto-dismiss after 4 seconds)
  const [alertBanner, setAlertBanner] = useState<AlertBanner | null>(null);

  // Requests, Pledges, and Donation History State
  const [requests, setRequests] = useState<MedicalRequest[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [donationHistory, setDonationHistory] = useState<DonationHistory[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>('all');

  // Request Form State
  const [itemType, setItemType] = useState<'blood' | 'medicine'>('blood');
  const [itemName, setItemName] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [urgency, setUrgency] = useState<'Critical' | 'Urgent' | 'Standard'>('Critical');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-Request / Per-Pledge Action State
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [verifyingPledgeId, setVerifyingPledgeId] = useState<string | null>(null);

  // Pledge Modal State
  const [selectedRequestForPledge, setSelectedRequestForPledge] = useState<MedicalRequest | null>(null);
  const [pledgeUnits, setPledgeUnits] = useState<number>(1);
  const [pledgeEta, setPledgeEta] = useState<number>(30);
  const [pledgeLastDate, setPledgeLastDate] = useState<string>('');
  const [pledgePhone, setPledgePhone] = useState<string>('');
  const [pledgeSubmitting, setPledgeSubmitting] = useState(false);
  const [pledgeError, setPledgeError] = useState<string | null>(null);

  // Hydration Mount State
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // DIRECTIVE 4: Auto-dismiss alert banner after 4 seconds
  useEffect(() => {
    if (!alertBanner) return;
    const timer = setTimeout(() => {
      setAlertBanner(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [alertBanner]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (!authUser || authError) {
        router.push('/auth');
        return;
      }

      // 1. Fetch Profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileErr && profileErr.code === 'PGRST116') {
        const fallbackProfile: Profile = {
          id: authUser.id,
          full_name: authUser.email ?? 'Verified User',
          role: 'caregiver',
          hospital_name: null,
          phone_number: null,
          blood_group: null,
          last_donation_date: null,
          created_at: new Date().toISOString(),
        };
        setUser(fallbackProfile);
        setHasProfile(false);
      } else if (profileData) {
        const loadedProfile = profileData as Profile;
        setUser(loadedProfile);
        setHasProfile(true);
        if (loadedProfile.phone_number) {
          setPledgePhone(loadedProfile.phone_number);
        }
        if (loadedProfile.last_donation_date) {
          setPledgeLastDate(loadedProfile.last_donation_date);
        }
      }

      // 2. Fetch Active Requests
      const resRequests = await fetch('/api/requests');
      if (resRequests.ok) {
        const reqs = (await resRequests.json()) as MedicalRequest[];
        if (Array.isArray(reqs)) {
          setRequests(reqs);
        }
      }

      // 3. Fetch Pledges (DIRECTIVE 1: query /api/pledges for user's donor & requester pledges)
      const resPledges = await fetch('/api/pledges');
      if (resPledges.ok) {
        const pldgs = (await resPledges.json()) as Pledge[];
        if (Array.isArray(pldgs)) {
          setPledges(pldgs);
        }
      } else {
        // Fallback directly to supabase client if route is temporarily unavailable
        const { data: pledgesData } = await supabase
          .from('pledges')
          .select('*, profiles:donor_id(full_name, phone_number)')
          .order('created_at', { ascending: false });

        if (pledgesData && Array.isArray(pledgesData)) {
          setPledges(pledgesData as Pledge[]);
        }
      }

      // 4. Fetch User's Verified Donation History
      const { data: historyData } = await supabase
        .from('donation_history')
        .select('*')
        .eq('donor_id', authUser.id)
        .order('verified_at', { ascending: false });

      if (historyData && Array.isArray(historyData)) {
        setDonationHistory(historyData as DonationHistory[]);
      }
    } catch (err: unknown) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time Subscriptions on requests, pledges, and donation_history
  useEffect(() => {
    const channel = supabase
      .channel('lifeflow-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReq = payload.new as MedicalRequest;
            if (newReq.status === 'Active') {
              setRequests((prev) => {
                if (prev.some((r) => r.id === newReq.id)) return prev;
                return [newReq, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedReq = payload.new as MedicalRequest;
            setRequests((prev) => {
              if (updatedReq.status !== 'Active') {
                return prev.filter((r) => r.id !== updatedReq.id);
              }
              return prev.map((r) => (r.id === updatedReq.id ? updatedReq : r));
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setRequests((prev) => prev.filter((r) => r.id !== oldId));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pledges' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPledge = payload.new as Pledge;
            setPledges((prev) => {
              if (prev.some((p) => p.id === newPledge.id)) return prev;
              return [newPledge, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedPledge = payload.new as Pledge;
            setPledges((prev) =>
              prev.map((p) => (p.id === updatedPledge.id ? { ...p, ...updatedPledge } : p))
            );
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setPledges((prev) => prev.filter((p) => p.id !== oldId));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'donation_history' },
        (payload) => {
          const newHistory = payload.new as DonationHistory;
          if (user && newHistory.donor_id === user.id) {
            setDonationHistory((prev) => [newHistory, ...prev]);
            setUser((prev) => (prev ? { ...prev, last_donation_date: newHistory.verified_at.split('T')[0] } : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  };

  // Permissive Request Posting (all authenticated users)
  const handlePostRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!itemName.trim() || !hospitalLocation.trim() || !contactInfo.trim() || unitsNeeded < 1) {
      setFormError('Please enter all required fields with a valid units count.');
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
        throw new Error(errJson.error ?? 'Failed to publish emergency request.');
      }

      const created = (await res.json()) as MedicalRequest;
      setRequests((prev) => [created, ...prev]);
      setItemName('');
      setHospitalLocation('');
      setContactInfo('');
      setUnitsNeeded(1);

      // Auto-dismissing top banner
      setAlertBanner({
        type: 'success',
        message: 'Emergency shortage request broadcasted to the network.',
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Pledge Modal (defaults to 1 unit)
  const openPledgeModal = (req: MedicalRequest) => {
    setSelectedRequestForPledge(req);
    setPledgeUnits(1);
    setPledgeEta(30);
    setPledgeError(null);
    if (user?.last_donation_date) {
      setPledgeLastDate(user.last_donation_date);
    }
    if (user?.phone_number) {
      setPledgePhone(user.phone_number);
    }
  };

  // Submit Pledge with 90-day Eligibility Guard
  const handlePledgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestForPledge) return;

    setPledgeError(null);

    if (!pledgePhone.trim()) {
      setPledgeError('Contact phone number is required so the hospital can reach you.');
      return;
    }

    if (pledgeUnits < 1 || pledgeUnits > selectedRequestForPledge.units_needed) {
      setPledgeError(`Pledged units must be between 1 and ${selectedRequestForPledge.units_needed}.`);
      return;
    }

    if (pledgeEta < 1) {
      setPledgeError('Estimated arrival time must be at least 1 minute.');
      return;
    }

    // Client-side 90-day validation check for whole blood donations
    if (selectedRequestForPledge.item_type === 'blood' && pledgeLastDate) {
      const eligibility = getDonationEligibility(pledgeLastDate);
      if (!eligibility.isEligible) {
        setPledgeError(
          `Ineligible to pledge blood: 90 days must elapse between donations. You have ${eligibility.daysRemaining} days remaining.`
        );
        return;
      }
    }

    setPledgeSubmitting(true);
    try {
      const res = await fetch('/api/pledges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selectedRequestForPledge.id,
          units_pledged: pledgeUnits,
          eta_minutes: pledgeEta,
          last_donation_date: pledgeLastDate || null,
          donor_phone: pledgePhone.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Pledge submission failed');
      }

      const createdPledge = (await res.json()) as Pledge;
      // Immediately update local pledges state
      setPledges((prev) => [createdPledge, ...prev]);
      setSelectedRequestForPledge(null);

      // Auto-dismissing top banner
      setAlertBanner({
        type: 'success',
        message: 'Pledge submitted successfully. Awaiting requester receipt verification.',
      });
    } catch (err: unknown) {
      setPledgeError(err instanceof Error ? err.message : 'Error submitting pledge');
    } finally {
      setPledgeSubmitting(false);
    }
  };

  // Requester Action: Mark Received & Verified
  const handleVerifyPledge = async (pledgeId: string) => {
    setVerifyingPledgeId(pledgeId);
    try {
      const res = await fetch('/api/pledges/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pledge_id: pledgeId }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Verification failed');
      }

      const result = (await res.json()) as {
        success: boolean;
        pledge_id: string;
        request_id: string;
        units_needed: number;
        request_status: string;
      };

      // DIRECTIVE 2: Immediately mark pledge as Verified in local state
      // (This will automatically filter it out from "Incoming Donor Pledges")
      setPledges((prev) =>
        prev.map((p) =>
          p.id === pledgeId ? { ...p, status: 'Verified', verified_at: new Date().toISOString() } : p
        )
      );

      // Update local requests state
      setRequests((prev) => {
        if (result.request_status === 'Fulfilled' || result.units_needed <= 0) {
          return prev.filter((r) => r.id !== result.request_id);
        }
        return prev.map((r) =>
          r.id === result.request_id
            ? { ...r, units_needed: result.units_needed, status: result.request_status as MedicalRequest['status'] }
            : r
        );
      });

      setAlertBanner({
        type: 'success',
        message: 'Pledge verified successfully and recorded into donation history.',
      });

      // Refetch history and requests
      fetchData();
    } catch (err: unknown) {
      setAlertBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to verify donation.',
      });
    } finally {
      setVerifyingPledgeId(null);
    }
  };

  // Requester Action: Archive Request
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
      setAlertBanner({
        type: 'info',
        message: 'Shortage request archived.',
      });
    } catch (err: unknown) {
      setAlertBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error archiving request.',
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (activeFilter === 'blood') return r.item_type === 'blood';
      if (activeFilter === 'medicine') return r.item_type === 'medicine';
      if (activeFilter === 'critical') return r.urgency === 'Critical';
      if (activeFilter === 'mine') return user ? r.requester_id === user.id : false;
      return true;
    });
  }, [requests, activeFilter, user]);

  const donorEligibility = useMemo(() => {
    return getDonationEligibility(user?.last_donation_date);
  }, [user?.last_donation_date]);

  function formatTime(isoString: string): string {
    if (!mounted) return isoString;
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-red-500/30 selection:text-red-200">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-wide">LifeFlow</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/70 border border-red-800/40 text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live Lifeline Network
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Community Blood &amp; Rare Medicine Exchange
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-slate-100">{user?.full_name}</div>
              <div className="text-xs text-slate-400 flex items-center justify-end gap-1.5">
                {hasProfile && user?.role && (
                  <span className="capitalize px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                    {user.role}
                  </span>
                )}
                {user?.hospital_name && <span>• {user.hospital_name}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors border border-slate-800 cursor-pointer disabled:opacity-50"
            >
              {signingOut ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <LogOut className="w-4 h-4" />}
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* DIRECTIVE 4: Auto-Dismissing Top Alert Banner (4 seconds) */}
        {alertBanner && (
          <div
            className={`mb-6 p-4 rounded-xl border flex items-center justify-between shadow-xl transition-all ${
              alertBanner.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : alertBanner.type === 'error'
                ? 'bg-red-950/90 border-red-800 text-red-200'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-3 text-xs font-semibold">
              {alertBanner.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : alertBanner.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              ) : (
                <Activity className="w-5 h-5 text-sky-400 shrink-0" />
              )}
              <span>{alertBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertBanner(null)}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Metric Summary Ribbon & Eligibility Card */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Active Emergencies */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active Emergencies</div>
              <div className="text-2xl font-bold text-white mt-1">{requests.length}</div>
            </div>
            <Activity className="w-7 h-7 text-red-500 opacity-80" />
          </div>

          {/* Critical Urgency */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-red-400 font-medium uppercase tracking-wider">Critical Urgency</div>
              <div className="text-2xl font-bold text-red-500 mt-1">
                {requests.filter((r) => r.urgency === 'Critical').length}
              </div>
            </div>
            <AlertTriangle className="w-7 h-7 text-red-500 opacity-80" />
          </div>

          {/* My Active Posts */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">My Active Posts</div>
              <div className="text-2xl font-bold text-slate-200 mt-1">
                {user ? requests.filter((r) => r.requester_id === user.id).length : 0}
              </div>
            </div>
            <User className="w-7 h-7 text-slate-400 opacity-80" />
          </div>

          {/* 90-Day Blood Donation Eligibility Card */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Donor Eligibility</span>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>
            {donorEligibility.isEligible ? (
              <div className="flex items-center gap-2 text-emerald-400 mt-1">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">Eligible to Donate</div>
                  <div className="text-[11px] text-slate-400">90-day cool-off verified</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 mt-1">
                <Clock className="w-5 h-5 flex-shrink-0 text-amber-500" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">{donorEligibility.daysRemaining} Days Remaining</div>
                  <div className="text-[11px] text-slate-400">90-day donation cool-off active</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Verified Donation History Section */}
        {donationHistory.length > 0 && (
          <div className="mb-8 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                My Verified Donation History ({donationHistory.length})
              </h3>
              <span className="text-xs text-emerald-400 font-semibold">Hospital Verified</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {donationHistory.map((item) => (
                <div key={item.id} className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-100">
                    <span>{item.item_name}</span>
                    <span className="text-emerald-400 font-extrabold">{item.units_donated} Unit(s)</span>
                  </div>
                  <div className="text-slate-400 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{item.hospital_location}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1 border-t border-slate-800/60">
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span>Verified: {formatTime(item.verified_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Post Emergency Request (Visible to ALL roles) */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sticky top-24 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-red-500" />
                Post Emergency Request
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Broadcast urgent shortages to all nearby community donors and network partners
              </p>

              {formError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handlePostRequest} className="space-y-4">
                {/* Item Type Toggle */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Item Category
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setItemType('blood')}
                      className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        itemType === 'blood'
                          ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-950'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Droplet className="w-3.5 h-3.5" /> Blood
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('medicine')}
                      className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        itemType === 'medicine'
                          ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-950'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Pill className="w-3.5 h-3.5" /> Medicine
                    </button>
                  </div>
                </div>

                {/* Specific Item Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Specific Item Name
                  </label>
                  <input
                    type="text"
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder={itemType === 'blood' ? 'e.g., O-Negative Whole Blood' : 'e.g., Factor VIII 500 IU'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                {/* Units Needed & Urgency */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Units Needed
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={unitsNeeded}
                      onChange={(e) => setUnitsNeeded(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Urgency
                    </label>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as 'Critical' | 'Urgent' | 'Standard')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 transition-colors"
                    >
                      <option value="Critical">Critical</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Standard">Standard</option>
                    </select>
                  </div>
                </div>

                {/* Hospital / Ward Location */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Hospital / Ward Location
                  </label>
                  <input
                    type="text"
                    required
                    value={hospitalLocation}
                    onChange={(e) => setHospitalLocation(e.target.value)}
                    placeholder="St. Jude ICU, Trauma Ward 3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                {/* Emergency Contact Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Emergency Contact (Direct Line)
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-900/30"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Publish Emergency Request'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Live Shortage Feed & Actions */}
          <div className="lg:col-span-2">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-800 pb-4">
              {(['all', 'blood', 'medicine', 'critical', 'mine'] as Filter[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                    activeFilter === tab
                      ? 'bg-red-600 text-white shadow-md shadow-red-900/20'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {tab === 'mine' ? 'My Posts' : tab}
                </button>
              ))}
            </div>

            {/* Empty State */}
            {filteredRequests.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl">
                <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">No active shortages found</h3>
                <p className="text-xs text-slate-500 mt-1">
                  There are currently no active emergency posts matching this filter criteria.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {filteredRequests.map((req) => {
                  const isOwner = Boolean(user && req.requester_id === user.id);
                  const isActionBusy = Boolean(actionLoading[req.id]);

                  // All pledges logged for this request
                  const requestPledges = pledges.filter((p) => p.request_id === req.id);

                  // DIRECTIVE 2: Under "Incoming Donor Pledges", only display pledges that have status === 'Pending'
                  const pendingIncomingPledges = requestPledges.filter(
                    (p) => p.status === 'Pending' || p.status === 'Pledged'
                  );

                  // DIRECTIVE 3: Check if current donor has already submitted a pending pledge for this request
                  const hasUserPendingPledge = Boolean(
                    user &&
                      pledges.some(
                        (p) =>
                          p.request_id === req.id &&
                          p.donor_id === user.id &&
                          (p.status === 'Pending' || p.status === 'Pledged')
                      )
                  );

                  return (
                    <div
                      key={req.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700/80 transition-all shadow-md relative overflow-hidden"
                    >
                      {/* Urgency Color Accent */}
                      <div
                        className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                          req.urgency === 'Critical'
                            ? 'bg-red-500'
                            : req.urgency === 'Urgent'
                            ? 'bg-amber-500'
                            : 'bg-sky-500'
                        }`}
                      />

                      <div className="flex items-start justify-between gap-4 mb-3 pl-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                req.urgency === 'Critical'
                                  ? 'bg-red-950/80 border-red-800 text-red-400'
                                  : req.urgency === 'Urgent'
                                  ? 'bg-amber-950/80 border-amber-800 text-amber-400'
                                  : 'bg-sky-950/80 border-sky-800 text-sky-400'
                              }`}
                            >
                              {req.urgency}
                            </span>
                            <span className="text-xs text-slate-400 uppercase tracking-wide flex items-center gap-1 font-semibold">
                              {req.item_type === 'blood' ? (
                                <Droplet className="w-3.5 h-3.5 text-red-500" />
                              ) : (
                                <Pill className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              {req.item_type}
                            </span>
                            <span className="text-[11px] text-slate-500 ml-2">
                              {formatTime(req.created_at)}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-white tracking-tight">{req.item_name}</h3>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-2xl font-extrabold text-red-500">{req.units_needed}</div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                            {req.units_needed === 1 ? 'Unit Needed' : 'Units Needed'}
                          </div>
                        </div>
                      </div>

                      {/* Request Metadata */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 border-t border-slate-800/80 text-xs text-slate-400 pl-2">
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

                      {/* Actions Footer */}
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800/80 pl-2">
                        <div className="text-xs text-slate-400">
                          {pendingIncomingPledges.length > 0 && (
                            <span className="text-amber-400/90 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {pendingIncomingPledges.length} pending response(s)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* DIRECTIVE 3: Dynamic button state when user already pledged */}
                          {hasUserPendingPledge ? (
                            <button
                              type="button"
                              disabled
                              className="px-3.5 py-1.5 bg-slate-800/90 border border-amber-600/40 text-amber-400 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-not-allowed opacity-90 shadow-inner"
                              title="You have already submitted a pending pledge for this shortage"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              Pledged (Pending Verification)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPledgeModal(req)}
                              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-red-950"
                            >
                              <HeartHandshake className="w-4 h-4" />
                              Pledge 1 Unit
                            </button>
                          )}

                          {/* Requester-only moderation action */}
                          {isOwner && (
                            <button
                              type="button"
                              disabled={isActionBusy}
                              onClick={() => handleArchive(req.id)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer disabled:opacity-50"
                            >
                              {isActionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                              Archive
                            </button>
                          )}
                        </div>
                      </div>

                      {/* DIRECTIVE 2: Incoming Pledges Panel (Only displays pending pledges with status === 'Pending') */}
                      {isOwner && pendingIncomingPledges.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-800/90 pl-2 space-y-2">
                          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              Incoming Donor Pledges ({pendingIncomingPledges.length})
                            </span>
                            <span className="text-[10px] text-amber-400/90 font-semibold px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/40">
                              Pending Verification
                            </span>
                          </div>
                          <div className="space-y-2">
                            {pendingIncomingPledges.map((pledge) => {
                              const isVerifyingThis = verifyingPledgeId === pledge.id;
                              return (
                                <div
                                  key={pledge.id}
                                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-100">
                                        {pledge.units_pledged} Unit(s) Pledged
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-800">
                                        Pending
                                      </span>
                                      {pledge.profiles?.full_name && (
                                        <span className="text-slate-400 font-medium">
                                          by {pledge.profiles.full_name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-slate-400 flex items-center gap-3">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-500" /> ETA: ~{pledge.eta_minutes} mins
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Phone className="w-3 h-3 text-slate-500" />
                                        <a href={`tel:${pledge.donor_phone}`} className="text-red-400 underline">
                                          {pledge.donor_phone}
                                        </a>
                                      </span>
                                      <span>{formatTime(pledge.created_at)}</span>
                                    </div>
                                  </div>

                                  <div>
                                    <button
                                      type="button"
                                      disabled={isVerifyingThis}
                                      onClick={() => handleVerifyPledge(pledge.id)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-950"
                                    >
                                      {isVerifyingThis ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          <span>Verifying...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Check className="w-3.5 h-3.5" />
                                          <span>Mark Received &amp; Verified</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Pledge Modal */}
      {selectedRequestForPledge && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedRequestForPledge(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/70 border border-red-800/40 text-red-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                Emergency Pledge Commitment
              </div>
              <h3 className="text-lg font-bold text-white">
                Pledge for {selectedRequestForPledge.item_name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Location: {selectedRequestForPledge.hospital_location} • Needed: {selectedRequestForPledge.units_needed} Units
              </p>
            </div>

            {pledgeError && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{pledgeError}</span>
              </div>
            )}

            <form onSubmit={handlePledgeSubmit} className="space-y-4">
              {/* Units to Pledge */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Units to Pledge
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedRequestForPledge.units_needed}
                  required
                  value={pledgeUnits}
                  onChange={(e) => setPledgeUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Estimated Arrival Time */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Estimated Arrival Time (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pledgeEta}
                  onChange={(e) => setPledgeEta(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                  placeholder="30"
                />
              </div>

              {/* Last Donation Date (for 90-day check) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Date of Last Donation (For 90-Day Clinical Cool-Off)
                </label>
                <input
                  type="date"
                  value={pledgeLastDate}
                  onChange={(e) => setPledgeLastDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                />
                {selectedRequestForPledge.item_type === 'blood' && pledgeLastDate && (
                  <div className="mt-1.5">
                    {(() => {
                      const elig = getDonationEligibility(pledgeLastDate);
                      if (!elig.isEligible) {
                        return (
                          <div className="text-[11px] text-amber-400 flex items-center gap-1 font-semibold">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Ineligible: {elig.daysRemaining} days remaining in 90-day cool-off period.</span>
                          </div>
                        );
                      }
                      return (
                        <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Eligible for donation (&gt;90 days elapsed).</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Donor Contact Phone */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Your Contact Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={pledgePhone}
                  onChange={(e) => setPledgePhone(e.target.value)}
                  placeholder="+1 (555) 019-2834"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRequestForPledge(null)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pledgeSubmitting}
                  className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-900/30"
                >
                  {pledgeSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    'Confirm Pledge'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
