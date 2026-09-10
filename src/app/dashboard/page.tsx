'use client';

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  DonationHistory,
  MedicalRequest,
  Pledge,
  Profile,
} from '@/types/database.types';
import {
  AlertCircle,
  Archive,
  Calendar,
  CheckCircle2,
  Droplets,
  HeartHandshake,
  History,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Pill,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';

type Urgency = MedicalRequest['urgency'];

interface ApiResponseError {
  error?: string;
}

const URGENCY_ORDER: Record<Urgency, number> = {
  Critical: 0,
  Urgent: 1,
  Standard: 2,
};

function getTodayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCalendarDayDifference(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return -1;
  }

  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Not available';
  return dateString.slice(0, 10);
}

function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const match = dateString.match(/T(\d{2}):(\d{2})/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function getUrgencyClasses(urgency: Urgency): string {
  if (urgency === 'Critical') {
    return 'bg-red-100 text-red-700 border-red-200';
  }
  if (urgency === 'Urgent') {
    return 'bg-orange-100 text-orange-700 border-orange-200';
  }
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<MedicalRequest[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [donationHistory, setDonationHistory] = useState<DonationHistory[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Request form state
  const [showRequestForm, setShowRequestForm] = useState<boolean>(false);
  const [requestLoading, setRequestLoading] = useState<boolean>(false);
  const [itemType, setItemType] = useState<MedicalRequest['item_type']>('blood');
  const [itemName, setItemName] = useState<string>('');
  const [unitsNeeded, setUnitsNeeded] = useState<string>('1');
  const [urgency, setUrgency] = useState<Urgency>('Standard');
  const [hospitalLocation, setHospitalLocation] = useState<string>('');
  const [contactInfo, setContactInfo] = useState<string>('');

  // Pledge modal state
  const [pledgeTarget, setPledgeTarget] = useState<MedicalRequest | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<string>('30');
  const [donorPhone, setDonorPhone] = useState<string>('');
  const [lastDonationDate, setLastDonationDate] = useState<string>('');
  const [pledgeLoading, setPledgeLoading] = useState<boolean>(false);
  const [pledgeError, setPledgeError] = useState<string>('');

  // Action guards
  const [verifyingPledgeId, setVerifyingPledgeId] = useState<string | null>(null);
  const [archivingRequestId, setArchivingRequestId] = useState<string | null>(null);

  const isDonor = user?.role === 'donor';

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !authUser) {
        router.push('/auth');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(profileError.message);
      }

      const profile = profileData as Profile | null;
      setUser(profile);

      if (profile?.role === 'donor') {
        setDonorPhone(profile.phone_number ?? '');
        setLastDonationDate(profile.last_donation_date ?? '');

        const { data: hist, error: historyError } = await supabase
          .from('donation_history')
          .select('*')
          .eq('donor_id', authUser.id)
          .order('verified_at', { ascending: false });

        if (historyError) {
          throw new Error(historyError.message);
        }

        setDonationHistory((hist as DonationHistory[]) ?? []);
      } else {
        setDonorPhone('');
        setLastDonationDate('');
        setDonationHistory([]);
      }

      const requestsResponse = await fetch('/api/requests', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!requestsResponse.ok) {
        const errJson: ApiResponseError = await requestsResponse.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Failed to load emergency requests.');
      }

      const requestsData: MedicalRequest[] = await requestsResponse.json();
      const sortedRequests = [...requestsData].sort((a, b) => {
        const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setRequests(sortedRequests);

      const pledgesResponse = await fetch('/api/pledges', {
        method: 'GET',
        cache: 'no-store',
      });

      if (pledgesResponse.ok) {
        const pledgesData: Pledge[] = await pledgesResponse.json();
        setPledges(pledgesData);
      } else if (pledgesResponse.status === 401) {
        router.push('/auth');
        return;
      } else {
        setPledges([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while loading the dashboard.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests' },
        () => { void loadData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pledges' },
        () => { void loadData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'donation_history' },
        () => { void loadData(); }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const eligibility = useMemo(() => {
    if (!isDonor) {
      return { eligible: false, message: '', remainingDays: 0 };
    }

    if (!user?.last_donation_date) {
      return {
        eligible: true,
        message: 'No previous donation date recorded. You are eligible to donate whole blood.',
        remainingDays: 0,
      };
    }

    const today = getTodayISODate();
    const daysSinceDonation = getCalendarDayDifference(
      user.last_donation_date,
      today
    );

    if (daysSinceDonation < 0) {
      return {
        eligible: false,
        message: 'Recorded last donation date cannot be in the future.',
        remainingDays: 0,
      };
    }

    if (daysSinceDonation < 90) {
      return {
        eligible: false,
        message: `You have ${90 - daysSinceDonation} day(s) remaining in your 90-day recovery interval.`,
        remainingDays: 90 - daysSinceDonation,
      };
    }

    return {
      eligible: true,
      message: 'You have completed the 90-day recovery period and can donate.',
      remainingDays: 0,
    };
  }, [isDonor, user?.last_donation_date]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    clearMessages();

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw new Error(signOutError.message);
      }
      router.push('/auth');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setSigningOut(false);
    }
  };

  const handleCreateRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    const trimmedItemName = itemName.trim();
    const trimmedLocation = hospitalLocation.trim();
    const trimmedContact = contactInfo.trim();
    const units = Number(unitsNeeded);

    if (!trimmedItemName) {
      setError('Please enter the required item name.');
      return;
    }

    if (!Number.isInteger(units) || units < 1) {
      setError('Units needed must be a whole number greater than 0.');
      return;
    }

    if (!trimmedLocation) {
      setError('Please enter the hospital location.');
      return;
    }

    if (!trimmedContact) {
      setError('Please enter contact information.');
      return;
    }

    try {
      setRequestLoading(true);

      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: itemType,
          item_name: trimmedItemName,
          units_needed: units,
          urgency,
          hospital_location: trimmedLocation,
          contact_info: trimmedContact,
        }),
      });

      const data: ApiResponseError = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to create request.');
      }

      setSuccess('Emergency request posted successfully.');
      setItemName('');
      setUnitsNeeded('1');
      setUrgency('Standard');
      setHospitalLocation('');
      setContactInfo('');
      setShowRequestForm(false);

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request.');
    } finally {
      setRequestLoading(false);
    }
  };

  const openPledgeModal = (request: MedicalRequest) => {
    clearMessages();

    if (!isDonor) {
      setError('Only registered donors can pledge donations.');
      return;
    }

    setPledgeTarget(request);
    setEtaMinutes('30');
    setPledgeError('');
    setDonorPhone(user?.phone_number ?? '');
    setLastDonationDate(user?.last_donation_date ?? '');
  };

  const closePledgeModal = () => {
    if (pledgeLoading) return;
    setPledgeTarget(null);
    setEtaMinutes('30');
    setPledgeError('');
  };

  const handlePledge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pledgeTarget || !isDonor) return;

    const trimmedPhone = donorPhone.trim();
    const eta = Number(etaMinutes);

    if (!trimmedPhone) {
      setPledgeError('Please provide a contact phone number.');
      return;
    }

    if (!Number.isInteger(eta) || eta < 1) {
      setPledgeError('ETA must be a number of minutes greater than 0.');
      return;
    }

    if (pledgeTarget.item_type === 'blood' && lastDonationDate) {
      const today = getTodayISODate();
      const diff = getCalendarDayDifference(lastDonationDate, today);

      if (diff < 0) {
        setPledgeError('Last donation date cannot be in the future.');
        return;
      }

      if (diff < 90) {
        setPledgeError(
          `Clinical safety requires 90 days between blood donations. You have ${90 - diff} day(s) remaining.`
        );
        return;
      }
    }

    try {
      setPledgeLoading(true);
      setPledgeError('');

      const response = await fetch('/api/pledges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: pledgeTarget.id,
          units_pledged: 1,
          eta_minutes: eta,
          last_donation_date: lastDonationDate || null,
          donor_phone: trimmedPhone,
        }),
      });

      const data: ApiResponseError = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to submit pledge.');
      }

      setPledgeTarget(null);
      setSuccess('Donation pledge submitted successfully.');
      await loadData();
    } catch (err) {
      setPledgeError(err instanceof Error ? err.message : 'Failed to submit pledge.');
    } finally {
      setPledgeLoading(false);
    }
  };

  const handleArchiveRequest = async (requestId: string) => {
    if (archivingRequestId) return;
    clearMessages();
    setArchivingRequestId(requestId);

    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Archived' }),
      });

      const data: ApiResponseError = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to archive request.');
      }

      setSuccess('Request archived successfully.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive request.');
    } finally {
      setArchivingRequestId(null);
    }
  };

  const handleVerifyPledge = async (pledgeId: string) => {
    if (verifyingPledgeId) return;
    clearMessages();
    setVerifyingPledgeId(pledgeId);

    try {
      const response = await fetch('/api/pledges/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pledge_id: pledgeId }),
      });

      const data: ApiResponseError = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to verify pledge.');
      }

      setSuccess('Donation verified! Units updated and recorded in donor history.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify donation.');
    } finally {
      setVerifyingPledgeId(null);
    }
  };

  const incomingPledges = useMemo(() => {
    if (!user) return [];
    return pledges.filter((pledge) => {
      if (pledge.requests?.requester_id) {
        return pledge.requests.requester_id === user.id;
      }
      return requests.some((req) => req.id === pledge.request_id && req.requester_id === user.id);
    });
  }, [pledges, requests, user]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
          <p className="text-sm font-medium">Loading LifeFlow Exchange...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-100 p-2 text-red-600">
              <Droplets className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">LifeFlow</h1>
              <p className="text-xs text-slate-500">Community Blood & Medicine Exchange</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={refreshing}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="hidden items-center gap-2 sm:flex">
              <div className="rounded-full bg-slate-100 p-2">
                <User className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-none">
                  {user?.full_name || 'User'}
                </p>
                <p className="text-xs capitalize text-slate-500 mt-0.5">
                  {user?.role} {user?.hospital_name ? `• ${user.hospital_name}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1 font-medium">{error}</div>
            <button type="button" onClick={() => setError('')} className="rounded-md p-1 hover:bg-red-100 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1 font-medium">{success}</div>
            <button type="button" onClick={() => setSuccess('')} className="rounded-md p-1 hover:bg-green-100 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section className="mb-6 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 p-6 text-white shadow-sm">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-200">Live Exchange Portal</p>
              <h2 className="text-2xl font-bold mt-1">Hello, {user?.full_name || 'Member'}</h2>
              <p className="mt-1 text-sm text-red-50">
                Post shortage requests or pledge essential supplies to save lives in real time.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                clearMessages();
                setShowRequestForm((curr) => !curr);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-red-600 shadow-sm transition hover:bg-red-50 cursor-pointer"
            >
              <Plus className="h-5 w-5" />
              {showRequestForm ? 'Hide Form' : 'Post Shortage Request'}
            </button>
          </div>
        </section>

        {showRequestForm && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Post Emergency Request</h2>
                <p className="text-xs text-slate-500">Accessible across all roles to register emergency needs.</p>
              </div>
              <button type="button" onClick={() => setShowRequestForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setItemType('blood')}
                    className={`py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      itemType === 'blood'
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Droplets className="h-4 w-4" /> Blood
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemType('medicine')}
                    className={`py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      itemType === 'medicine'
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Pill className="h-4 w-4" /> Medicine
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Item / Blood Group</label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder={itemType === 'blood' ? 'e.g. O-Negative' : 'e.g. IVIG or Remdesivir'}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Units Needed</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={unitsNeeded}
                  onChange={(e) => setUnitsNeeded(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Urgency</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as Urgency)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  <option value="Critical">Critical</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Standard">Standard</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Hospital / Location</label>
                <input
                  type="text"
                  required
                  value={hospitalLocation}
                  onChange={(e) => setHospitalLocation(e.target.value)}
                  placeholder="e.g. City General ICU"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Emergency Phone</label>
                <input
                  type="tel"
                  required
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={requestLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {requestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {requestLoading ? 'Publishing...' : 'Publish Emergency Shortage'}
                </button>
              </div>
            </form>
          </section>
        )}

        {isDonor && (
          <section className="mb-6 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className={`rounded-xl p-3 ${eligibility.eligible ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                  {eligibility.eligible ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Blood Donation Eligibility</h3>
                  <p className={`mt-1 text-sm ${eligibility.eligible ? 'text-green-700 font-medium' : 'text-orange-700'}`}>
                    {eligibility.message}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    A clinical 90-day recovery interval applies exclusively to blood donations. Medicine donations are exempt.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-red-100 p-3 text-red-600">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Donor Profile Record</h3>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <p><span className="font-medium">Direct Phone:</span> {user?.phone_number || 'Not provided'}</p>
                    <p>
                      <span className="font-medium">Last Donation:</span>{' '}
                      {user?.last_donation_date ? formatDate(user.last_donation_date) : 'None recorded'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Live Shortage Feed</h2>
              <p className="text-xs text-slate-500">Sorted dynamically by urgency priority</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {requests.length} active
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <Droplets className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 text-sm font-semibold text-slate-800">No active shortages listed</h3>
              <p className="mt-1 text-xs text-slate-500">Check back shortly or post a new emergency request above.</p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {requests.map((request) => {
                const isOwner = request.requester_id === user?.id;
                const canPledgeBlood = request.item_type !== 'blood' || eligibility.eligible;

                return (
                  <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getUrgencyClasses(request.urgency)}`}>
                            {request.urgency}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {request.item_type}
                          </span>
                        </div>

                        <h3 className="text-lg font-bold text-slate-900">{request.item_name}</h3>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-black text-red-600">{request.units_needed}</p>
                        <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">units needed</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{request.hospital_location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{request.contact_info}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Requested by {request.requester_name}</span>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                      {isDonor && !isOwner && (
                        <button
                          type="button"
                          onClick={() => openPledgeModal(request)}
                          disabled={request.units_needed <= 0 || !canPledgeBlood}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <HeartHandshake className="h-3.5 w-3.5" />
                          {!canPledgeBlood ? 'Recovery Interval Active' : 'Pledge 1 Unit'}
                        </button>
                      )}

                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => void handleArchiveRequest(request.id)}
                          disabled={archivingRequestId === request.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                        >
                          {archivingRequestId === request.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                          Archive
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {incomingPledges.length > 0 && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Incoming Donor Pledges</h2>
              <p className="text-xs text-slate-500">Verify supplies upon delivery to credit donor records and decrement shortages.</p>
            </div>

            <div className="space-y-3">
              {incomingPledges.map((pledge) => {
                const isVerified = pledge.status === 'Verified';
                const relatedRequestName =
                  pledge.requests?.item_name ??
                  requests.find((r) => r.id === pledge.request_id)?.item_name ??
                  'Medical Supply';

                return (
                  <div key={pledge.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{relatedRequestName}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{pledge.units_pledged} unit pledged</span>
                        <span>• ETA: ~{pledge.eta_minutes} mins</span>
                        <span>• Contact: <strong className="text-slate-700">{pledge.donor_phone}</strong></span>
                      </div>
                    </div>

                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleVerifyPledge(pledge.id)}
                        disabled={verifyingPledgeId === pledge.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        {verifyingPledgeId === pledge.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Mark Received & Verified
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {isDonor && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-red-600" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">My Verified Donation History</h2>
                <p className="text-xs text-slate-500">Verified donations linked to your donor profile.</p>
              </div>
            </div>

            {donationHistory.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">
                No verified donation records yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 uppercase tracking-wider text-slate-500 font-semibold">
                      <th className="py-2.5">Item</th>
                      <th className="py-2.5">Units</th>
                      <th className="py-2.5">Hospital Location</th>
                      <th className="py-2.5">Verified Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donationHistory.map((history) => (
                      <tr key={history.id} className="border-b border-slate-100 last:border-0 text-slate-700">
                        <td className="py-3 font-semibold text-slate-900">{history.item_name}</td>
                        <td className="py-3">{history.units_donated}</td>
                        <td className="py-3">{history.hospital_location}</td>
                        <td className="py-3 text-emerald-600 font-medium">
                          {formatDate(history.verified_at)} {formatTime(history.verified_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {pledgeTarget && isDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <HeartHandshake className="h-4 w-4 text-red-600" />
                  Pledge for {pledgeTarget.item_name}
                </h3>
                <p className="text-xs text-slate-500">{pledgeTarget.hospital_location}</p>
              </div>
              <button type="button" onClick={closePledgeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {pledgeError && (
              <div className="my-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-1.5 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{pledgeError}</span>
              </div>
            )}

            <form onSubmit={handlePledge} className="space-y-4 mt-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">ETA in Minutes</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={etaMinutes}
                  onChange={(e) => setEtaMinutes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Donor Phone (Shared with Requester)</label>
                <input
                  type="tel"
                  required
                  value={donorPhone}
                  onChange={(e) => setDonorPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-red-500"
                />
              </div>

              {pledgeTarget.item_type === 'blood' && (
                <div>
                  <label className="block text-slate-700 mb-1">Last Whole-Blood Donation Date</label>
                  <input
                    type="date"
                    max={getTodayISODate()}
                    value={lastDonationDate}
                    onChange={(e) => setLastDonationDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-red-500"
                  />
                  <p className="text-[10px] text-slate-400 font-normal mt-1">Leave blank if this is your first donation.</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closePledgeModal}
                  disabled={pledgeLoading}
                  className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pledgeLoading}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                >
                  {pledgeLoading ? 'Submitting...' : 'Confirm Pledge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}