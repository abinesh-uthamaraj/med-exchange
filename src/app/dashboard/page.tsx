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
  Radio,
  Layers,
  Search,
  Menu,
  Heart,
  Sparkles,
  Building2,
  Send,
  SlidersHorizontal,
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
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mobile Navigation Drawer State
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

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

  // Auto-dismiss alert banner after 4 seconds
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

      // 3. Fetch Pledges
      const resPledges = await fetch('/api/pledges');
      if (resPledges.ok) {
        const pldgs = (await resPledges.json()) as Pledge[];
        if (Array.isArray(pldgs)) {
          setPledges(pldgs);
        }
      } else {
        const { data: pledgesData } = await supabase
          .from('pledges')
          .select('*, profiles:donor_id(full_name, phone_number)')
          .order('created_at', { ascending: false });

        if (pledgesData && Array.isArray(pledgesData)) {
          setPledges(pledgesData as Pledge[]);
        }
      }

      // 4. Fetch User's Verified Donation History (only for donors)
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
            setPledges((prev) => [newPledge, ...prev]);
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
      setPledges((prev) => [createdPledge, ...prev]);
      setSelectedRequestForPledge(null);

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

      setPledges((prev) =>
        prev.map((p) =>
          p.id === pledgeId ? { ...p, status: 'Verified', verified_at: new Date().toISOString() } : p
        )
      );

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

  const isDonor = user?.role === 'donor';

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (activeFilter === 'blood' && r.item_type !== 'blood') return false;
      if (activeFilter === 'medicine' && r.item_type !== 'medicine') return false;
      if (activeFilter === 'critical' && r.urgency !== 'Critical') return false;
      if (activeFilter === 'mine' && (!user || r.requester_id !== user.id)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.item_name.toLowerCase().includes(q);
        const matchesLocation = r.hospital_location.toLowerCase().includes(q);
        const matchesRequester = r.requester_name.toLowerCase().includes(q);
        return matchesName || matchesLocation || matchesRequester;
      }
      return true;
    });
  }, [requests, activeFilter, user, searchQuery]);

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

  const scrollToPostRequest = () => {
    const el = document.getElementById('post-request-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToDonations = () => {
    const el = document.getElementById('donation-history-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060b13] flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.2)]">
            <Activity className="w-8 h-8 text-red-500 animate-pulse" />
          </div>
          <div className="absolute inset-0 rounded-2xl border-2 border-red-500/40 animate-ping opacity-25" />
        </div>
        <div className="text-center">
          <h2 className="text-sm font-bold text-white tracking-wider uppercase">Connecting to LifeFlow Command Network</h2>
          <p className="text-xs text-slate-500 mt-1">Synchronizing emergency shortage registries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060b13] text-slate-100 flex flex-col lg:flex-row antialiased selection:bg-red-500/30 selection:text-red-200">
      {/* ========================================================================= */}
      {/* 1. LEFT SIDEBAR (Desktop Fixed / Mobile Drawer) */}
      {/* ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#090f1a] border-r border-slate-800/80 p-5 flex flex-col justify-between transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen lg:shrink-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-red-600/30 border border-red-500/30">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg text-white tracking-wide">LifeFlow</span>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>
                <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
                  Emergency Lifeline
                </p>
              </div>
            </div>
            {/* Close Button on Mobile */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 pt-2">
            <button
              type="button"
              onClick={() => {
                setActiveFilter('all');
                setSearchQuery('');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeFilter === 'all' && !searchQuery
                  ? 'bg-gradient-to-r from-red-600/20 to-red-600/5 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(220,38,38,0.15)] font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Live Shortage Feed</span>
            </button>

            <button
              type="button"
              onClick={() => {
                scrollToPostRequest();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all"
            >
              <PlusCircle className="w-4 h-4 text-red-500" />
              <span>Post Emergency Request</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveFilter('mine');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeFilter === 'mine'
                  ? 'bg-gradient-to-r from-red-600/20 to-red-600/5 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(220,38,38,0.15)] font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>My Active Posts</span>
            </button>

            {/* Donation History (DONOR ONLY) */}
            {isDonor && (
              <button
                type="button"
                onClick={() => {
                  scrollToDonations();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>My Donation History</span>
              </button>
            )}
          </nav>
        </div>

        {/* Motivation Card at bottom of sidebar */}
        <div className="pt-4 border-t border-slate-800/70 space-y-4">
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/40 border border-red-900/30 rounded-2xl p-4 relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-2 mb-2 text-red-400 font-bold text-xs uppercase tracking-wider">
              <Heart className="w-4 h-4 text-red-500 fill-red-500/20" />
              <span>Together We Save</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every pledged unit of blood or scarce medicine directly stabilizes an ICU emergency.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Real-time hospital peer mesh</span>
            </div>
          </div>

          {/* User Quick Info */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-extrabold text-slate-200 shrink-0 uppercase">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{user?.full_name}</div>
                <div className="text-[10px] text-slate-400 capitalize truncate">{user?.role}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* TOP HEADER */}
        <header className="sticky top-0 z-30 bg-[#070d17]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Command Dashboard</span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/70 border border-red-800/40 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                  Live Sync
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Hospital Network Blood &amp; Rare Medicine Exchange
              </p>
            </div>
          </div>

          {/* Search-style Visual Filter Input */}
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block w-72">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search blood, medicine, hospital..."
                className="w-full bg-[#0a111e] border border-slate-800/80 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/40 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* User Profile Pill */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-800/80">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white">{user?.full_name}</div>
                <div className="text-[10px] flex items-center justify-end gap-1.5 text-slate-400">
                  <span
                    className={`capitalize font-semibold px-1.5 py-0.2 rounded text-[10px] ${
                      user?.role === 'donor'
                        ? 'bg-red-950/80 text-red-400 border border-red-800/40'
                        : user?.role === 'hospital'
                        ? 'bg-sky-950/80 text-sky-400 border border-sky-800/40'
                        : 'bg-amber-950/80 text-amber-400 border border-amber-800/40'
                    }`}
                  >
                    {user?.role}
                  </span>
                  {user?.hospital_name && <span className="truncate max-w-[120px]">• {user.hospital_name}</span>}
                </div>
              </div>

              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-rose-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-red-950 border border-red-400/30 shrink-0">
                {user?.full_name?.charAt(0) || 'U'}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                title="Sign Out"
                className="hidden sm:flex px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold items-center gap-1.5 border border-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : <LogOut className="w-3.5 h-3.5" />}
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN BODY CONTAINER */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto space-y-8">
          {/* AUTO-DISMISSING ALERT BANNER (4 seconds) */}
          {alertBanner && (
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between shadow-2xl transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
                alertBanner.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-800/80 text-emerald-200 shadow-emerald-950/50'
                  : alertBanner.type === 'error'
                  ? 'bg-red-950/90 border-red-800/80 text-red-200 shadow-red-950/50'
                  : 'bg-slate-900 border-slate-700 text-slate-200 shadow-slate-950/50'
              }`}
            >
              <div className="flex items-center gap-3 text-xs font-semibold">
                {alertBanner.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : alertBanner.type === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                ) : (
                  <Sparkles className="w-5 h-5 text-sky-400 shrink-0" />
                )}
                <span>{alertBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAlertBanner(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. HERO / WELCOME AREA */}
          {/* ========================================================================= */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0d1527] via-[#09101d] to-[#120a13] border border-slate-800/80 p-6 sm:p-8 shadow-2xl">
            {/* Subtle glow and medical background accents */}
            <div className="absolute -top-12 -right-12 w-64 h-64 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/50 text-red-400 text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span>Clinical Command Network</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Welcome back, {user?.full_name || 'Medical Responder'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-normal">
                  Your compassion keeps the emergency medical network resilient. Broadcast critical shortages,
                  pledge verified units, and coordinate lifesaving patient delivery across regional facilities.
                </p>
              </div>

              {/* Heartbeat ECG Graphic Badge */}
              <div className="flex flex-col items-start md:items-end justify-center shrink-0">
                <div className="bg-[#0b1220]/80 border border-slate-800/80 rounded-2xl p-4 shadow-xl flex items-center gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Network Status
                    </div>
                    <div className="text-sm font-extrabold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>100% Operational</span>
                    </div>
                  </div>
                  <div className="w-24 h-8 flex items-center">
                    <svg className="w-full h-full text-red-500/80" viewBox="0 0 100 30" fill="none">
                      <path
                        d="M0 15 H30 L35 5 L42 25 L48 10 L52 18 L56 15 H100"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 4. STATISTICS CARDS */}
          {/* ========================================================================= */}
          <section
            className={`grid gap-4 ${
              isDonor ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
            }`}
          >
            {/* Active Emergencies */}
            <div className="bg-[#09101d] border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden shadow-lg group hover:border-slate-700/80 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Active Shortages
                </span>
                <div className="w-9 h-9 rounded-xl bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-400">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">{requests.length}</div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                <span>Live across regional medical centers</span>
              </div>
            </div>

            {/* Critical Urgency */}
            <div className="bg-[#09101d] border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden shadow-lg group hover:border-red-800/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                  Critical Urgency
                </span>
                <div className="w-9 h-9 rounded-xl bg-red-950/60 border border-red-800/60 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                  <AlertTriangle className="w-4 h-4 animate-bounce" />
                </div>
              </div>
              <div className="text-3xl font-black text-red-500 tracking-tight">
                {requests.filter((r) => r.urgency === 'Critical').length}
              </div>
              <div className="text-[11px] text-red-400/80 mt-1 flex items-center gap-1 font-medium">
                <span>Immediate replenishment required</span>
              </div>
            </div>

            {/* My Active Posts */}
            <div className="bg-[#09101d] border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden shadow-lg group hover:border-slate-700/80 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  My Active Posts
                </span>
                <div className="w-9 h-9 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-slate-300">
                  <Radio className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-100 tracking-tight">
                {user ? requests.filter((r) => r.requester_id === user.id).length : 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                <span>Requests broadcasted by your account</span>
              </div>
            </div>

            {/* Donor Eligibility Card (DONOR ONLY) */}
            {isDonor && (
              <div className="bg-[#09101d] border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden shadow-lg group hover:border-slate-700/80 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Donor Cool-off
                  </span>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                      donorEligibility.isEligible
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                        : 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                    }`}
                  >
                    {donorEligibility.isEligible ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>
                </div>
                <div className="text-3xl font-black tracking-tight text-white">
                  {donorEligibility.isEligible ? (
                    <span className="text-emerald-400">Eligible</span>
                  ) : (
                    <span>{donorEligibility.daysRemaining} Days</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {donorEligibility.isEligible
                    ? '90-day clinical interval satisfied'
                    : `Cool-off active (${donorEligibility.daysElapsed ?? 0}/90d elapsed)`}
                </div>

                {/* Progress bar for 90 days cool-off */}
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      donorEligibility.isEligible
                        ? 'bg-emerald-500 w-full'
                        : 'bg-gradient-to-r from-amber-500 to-rose-500'
                    }`}
                    style={{
                      width: donorEligibility.isEligible
                        ? '100%'
                        : `${Math.min(100, Math.round(((donorEligibility.daysElapsed ?? 0) / 90) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ========================================================================= */}
          {/* 5. DONATION HISTORY (DONOR ONLY) */}
          {/* ========================================================================= */}
          {isDonor && donationHistory.length > 0 && (
            <section
              id="donation-history-section"
              className="bg-[#09101d] border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      My Verified Donation History ({donationHistory.length})
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Formally confirmed and recorded by hospital clinical staff
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-800/50">
                  Hospital Certified
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                {donationHistory.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#060b13] border border-slate-800/80 p-4 rounded-2xl text-xs space-y-2 hover:border-slate-700/80 transition-all shadow-sm"
                  >
                    <div className="flex items-center justify-between font-bold text-white">
                      <span className="truncate pr-2">{item.item_name}</span>
                      <span className="text-emerald-400 font-black shrink-0 px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-800/40">
                        {item.units_donated} Unit(s)
                      </span>
                    </div>
                    <div className="text-slate-400 truncate flex items-center gap-1.5 text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{item.hospital_location}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 pt-2 flex items-center justify-between border-t border-slate-800/70">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </div>
                      <span>{formatTime(item.verified_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* 6. MAIN SPLIT LAYOUT: POST REQUEST & EMERGENCY FEED */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: Emergency Request Creation Form (4 cols) */}
            <div className="lg:col-span-4 sticky top-20" id="post-request-card">
              <div className="bg-[#09101d] border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/60 border border-red-800/50 text-red-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                    <Send className="w-3 h-3" />
                    Broadcast Shortage
                  </div>
                  <h2 className="text-lg font-black text-white tracking-tight">
                    Post Emergency Request
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Instantly broadcast urgent blood and medicine shortages to regional donors.
                  </p>
                </div>

                {formError && (
                  <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-800/80 text-red-300 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handlePostRequest} className="space-y-4">
                  {/* Item Type Segmented Toggle */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Supply Category
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-[#060b13] p-1 rounded-xl border border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setItemType('blood')}
                        className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          itemType === 'blood'
                            ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-900/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Droplet className="w-3.5 h-3.5" />
                        <span>Blood</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemType('medicine')}
                        className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          itemType === 'medicine'
                            ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-900/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Pill className="w-3.5 h-3.5" />
                        <span>Medicine</span>
                      </button>
                    </div>
                  </div>

                  {/* Specific Item Name */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Item / Blood Group Name
                    </label>
                    <input
                      type="text"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder={itemType === 'blood' ? 'e.g., O-Negative Whole Blood' : 'e.g., Factor VIII 500 IU'}
                      className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/40 transition-all"
                    />
                  </div>

                  {/* Units Needed & Urgency */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Units Needed
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={unitsNeeded}
                        onChange={(e) => setUnitsNeeded(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-red-500/80 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Urgency Level
                      </label>
                      <select
                        value={urgency}
                        onChange={(e) => setUrgency(e.target.value as 'Critical' | 'Urgent' | 'Standard')}
                        className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-red-500/80 transition-all"
                      >
                        <option value="Critical">Critical</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Standard">Standard</option>
                      </select>
                    </div>
                  </div>

                  {/* Hospital / Ward Location */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-500" />
                      <span>Hospital / Ward Location</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={hospitalLocation}
                      onChange={(e) => setHospitalLocation(e.target.value)}
                      placeholder="e.g., St. Jude ICU, Trauma Bay 2"
                      className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 transition-all"
                    />
                  </div>

                  {/* Emergency Contact Phone */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span>Emergency Direct Line</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="+1 (555) 019-2834"
                      className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:from-red-900 disabled:to-rose-950 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-950/50 hover:shadow-red-900/60 hover:-translate-y-0.5"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Broadcasting to Network...</span>
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-4 h-4" />
                        <span>Publish Emergency Request</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* RIGHT COLUMN: Live Shortage Feed (8 cols) */}
            <div className="lg:col-span-8 space-y-5">
              {/* Filter Tabs Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(['all', 'blood', 'medicine', 'critical', 'mine'] as Filter[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveFilter(tab)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        activeFilter === tab
                          ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-900/30'
                          : 'bg-[#09101d] text-slate-400 border border-slate-800/80 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {tab === 'mine' ? 'My Posts' : tab}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{filteredRequests.length} shortage(s) shown</span>
                </div>
              </div>

              {/* Empty State */}
              {filteredRequests.length === 0 ? (
                <div className="text-center py-20 bg-[#09101d]/60 border border-slate-800/80 rounded-3xl p-8 space-y-3 shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mx-auto text-slate-500">
                    <Inbox className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-white">No active shortages found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    There are currently no active emergency shortage requests matching your selected filter.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map((req) => {
                    const isOwner = Boolean(user && req.requester_id === user.id);
                    const isActionBusy = Boolean(actionLoading[req.id]);

                    // Pending pledges on this request
                    const requestPledges = pledges.filter((p) => p.request_id === req.id);
                    const pendingIncomingPledges = requestPledges.filter(
                      (p) => p.status === 'Pending' || p.status === 'Pledged'
                    );

                    // Check if current donor already has a pending pledge for this request
                    const hasUserPendingPledge = Boolean(
                      user &&
                        pledges.some(
                          (p) =>
                            p.request_id === req.id &&
                            p.donor_id === user.id &&
                            (p.status === 'Pending' || p.status === 'Pledged')
                        )
                    );

                    // Recovery interval evaluation for blood requests
                    const isBloodRequest = req.item_type === 'blood';
                    const inRecoveryPeriod = isBloodRequest && !donorEligibility.isEligible;

                    return (
                      <div
                        key={req.id}
                        className={`bg-[#09101d] border rounded-3xl p-6 relative overflow-hidden transition-all shadow-xl hover:shadow-2xl ${
                          req.urgency === 'Critical'
                            ? 'border-red-900/40 hover:border-red-700/60 shadow-red-950/20'
                            : req.urgency === 'Urgent'
                            ? 'border-amber-900/40 hover:border-amber-700/60'
                            : 'border-slate-800/80 hover:border-slate-700/80'
                        }`}
                      >
                        {/* Visual Glow Accent */}
                        <div
                          className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                            req.urgency === 'Critical'
                              ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                              : req.urgency === 'Urgent'
                              ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                              : 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.4)]'
                          }`}
                        />

                        {/* Top Metadata Row */}
                        <div className="flex items-start justify-between gap-4 mb-3 pl-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Urgency Badge */}
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                                  req.urgency === 'Critical'
                                    ? 'bg-red-950/80 border-red-800 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                                    : req.urgency === 'Urgent'
                                    ? 'bg-amber-950/80 border-amber-800 text-amber-400'
                                    : 'bg-sky-950/80 border-sky-800 text-sky-400'
                                }`}
                              >
                                {req.urgency} Urgency
                              </span>

                              {/* Category Badge */}
                              <span className="text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                                {req.item_type === 'blood' ? (
                                  <Droplet className="w-3.5 h-3.5 text-red-500" />
                                ) : (
                                  <Pill className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                                <span>{req.item_type}</span>
                              </span>

                              <span className="text-[11px] text-slate-500 font-medium">
                                • {formatTime(req.created_at)}
                              </span>
                            </div>

                            {/* Item Name */}
                            <h3 className="text-xl font-black text-white tracking-tight pt-1">
                              {req.item_name}
                            </h3>
                          </div>

                          {/* Units Needed Highlight */}
                          <div className="text-right shrink-0 bg-[#060b13] border border-slate-800/80 px-4 py-2 rounded-2xl">
                            <div className="text-2xl font-black text-red-500 tracking-tight">
                              {req.units_needed}
                            </div>
                            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                              {req.units_needed === 1 ? 'Unit Needed' : 'Units Needed'}
                            </div>
                          </div>
                        </div>

                        {/* Middle Facility & Contact Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3.5 border-t border-slate-800/70 text-xs text-slate-400 pl-2">
                          <div className="flex items-center gap-2 truncate">
                            <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="truncate">{req.hospital_location}</span>
                          </div>
                          <div className="flex items-center gap-2 truncate">
                            <User className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="truncate">{req.requester_name}</span>
                          </div>
                          <div className="flex items-center gap-2 truncate">
                            <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                            <a
                              href={`tel:${req.contact_info}`}
                              className="hover:text-red-400 text-slate-300 font-medium underline decoration-slate-700"
                            >
                              {req.contact_info}
                            </a>
                          </div>
                        </div>

                        {/* Action Footer */}
                        <div className="flex items-center justify-between gap-3 pt-3.5 border-t border-slate-800/70 pl-2">
                          <div className="text-xs text-slate-400 font-medium">
                            {pendingIncomingPledges.length > 0 && (
                              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                <span>{pendingIncomingPledges.length} pending donor response(s)</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5">
                            {/* DONOR PLEDGE BUTTON (Strict role rule: donors only, non-owned requests only) */}
                            {isDonor && !isOwner && (
                              <div>
                                {hasUserPendingPledge ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="px-4 py-2 bg-slate-800/80 border border-amber-600/40 text-amber-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-not-allowed opacity-90 shadow-inner"
                                    title="You have already submitted a pending pledge for this request"
                                  >
                                    <Clock className="w-4 h-4 text-amber-400" />
                                    <span>Pledged (Pending Verification)</span>
                                  </button>
                                ) : inRecoveryPeriod ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="px-4 py-2 bg-slate-800/60 border border-slate-700/60 text-slate-400 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 cursor-not-allowed opacity-80"
                                    title={`Ineligible: ${donorEligibility.daysRemaining} days remaining in 90-day cool-off period`}
                                  >
                                    <Clock className="w-4 h-4 text-amber-500/70" />
                                    <span>Recovery Active ({donorEligibility.daysRemaining}d left)</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openPledgeModal(req)}
                                    className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-600/25 hover:shadow-red-600/40 hover:-translate-y-0.5"
                                  >
                                    <HeartHandshake className="w-4 h-4" />
                                    <span>Pledge 1 Unit</span>
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Requester-only moderation action */}
                            {isOwner && (
                              <button
                                type="button"
                                disabled={isActionBusy}
                                onClick={() => handleArchive(req.id)}
                                className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700/80 cursor-pointer disabled:opacity-50"
                              >
                                {isActionBusy ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                ) : (
                                  <Archive className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <span>Archive</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Incoming Pledges Panel (Only for Request Owners; displays status === 'Pending') */}
                        {isOwner && pendingIncomingPledges.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
                            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-400" />
                                <span>Incoming Donor Pledges ({pendingIncomingPledges.length})</span>
                              </span>
                              <span className="text-[10px] text-amber-400 font-semibold px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/50">
                                Verification Required
                              </span>
                            </div>

                            <div className="space-y-2.5">
                              {pendingIncomingPledges.map((pledge) => {
                                const isVerifyingThis = verifyingPledgeId === pledge.id;
                                return (
                                  <div
                                    key={pledge.id}
                                    className="bg-[#060b13] border border-slate-800/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm"
                                  >
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-white text-sm">
                                          {pledge.units_pledged} Unit(s) Pledged
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-800/60">
                                          Pending
                                        </span>
                                        {pledge.profiles?.full_name && (
                                          <span className="text-slate-400">
                                            by <span className="text-slate-200 font-medium">{pledge.profiles.full_name}</span>
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <span className="flex items-center gap-1.5">
                                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                                          <span>ETA: ~{pledge.eta_minutes} mins</span>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                                          <a
                                            href={`tel:${pledge.donor_phone}`}
                                            className="text-red-400 hover:text-red-300 font-medium underline"
                                          >
                                            {pledge.donor_phone}
                                          </a>
                                        </span>
                                        <span className="text-slate-500">{formatTime(pledge.created_at)}</span>
                                      </div>
                                    </div>

                                    <div>
                                      <button
                                        type="button"
                                        disabled={isVerifyingThis}
                                        onClick={() => handleVerifyPledge(pledge.id)}
                                        className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-950 hover:shadow-emerald-900/40"
                                      >
                                        {isVerifyingThis ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Verifying Delivery...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Check className="w-4 h-4" />
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
      </div>

      {/* ========================================================================= */}
      {/* 7. PLEDGE MODAL */}
      {/* ========================================================================= */}
      {selectedRequestForPledge && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#09101d] border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setSelectedRequestForPledge(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/50 text-red-400 text-[10px] font-bold uppercase tracking-wider mb-2.5">
                <HeartHandshake className="w-3.5 h-3.5" />
                Emergency Commitment
              </div>
              <h3 className="text-xl font-black text-white tracking-tight">
                Pledge for {selectedRequestForPledge.item_name}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Facility: {selectedRequestForPledge.hospital_location} • Remaining Needed:{' '}
                <span className="font-bold text-red-400">{selectedRequestForPledge.units_needed} Units</span>
              </p>
            </div>

            {pledgeError && (
              <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-800/80 text-red-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{pledgeError}</span>
              </div>
            )}

            <form onSubmit={handlePledgeSubmit} className="space-y-4">
              {/* Units to Pledge */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Units to Pledge
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedRequestForPledge.units_needed}
                  required
                  value={pledgeUnits}
                  onChange={(e) => setPledgeUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500/80"
                />
              </div>

              {/* Estimated Arrival Time */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Estimated Arrival Time (Minutes)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pledgeEta}
                  onChange={(e) => setPledgeEta(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500/80"
                  placeholder="30"
                />
              </div>

              {/* Last Donation Date (for 90-day check on blood) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Date of Last Whole-Blood Donation</span>
                </label>
                <input
                  type="date"
                  value={pledgeLastDate}
                  onChange={(e) => setPledgeLastDate(e.target.value)}
                  className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500/80"
                />
                {selectedRequestForPledge.item_type === 'blood' && pledgeLastDate && (
                  <div className="mt-2">
                    {(() => {
                      const elig = getDonationEligibility(pledgeLastDate);
                      if (!elig.isEligible) {
                        return (
                          <div className="text-[11px] text-amber-400 flex items-center gap-1.5 font-semibold bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/40">
                            <Clock className="w-4 h-4 shrink-0 text-amber-500" />
                            <span>
                              Ineligible: {elig.daysRemaining} days remaining in 90-day clinical cool-off period.
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-semibold bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/40">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>Eligible for blood donation (&gt;90 days elapsed).</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Donor Contact Phone */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>Your Contact Phone Number</span>
                </label>
                <input
                  type="tel"
                  required
                  value={pledgePhone}
                  onChange={(e) => setPledgePhone(e.target.value)}
                  placeholder="+1 (555) 019-2834"
                  className="w-full bg-[#060b13] border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500/80"
                />
              </div>

              <div className="pt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRequestForPledge(null)}
                  className="w-1/2 py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pledgeSubmitting}
                  className="w-1/2 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:from-red-950 disabled:to-rose-950 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-900/40"
                >
                  {pledgeSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm Pledge</span>
                    </>
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
