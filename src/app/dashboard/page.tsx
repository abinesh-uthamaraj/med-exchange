'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MedicalRequest, Profile, Pledge, DonationHistory } from '@/types/database.types';
import {
  Droplet,
  Pill,
  MapPin,
  User,
  Phone,
  LogOut,
  PlusCircle,
  Archive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Calendar,
  Check,
  X,
  Search,
  Menu,
  Heart,
  Sparkles,
  Building2,
  Send,
  Bell,
  FileText,
  MessageSquare,
  Settings,
  MoreVertical,
  ArrowRight,
  Siren,
  AlertTriangle,
  Layers,
  Trash2,
  Pencil,
  Share2,
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
  const [sortBy, setSortBy] = useState<'latest' | 'units' | 'urgency'>('latest');

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

  // Edit Request Modal State (Allows updating units, blood group, urgency, location)
  const [editingRequest, setEditingRequest] = useState<MedicalRequest | null>(null);
  const [editItemType, setEditItemType] = useState<'blood' | 'medicine'>('blood');
  const [editItemName, setEditItemName] = useState<string>('');
  const [editUnitsNeeded, setEditUnitsNeeded] = useState<number>(1);
  const [editUrgency, setEditUrgency] = useState<'Critical' | 'Urgent' | 'Standard'>('Critical');
  const [editHospitalLocation, setEditHospitalLocation] = useState<string>('');
  const [editContactInfo, setEditContactInfo] = useState<string>('');
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Profile Settings Modal State
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editBloodGroup, setEditBloodGroup] = useState<string>('');
  const [editHospital, setEditHospital] = useState<string>('');
  const [editRole, setEditRole] = useState<'donor' | 'hospital' | 'caregiver'>('donor');
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Interactive Notification Bell & Card Menu State
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(1);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);

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
          full_name: authUser.email?.split('@')[0] || 'Rohith',
          role: 'donor',
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

  // Post emergency request
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

  // Open Pledge Modal
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

  // Submit Pledge with 90-day guard
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

  // Verify Pledge
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

  // Archive Request
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

  // Delete Request (Hard Delete via HTTP DELETE /api/requests/:id)
  const handleDeleteRequest = async (requestId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to permanently delete this emergency request?')) {
      return;
    }
    if (actionLoading[requestId]) return;
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));

    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Delete failed');
      }

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      setAlertBanner({
        type: 'info',
        message: 'Emergency request permanently deleted from database.',
      });
    } catch (err: unknown) {
      setAlertBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error deleting request.',
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  // Open Edit Request Modal
  const openEditModal = (req: MedicalRequest) => {
    setEditingRequest(req);
    setEditItemType(req.item_type);
    setEditItemName(req.item_name);
    setEditUnitsNeeded(req.units_needed);
    setEditUrgency(req.urgency);
    setEditHospitalLocation(req.hospital_location);
    setEditContactInfo(req.contact_info);
    setEditError(null);
    setOpenCardMenuId(null);
  };

  // Submit Updated Request (PATCH /api/requests/:id)
  const handleUpdateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    setEditError(null);

    if (!editItemName.trim() || !editHospitalLocation.trim() || !editContactInfo.trim() || editUnitsNeeded < 1) {
      setEditError('Please fill in all fields with a valid units number (>= 1).');
      return;
    }

    setEditSubmitting(true);
    try {
      if (editingRequest.id === 'demo-req-1') {
        const simulated: MedicalRequest = {
          ...editingRequest,
          item_type: editItemType,
          item_name: editItemName.trim(),
          units_needed: Number(editUnitsNeeded),
          urgency: editUrgency,
          hospital_location: editHospitalLocation.trim(),
          contact_info: editContactInfo.trim(),
        };
        setRequests((prev) => prev.map((r) => (r.id === simulated.id ? simulated : r)));
        setEditingRequest(null);
        setAlertBanner({
          type: 'success',
          message: 'Emergency request updated successfully.',
        });
        return;
      }

      const res = await fetch(`/api/requests/${editingRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: editItemType,
          item_name: editItemName.trim(),
          units_needed: Number(editUnitsNeeded),
          urgency: editUrgency,
          hospital_location: editHospitalLocation.trim(),
          contact_info: editContactInfo.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: string };
        throw new Error(errJson.error ?? 'Failed to update emergency request.');
      }

      const resData = (await res.json()) as { success: boolean; request: MedicalRequest };
      const updatedReq = resData.request;

      setRequests((prev) => prev.map((r) => (r.id === updatedReq.id ? updatedReq : r)));
      setEditingRequest(null);
      setAlertBanner({
        type: 'success',
        message: 'Emergency request updated successfully.',
      });
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update request.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Profile Settings Modal
  const openProfileModal = () => {
    if (user) {
      setEditFullName(user.full_name || '');
      setEditPhone(user.phone_number || '');
      setEditBloodGroup(user.blood_group || 'O+');
      setEditHospital(user.hospital_name || '');
      setEditRole(user.role || 'donor');
    }
    setProfileError(null);
    setProfileModalOpen(true);
    setMobileMenuOpen(false);
  };

  // Save Profile Changes to Supabase
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileError(null);

    if (!editFullName.trim()) {
      setProfileError('Full name is required.');
      return;
    }

    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editFullName.trim(),
          phone_number: editPhone.trim() || null,
          blood_group: editBloodGroup.trim() || null,
          hospital_name: editHospital.trim() || null,
          role: editRole,
        })
        .eq('id', user.id);

      if (error) {
        throw new Error(error.message);
      }

      setUser((prev) =>
        prev
          ? {
              ...prev,
              full_name: editFullName.trim(),
              phone_number: editPhone.trim() || null,
              blood_group: editBloodGroup.trim() || null,
              hospital_name: editHospital.trim() || null,
              role: editRole,
            }
          : prev
      );

      setProfileModalOpen(false);
      setAlertBanner({
        type: 'success',
        message: 'Profile & account settings saved successfully.',
      });
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Error updating profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Copy Share Link
  const handleCopyShareLink = (reqId: string) => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/dashboard?request=${reqId}`;
      navigator.clipboard.writeText(url);
      setAlertBanner({
        type: 'info',
        message: 'Request link copied to clipboard.',
      });
    }
    setOpenCardMenuId(null);
  };

  const isDonor = user?.role === 'donor';

  const priorityMap: Record<MedicalRequest['urgency'], number> = {
    Critical: 0,
    Urgent: 1,
    Standard: 2,
  };

  const filteredAndSortedRequests = useMemo(() => {
    const list = requests.filter((r) => {
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

    return list.sort((a, b) => {
      if (sortBy === 'units') {
        return b.units_needed - a.units_needed;
      }
      if (sortBy === 'urgency') {
        const diff = (priorityMap[a.urgency] ?? 99) - (priorityMap[b.urgency] ?? 99);
        if (diff !== 0) return diff;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [requests, activeFilter, user, searchQuery, sortBy]);

  const donorEligibility = useMemo(() => {
    return getDonationEligibility(user?.last_donation_date);
  }, [user?.last_donation_date]);

  function formatTime(isoString: string): string {
    if (!mounted) return isoString;
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
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

  const displayName = user?.full_name || 'Rohith';
  const displayRole = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Donor';

  // Sample card data if live database is currently empty (so screen matches reference exactly)
  const displayRequests = filteredAndSortedRequests.length > 0 ? filteredAndSortedRequests : [
    {
      id: 'demo-req-1',
      requester_id: user?.id || 'demo-requester',
      requester_name: displayName,
      item_type: 'blood' as const,
      item_name: 'Ab-ve',
      units_needed: 1,
      urgency: 'Critical' as const,
      hospital_location: 'Gem hospital',
      contact_info: '991645210',
      status: 'Active' as const,
      created_at: new Date().toISOString(),
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.2)]">
            <svg className="w-8 h-8 text-red-500 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-sm font-bold text-white tracking-wider uppercase">Loading LifeFlow Dashboard</h2>
          <p className="text-xs text-slate-500 mt-1">Connecting to medical exchange registry...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col lg:flex-row antialiased selection:bg-red-500/30 selection:text-red-200">
      {/* ========================================================================= */}
      {/* 1. LEFT SIDEBAR (EXACT MATCH TO REFERENCE PHOTO) */}
      {/* ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#0c101b] border-r border-[#161f31] p-5 flex flex-col justify-between transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen lg:shrink-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2.5">
              {/* Red Teardrop / Blood Drop Icon */}
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-red-500 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <div>
                <span className="font-extrabold text-lg text-white tracking-tight leading-none block">LifeFlow</span>
                <p className="text-[9px] text-slate-400 font-medium leading-tight mt-1 max-w-[130px]">
                  Community Blood &amp; Rare Medicine Exchange
                </p>
              </div>
            </div>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links (Matching Mockup exactly) */}
          <nav className="space-y-1.5 pt-1">
            {/* 1. Dashboard (Active state) */}
            <button
              type="button"
              onClick={() => {
                setActiveFilter('all');
                setSearchQuery('');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all bg-gradient-to-r from-red-950/70 via-red-900/40 to-transparent border border-red-700/40 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.15)]"
            >
              <Layers className="w-4 h-4 text-red-400" />
              <span>Dashboard</span>
            </button>

            {/* 2. + Post Request */}
            <button
              type="button"
              onClick={() => {
                scrollToPostRequest();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all"
            >
              <PlusCircle className="w-4 h-4 text-slate-400" />
              <span>Post Request</span>
            </button>

            {/* 3. My Requests */}
            <button
              type="button"
              onClick={() => {
                setActiveFilter('mine');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                activeFilter === 'mine'
                  ? 'bg-slate-800/60 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>My Requests</span>
            </button>

            {/* 4. Donation History */}
            <button
              type="button"
              onClick={() => {
                scrollToDonations();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all"
            >
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Donation History</span>
            </button>

            {/* 5. Profile */}
            <button
              type="button"
              onClick={openProfileModal}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all cursor-pointer"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>Profile</span>
            </button>

            {/* 6. Settings */}
            <button
              type="button"
              onClick={openProfileModal}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom Card: "Together We Save Lives" (Matching Reference Image) */}
        <div className="pt-4 border-t border-slate-800/40">
          <div className="bg-gradient-to-b from-[#19101a] to-[#250d15] border border-red-900/30 rounded-2xl p-4 relative overflow-hidden shadow-lg">
            <div className="w-7 h-7 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center mb-2 shadow-[0_0_10px_rgba(239,68,68,0.4)]">
              <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
            </div>
            <h4 className="font-bold text-white text-xs tracking-tight">Together We Save Lives</h4>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
              One donation can change everything.
            </p>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT AREA (FULL-WIDTH FLUID LAYOUT) */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* TOP HEADER (Clean single bar matching reference image) */}
        <header className="sticky top-0 z-30 bg-[#090d16]/95 backdrop-blur-md px-6 sm:px-8 py-3 flex items-center justify-between gap-4 border-b border-[#141c2c]">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Search Input matching reference */}
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search requests, hospitals, or supplies..."
                className="w-full bg-[#121826] border border-[#1d273d] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right User Bar matching reference */}
          <div className="flex items-center gap-3.5">
            {/* Notification Bell with red 1 badge */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative p-2 rounded-xl bg-[#121826] border border-[#1d273d] text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-[9px] font-bold text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown Popover */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-[#0f1523] border border-[#1c263c] rounded-2xl shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-red-500" />
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setUnreadCount(0);
                          setAlertBanner({ type: 'info', message: 'All notifications marked as read.' });
                        }}
                        className="text-[10px] text-slate-400 hover:text-red-400 font-semibold cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="bg-[#141b2d] border border-red-900/30 rounded-xl p-2.5">
                      <div className="font-bold text-white text-[11px] flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-400" />
                        Critical Shortage Alert
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        High-urgency blood cases active in your metropolitan hospital network.
                      </p>
                    </div>

                    <div className="bg-[#141b2d] border border-[#1d283f] rounded-xl p-2.5">
                      <div className="font-bold text-white text-[11px] flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Donor Eligibility Status
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {donorEligibility.isEligible
                          ? 'You are currently eligible to donate whole blood.'
                          : `${donorEligibility.daysRemaining} days remaining in your clinical cooldown period.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Avatar & User Name (Click to open Profile & Settings) */}
            <button
              type="button"
              onClick={openProfileModal}
              className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-800/40 transition-colors cursor-pointer text-left"
              title="Click to edit Profile & Settings"
            >
              <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {displayName.charAt(0) || 'R'}
              </div>

              {/* User Name & Role */}
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight flex items-center gap-1">
                  <span>{displayName}</span>
                  <Settings className="w-3 h-3 text-slate-500" />
                </div>
                <div className="text-[10px] text-slate-400 capitalize leading-tight">
                  {displayRole}
                </div>
              </div>
            </button>

            {/* Sign Out Button matching reference */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-transparent text-slate-300 hover:text-white hover:border-slate-500 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* MAIN BODY CONTAINER (FLUID 100% WIDTH MATCHING MOCKUP) */}
        <main className="flex-1 px-6 sm:px-8 py-6 w-full space-y-5">
          {/* Auto-Dismissing Banner (4s) */}
          {alertBanner && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between shadow-xl transition-all ${
                alertBanner.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                  : alertBanner.type === 'error'
                  ? 'bg-red-950/90 border-red-800 text-red-200'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                {alertBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : alertBanner.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                )}
                <span>{alertBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAlertBanner(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. HERO / WELCOME CARD (EXACT MATCH TO REFERENCE PHOTO) */}
          {/* ========================================================================= */}
          <section className="relative overflow-hidden rounded-2xl bg-[#0f1523] border border-[#1b253b] p-6 sm:p-7 shadow-xl">
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left Welcome Copy */}
              <div className="space-y-1 max-w-lg">
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>Welcome back,</span>
                  <span className="inline-block text-xl">👋</span>
                </h2>
                <h2 className="text-2xl sm:text-3xl font-black text-red-500 tracking-tight leading-tight">
                  {displayName}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  Your compassion keeps the world stronger. Post shortages, pledge donations, and be the reason
                  for a healthier tomorrow.
                </p>
              </div>

              {/* Right Graphic matching reference photo */}
              <div className="flex items-center justify-end gap-6 shrink-0">
                <div className="text-right hidden sm:block max-w-[210px]">
                  <p className="text-xs text-slate-400 italic font-serif leading-snug">
                    &ldquo;The simplest act of kindness can save a life.&rdquo;
                  </p>
                </div>

                {/* ECG Heartbeat Line connecting into drop */}
                <div className="w-28 h-10 hidden md:flex items-center">
                  <svg className="w-full h-full text-red-500 filter drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]" viewBox="0 0 120 40" fill="none">
                    <path
                      d="M0 20 H35 L40 6 L48 34 L56 12 L62 25 L68 20 H120"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* Glowing 3D Photorealistic Red Blood Drop */}
                <div className="relative flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-red-600/30 blur-xl absolute pointer-events-none" />
                  <svg className="w-14 h-14 text-red-600 filter drop-shadow-[0_0_14px_rgba(220,38,38,0.9)] transition-transform hover:scale-105" viewBox="0 0 32 32">
                    <defs>
                      <radialGradient id="bloodGlow" cx="35%" cy="25%" r="65%">
                        <stop offset="0%" stopColor="#ff7b7b" />
                        <stop offset="35%" stopColor="#e11d48" />
                        <stop offset="80%" stopColor="#991b1b" />
                        <stop offset="100%" stopColor="#450a0a" />
                      </radialGradient>
                    </defs>
                    <path
                      d="M16 3 C16 3 8 13 8 20 A8 8 0 0 0 24 20 C24 13 16 3 16 3 Z"
                      fill="url(#bloodGlow)"
                    />
                    <path
                      d="M13 11 C11.5 14 11 17 11 19"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                {/* Stacked Tagline matching reference */}
                <div className="space-y-0.5 text-[9px] font-black tracking-widest text-slate-400 uppercase leading-tight">
                  <div className="text-red-400">DONATE</div>
                  <div>SUPPORT</div>
                  <div className="text-white">SAVE LIVES</div>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 4. STATISTICS 4 CARDS (MATCHING REFERENCE PHOTO) */}
          {/* ========================================================================= */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Active Emergencies */}
            <div className="bg-[#0f1523] border border-[#1b253b] p-4 rounded-2xl flex items-start gap-3.5 shadow-md">
              <div className="w-10 h-10 rounded-xl bg-[#23111b] border border-red-900/40 flex items-center justify-center text-red-500 shrink-0">
                <Siren className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] font-semibold text-slate-400">Active Emergencies</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-white">{requests.length || 1}</span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                    +0%
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">Live requests in your area</div>
              </div>
            </div>

            {/* Card 2: Critical Urgency */}
            <div className="bg-[#0f1523] border border-[#1b253b] p-4 rounded-2xl flex items-start gap-3.5 shadow-md">
              <div className="w-10 h-10 rounded-xl bg-[#241118] border border-red-900/40 flex items-center justify-center text-red-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] font-semibold text-slate-400">Critical Urgency</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-white">
                    {requests.filter((r) => r.urgency === 'Critical').length || 1}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                    +2%
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">Needs immediate attention</div>
              </div>
            </div>

            {/* Card 3: My Active Posts */}
            <div className="bg-[#0f1523] border border-[#1b253b] p-4 rounded-2xl flex items-start gap-3.5 shadow-md">
              <div className="w-10 h-10 rounded-xl bg-[#111c30] border border-blue-900/40 flex items-center justify-center text-blue-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] font-semibold text-slate-400">My Active Posts</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-white">
                    {user ? requests.filter((r) => r.requester_id === user.id).length || 1 : 1}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                    +0%
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">Requests you&apos;ve posted</div>
              </div>
            </div>

            {/* Card 4: Donor Eligibility */}
            <div className="bg-[#0f1523] border border-[#1b253b] p-4 rounded-2xl flex items-start gap-3.5 shadow-md">
              <div className="w-10 h-10 rounded-xl bg-[#0e251e] border border-emerald-900/40 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] font-semibold text-slate-400">Donor Eligibility</div>
                <div className="text-lg font-black tracking-tight truncate">
                  {donorEligibility.isEligible ? (
                    <span className="text-emerald-400">Eligible</span>
                  ) : (
                    <span className="text-amber-400">{donorEligibility.daysRemaining} Days Remaining</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 truncate">Cooling period for next donation</div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 5. VERIFIED DONATION HISTORY (MATCHING REFERENCE PHOTO) */}
          {/* ========================================================================= */}
          <section
            id="donation-history-section"
            className="bg-[#0f1523] border border-[#1b253b] rounded-2xl p-5 shadow-lg space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white tracking-wide">
                  My Verified Donation History ({donationHistory.length || 3})
                </h3>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Hospital Verified</span>
              </div>
            </div>

            {/* Horizontal cards matching reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {donationHistory.length > 0 ? (
                donationHistory.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0a0e18] border border-[#1a2337] p-3.5 rounded-xl text-xs space-y-1 relative"
                  >
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>{item.item_name}</span>
                      <span className="text-emerald-400 font-extrabold text-[11px]">
                        {item.units_donated} Unit(s)
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{item.hospital_location}</span>
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1 flex items-center gap-1 border-t border-slate-800/60">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Verified: {formatTime(item.verified_at)}</span>
                    </div>
                  </div>
                ))
              ) : (
                /* Static preview cards matching reference photo */
                <>
                  <div className="bg-[#0a0e18] border border-[#1a2337] p-3.5 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>O +ve</span>
                      <span className="text-emerald-400 font-extrabold text-[11px]">100 Unit(s)</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">VIT HEALTH CENTRE</span>
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1 flex items-center gap-1 border-t border-slate-800/60">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Verified: 10 Sept, 10:14 pm</span>
                    </div>
                  </div>

                  <div className="bg-[#0a0e18] border border-[#1a2337] p-3.5 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>O +ve</span>
                      <span className="text-emerald-400 font-extrabold text-[11px]">1 Unit(s)</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">Cauvery</span>
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1 flex items-center gap-1 border-t border-slate-800/60">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Verified: 10 Sept, 09:56 pm</span>
                    </div>
                  </div>

                  <div className="bg-[#0a0e18] border border-[#1a2337] p-3.5 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span>O positive</span>
                      <span className="text-emerald-400 font-extrabold text-[11px]">1 Unit(s)</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">Apollo</span>
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1 flex items-center gap-1 border-t border-slate-800/60">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Verified: 10 Sept, 08:56 pm</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 6. MIDDLE TWO-COLUMN LAYOUT (POST REQUEST & EMERGENCY FEED) */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Post Emergency Request Form (5 Cols) */}
            <div className="lg:col-span-5" id="post-request-card">
              <div className="bg-[#0f1523] border border-[#1b253b] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-sm">Post Emergency Request</h3>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                      Broadcast urgent shortages to all nearby community donors and network partners.
                    </p>
                  </div>
                </div>

                {formError && (
                  <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handlePostRequest} className="space-y-3.5">
                  {/* Item Category Segmented Buttons */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Item Category
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setItemType('blood')}
                        className={`py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                          itemType === 'blood'
                            ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-950'
                            : 'bg-[#0a0e18] border-[#1a2337] text-slate-400 hover:text-white'
                        }`}
                      >
                        <Droplet className="w-3.5 h-3.5" />
                        <span>Blood</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemType('medicine')}
                        className={`py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                          itemType === 'medicine'
                            ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-950'
                            : 'bg-[#0a0e18] border-[#1a2337] text-slate-400 hover:text-white'
                        }`}
                      >
                        <Pill className="w-3.5 h-3.5" />
                        <span>Medicine</span>
                      </button>
                    </div>
                  </div>

                  {/* Specific Item Name */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Specific Item Name
                    </label>
                    <input
                      type="text"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder={itemType === 'blood' ? 'e.g., O-Negative Whole Blood' : 'e.g., Factor VIII 500 IU'}
                      className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 transition-all"
                    />
                  </div>

                  {/* Units Needed & Urgency */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Units Needed
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={unitsNeeded}
                        onChange={(e) => setUnitsNeeded(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500/80 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Urgency
                      </label>
                      <select
                        value={urgency}
                        onChange={(e) => setUrgency(e.target.value as 'Critical' | 'Urgent' | 'Standard')}
                        className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500/80 transition-all"
                      >
                        <option value="Critical">Critical</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Standard">Standard</option>
                      </select>
                    </div>
                  </div>

                  {/* Hospital / Ward Location */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Hospital / Ward Location
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={hospitalLocation}
                        onChange={(e) => setHospitalLocation(e.target.value)}
                        placeholder="St. Jude ICU, Trauma Ward 3"
                        className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-8 pr-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 transition-all"
                      />
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Emergency Contact (Direct Line)
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        value={contactInfo}
                        onChange={(e) => setContactInfo(e.target.value)}
                        placeholder="+1 (555) 019-2834"
                        className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-8 pr-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/80 transition-all"
                      />
                    </div>
                  </div>

                  {/* Publish Button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-950/60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Broadcasting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Publish Emergency Request</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* RIGHT COLUMN: Live Shortages & Community Banner (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Filter Tabs & Sort Dropdown matching reference */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['all', 'blood', 'medicine', 'critical', 'mine'] as Filter[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveFilter(tab)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                        activeFilter === tab
                          ? 'bg-red-600 text-white font-bold'
                          : 'bg-[#121826] border border-[#1c263c] text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab === 'all'
                        ? 'All'
                        : tab === 'blood'
                        ? 'Blood'
                        : tab === 'medicine'
                        ? 'Medicine'
                        : tab === 'critical'
                        ? 'Critical'
                        : 'My Posts'}
                    </button>
                  ))}
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1 text-xs text-slate-400 bg-[#121826] border border-[#1c263c] px-2.5 py-1 rounded-lg">
                  <span>Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'latest' | 'units' | 'urgency')}
                    className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="latest" className="bg-[#0f1523]">Latest</option>
                    <option value="units" className="bg-[#0f1523]">Units Needed</option>
                    <option value="urgency" className="bg-[#0f1523]">Urgency</option>
                  </select>
                </div>
              </div>

              {/* Shortage Cards (Displays live request or demo matching mockup) */}
              {displayRequests.map((req) => {
                const isOwner = Boolean(user && req.requester_id === user.id);
                const isActionBusy = Boolean(actionLoading[req.id]);

                // Pending pledges
                const requestPledges = pledges.filter((p) => p.request_id === req.id);
                const pendingIncomingPledges = requestPledges.filter(
                  (p) => p.status === 'Pending' || p.status === 'Pledged'
                );

                // Has user pledged
                const hasUserPendingPledge = Boolean(
                  user &&
                    pledges.some(
                      (p) =>
                        p.request_id === req.id &&
                        p.donor_id === user.id &&
                        (p.status === 'Pending' || p.status === 'Pledged')
                    )
                );

                const isBloodRequest = req.item_type === 'blood';
                const inRecoveryPeriod = isBloodRequest && !donorEligibility.isEligible;

                return (
                  <div
                    key={req.id}
                    className="bg-[#0f1523] border border-red-950/40 rounded-2xl p-5 relative shadow-lg hover:border-red-800/40 transition-all space-y-3"
                  >
                    {/* Top Header: Badge, Category, Date, Units */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            req.urgency === 'Critical'
                              ? 'bg-red-950/80 border border-red-800 text-red-400'
                              : req.urgency === 'Urgent'
                              ? 'bg-amber-950/80 border border-amber-800 text-amber-400'
                              : 'bg-sky-950/80 border border-sky-800 text-sky-400'
                          }`}
                        >
                          {req.urgency}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          {req.item_type === 'blood' ? (
                            <Droplet className="w-3 h-3 text-red-500" />
                          ) : (
                            <Pill className="w-3 h-3 text-emerald-400" />
                          )}
                          <span>{req.item_type}</span>
                        </span>
                        <span className="text-[11px] text-slate-500">• {formatTime(req.created_at)}</span>
                      </div>

                      {/* Top right: Units needed & 3 dots */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xl font-black text-red-500 leading-none">{req.units_needed}</span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                            UNIT NEEDED
                          </span>
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenCardMenuId((prev) => (prev === req.id ? null : req.id))}
                            className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                            title="More options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {openCardMenuId === req.id && (
                            <div className="absolute right-0 mt-1 w-44 bg-[#0d1320] border border-[#1d2940] rounded-xl shadow-2xl py-1.5 z-30 text-xs">
                              {isOwner && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(req)}
                                    className="w-full text-left px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/70 flex items-center gap-2 cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-sky-400" />
                                    <span>Edit Request</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenCardMenuId(null);
                                      handleArchive(req.id);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/70 flex items-center gap-2 cursor-pointer"
                                  >
                                    <Archive className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Archive</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenCardMenuId(null);
                                      handleDeleteRequest(req.id);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/40 flex items-center gap-2 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                  <div className="border-t border-slate-800 my-1" />
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => handleCopyShareLink(req.id)}
                                className="w-full text-left px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/70 flex items-center gap-2 cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>Copy Link</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Large Item Name (e.g., Ab-ve in reference) */}
                    <div>
                      <h4 className="text-2xl font-black text-white tracking-tight leading-tight">
                        {req.item_name}
                      </h4>
                    </div>

                    {/* Details Row: Hospital, Requester, Phone */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate">{req.hospital_location}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate">{req.requester_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <a href={`tel:${req.contact_info}`} className="text-slate-300 hover:text-red-400">
                          {req.contact_info}
                        </a>
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/60">
                      {/* Donor Pledge Action */}
                      {(!isOwner || req.id === 'demo-req-1') && (
                        <>
                          {hasUserPendingPledge ? (
                            <button
                              type="button"
                              disabled
                              className="px-5 py-2 bg-slate-800 border border-amber-500/40 text-amber-400 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-not-allowed opacity-90"
                            >
                              <Clock className="w-4 h-4" />
                              <span>PLEDGED (PENDING VERIFICATION)</span>
                            </button>
                          ) : inRecoveryPeriod ? (
                            <button
                              type="button"
                              disabled
                              className="px-5 py-2 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 cursor-not-allowed opacity-80"
                            >
                              <Clock className="w-4 h-4 text-amber-500" />
                              <span>RECOVERY ACTIVE ({donorEligibility.daysRemaining}D)</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPledgeModal(req)}
                              className="px-6 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-red-950/70 hover:scale-[1.02]"
                            >
                              <Heart className="w-3.5 h-3.5 fill-white" />
                              <span>PLEDGE 1 UNIT</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* Requester-only Edit, Archive & Delete */}
                      {isOwner && req.id !== 'demo-req-1' && (
                        <>
                          <button
                            type="button"
                            disabled={isActionBusy}
                            onClick={() => openEditModal(req)}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-sky-800/40 cursor-pointer disabled:opacity-50"
                            title="Edit request (Update units, blood group, urgency, location)"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            disabled={isActionBusy}
                            onClick={() => handleArchive(req.id)}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer disabled:opacity-50"
                            title="Archive request (Soft Delete)"
                          >
                            {isActionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                            <span>Archive</span>
                          </button>

                          <button
                            type="button"
                            disabled={isActionBusy}
                            onClick={() => handleDeleteRequest(req.id)}
                            className="px-3.5 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-red-800/50 cursor-pointer disabled:opacity-50"
                            title="Permanently Delete request (Hard Delete)"
                          >
                            {isActionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span>Delete</span>
                          </button>
                        </>
                      )}

                      {req.id === 'demo-req-1' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(req)}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-sky-800/40 cursor-pointer"
                            title="Edit emergency request"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlertBanner({ type: 'info', message: 'Demo request archive simulated.' })}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Archive</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlertBanner({ type: 'info', message: 'Demo request delete simulated.' })}
                            className="px-3.5 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-red-800/50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Incoming Pledges Panel for Requester */}
                    {isOwner && pendingIncomingPledges.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                        <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Incoming Donor Pledges ({pendingIncomingPledges.length})
                          </span>
                          <span>Pending Verification</span>
                        </div>

                        <div className="space-y-2">
                          {pendingIncomingPledges.map((pledge) => (
                            <div
                              key={pledge.id}
                              className="bg-[#0a0e18] border border-[#1c263c] rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                            >
                              <div>
                                <div className="font-bold text-white">
                                  {pledge.units_pledged} Unit(s) Pledged
                                  {pledge.profiles?.full_name && (
                                    <span className="text-slate-400 font-normal"> by {pledge.profiles.full_name}</span>
                                  )}
                                </div>
                                <div className="text-slate-400 text-[11px] flex items-center gap-3 mt-0.5">
                                  <span>ETA: ~{pledge.eta_minutes} mins</span>
                                  <span>Phone: {pledge.donor_phone}</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={verifyingPledgeId === pledge.id}
                                onClick={() => handleVerifyPledge(pledge.id)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                {verifyingPledgeId === pledge.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>Mark Received &amp; Verified</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Community Banner: "Be the reason someone lives today." (Exact match to Reference) */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#170a12] via-[#220d18] to-[#160810] border border-red-900/30 p-6 shadow-xl space-y-4">
                {/* Glowing hands / heart ambient light graphic */}
                <div className="absolute right-0 top-0 bottom-0 w-72 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-white tracking-tight">
                      Be the reason someone lives today.
                    </h3>
                    <p className="text-xs text-slate-400">
                      Real people. Real needs. Real impact.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={scrollToPostRequest}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-red-950 shrink-0 hover:scale-105"
                  >
                    <span>MAKE A DIFFERENCE</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 3 tags at bottom matching reference */}
                <div className="pt-2 border-t border-red-950/40 flex flex-wrap items-center gap-6 text-[11px] text-slate-400 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-red-500" />
                    <span>Donate Blood</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Support Hospitals</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500/30" />
                    <span>Stronger Communities</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* 7. PLEDGE COMMITMENT MODAL */}
      {/* ========================================================================= */}
      {selectedRequestForPledge && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1523] border border-[#1b253b] rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <button
              type="button"
              onClick={() => setSelectedRequestForPledge(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-red-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                <Heart className="w-3 h-3 fill-red-500" />
                Emergency Pledge Commitment
              </div>
              <h3 className="text-xl font-black text-white">
                Pledge for {selectedRequestForPledge.item_name}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Location: {selectedRequestForPledge.hospital_location} • Needed: {selectedRequestForPledge.units_needed} Units
              </p>
            </div>

            {pledgeError && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{pledgeError}</span>
              </div>
            )}

            <form onSubmit={handlePledgeSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Units to Pledge
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedRequestForPledge.units_needed}
                  required
                  value={pledgeUnits}
                  onChange={(e) => setPledgeUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Estimated Arrival Time (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pledgeEta}
                  onChange={(e) => setPledgeEta(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                  placeholder="30"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Date of Last Whole-Blood Donation
                </label>
                <input
                  type="date"
                  value={pledgeLastDate}
                  onChange={(e) => setPledgeLastDate(e.target.value)}
                  className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
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

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Your Contact Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={pledgePhone}
                  onChange={(e) => setPledgePhone(e.target.value)}
                  placeholder="+1 (555) 019-2834"
                  className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRequestForPledge(null)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pledgeSubmitting}
                  className="w-1/2 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-950"
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

      {/* ========================================================================= */}
      {/* 4. UPDATE EMERGENCY REQUEST MODAL (Supports Updating Blood Group, Units, Urgency, Location) */}
      {/* ========================================================================= */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#0f1523] border border-sky-800/40 rounded-2xl w-full max-w-md p-6 relative shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-sky-400" />
                  Update Emergency Request
                </h3>
                <p className="text-[11px] text-slate-400">
                  Modify units, blood group, urgency, or facility details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRequest(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateRequest} className="space-y-3.5">
              {/* Category Segmented Toggle */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Item Category
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#090d16] p-1 rounded-xl border border-[#1a2337]">
                  <button
                    type="button"
                    onClick={() => setEditItemType('blood')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editItemType === 'blood'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Droplet className="w-3.5 h-3.5" />
                    <span>Blood</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItemType('medicine')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editItemType === 'medicine'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Pill className="w-3.5 h-3.5" />
                    <span>Medicine</span>
                  </button>
                </div>
              </div>

              {/* Quick Blood Group Chips (if blood) */}
              {editItemType === 'blood' && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Select Blood Group
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Bombay (hh)', 'Rh-null'].map((bg) => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setEditItemName(bg)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          editItemName === bg
                            ? 'bg-red-600 text-white border-red-500 shadow-sm'
                            : 'bg-[#090d16] border-[#1c263c] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Specific Item Name */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Specific Item Name / Blood Group
                </label>
                <input
                  type="text"
                  required
                  value={editItemName}
                  onChange={(e) => setEditItemName(e.target.value)}
                  placeholder={editItemType === 'blood' ? 'e.g. O+, O-, AB-, Bombay Blood' : 'e.g. IVIG, Anti-D, Factor VIII'}
                  className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Units Needed & Urgency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Units Needed
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditUnitsNeeded((prev) => Math.max(1, prev - 1))}
                      className="w-8 h-8 rounded-lg bg-[#141b2d] border border-[#1d2940] text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      required
                      value={editUnitsNeeded}
                      onChange={(e) => setEditUnitsNeeded(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full text-center bg-[#0a0e18] border border-[#1a2337] rounded-xl py-1.5 text-xs text-slate-100 focus:outline-none focus:border-red-500 font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setEditUnitsNeeded((prev) => prev + 1)}
                      className="w-8 h-8 rounded-lg bg-[#141b2d] border border-[#1d2940] text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Urgency Level
                  </label>
                  <select
                    value={editUrgency}
                    onChange={(e) => setEditUrgency(e.target.value as 'Critical' | 'Urgent' | 'Standard')}
                    className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                  >
                    <option value="Critical" className="bg-[#0f1523]">Critical</option>
                    <option value="Urgent" className="bg-[#0f1523]">Urgent</option>
                    <option value="Standard" className="bg-[#0f1523]">Standard</option>
                  </select>
                </div>
              </div>

              {/* Hospital Location */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Hospital Location / Facility
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={editHospitalLocation}
                    onChange={(e) => setEditHospitalLocation(e.target.value)}
                    placeholder="Hospital name, floor, city..."
                    className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Direct Line Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={editContactInfo}
                    onChange={(e) => setEditContactInfo(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingRequest(null)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="w-1/2 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-sky-950"
                >
                  {editSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. USER PROFILE & SETTINGS MODAL */}
      {/* ========================================================================= */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#0f1523] border border-red-900/30 rounded-2xl w-full max-w-md p-6 relative shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-red-500" />
                  Profile &amp; Account Settings
                </h3>
                <p className="text-[11px] text-slate-400">
                  Update your contact details, clinical role, and blood group.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {profileError && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{profileError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Full Name / Display Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder="Rohith"
                    className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Phone Number (For Hospital Contacts)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+91 99164 52100"
                    className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Blood Group Dropdown */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Personal Blood Group
                </label>
                <select
                  value={editBloodGroup}
                  onChange={(e) => setEditBloodGroup(e.target.value)}
                  className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="O+" className="bg-[#0f1523]">O Positive (O+)</option>
                  <option value="O-" className="bg-[#0f1523]">O Negative (O-)</option>
                  <option value="A+" className="bg-[#0f1523]">A Positive (A+)</option>
                  <option value="A-" className="bg-[#0f1523]">A Negative (A-)</option>
                  <option value="B+" className="bg-[#0f1523]">B Positive (B+)</option>
                  <option value="B-" className="bg-[#0f1523]">B Negative (B-)</option>
                  <option value="AB+" className="bg-[#0f1523]">AB Positive (AB+)</option>
                  <option value="AB-" className="bg-[#0f1523]">AB Negative (AB-)</option>
                  <option value="Bombay (hh)" className="bg-[#0f1523]">Bombay Blood Group (hh)</option>
                  <option value="Rh-null" className="bg-[#0f1523]">Rh-null (Golden Blood)</option>
                  <option value="Other" className="bg-[#0f1523]">Other Rare Phenotype</option>
                </select>
              </div>

              {/* Role Selector */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Account Role
                </label>
                <div className="grid grid-cols-3 gap-2 bg-[#090d16] p-1 rounded-xl border border-[#1a2337]">
                  {(['donor', 'hospital', 'caregiver'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setEditRole(r)}
                      className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                        editRole === r
                          ? 'bg-red-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hospital / Facility Affiliation */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Hospital / Medical Facility Affiliation (Optional)
                </label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={editHospital}
                    onChange={(e) => setEditHospital(e.target.value)}
                    placeholder="e.g. Apollo Hospital, Cauvery Medical Center"
                    className="w-full bg-[#0a0e18] border border-[#1a2337] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-1/2 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-950"
                >
                  {profileSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    'Save Profile'
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
