'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types/database.types';
import { Mail, Lock, User, Hospital, Phone, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Profile['role']>('donor');
  const [hospitalName, setHospitalName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    startTransition(async () => {
      try {
        if (mode === 'signin') {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            setErrorMsg(error.message);
            return;
          }
          router.push('/dashboard');
          router.refresh();
        } else {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role,
                hospital_name: role === 'hospital' ? hospitalName : null,
                phone_number: phoneNumber,
              },
            },
          });

          if (error) {
            setErrorMsg(error.message);
            return;
          }

          if (data.session) {
            router.push('/dashboard');
            router.refresh();
          } else {
            setInfoMsg('Account created successfully! Check your email to verify your address.');
          }
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/40 text-red-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Clinical Lifeline
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">LifeFlow Exchange</h1>
          <p className="text-sm text-slate-400 mt-1">Community Blood & Rare Medicine Network</p>
        </div>

        <div className="flex border-b border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => { setMode('signin'); setErrorMsg(null); setInfoMsg(null); }}
            className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
              mode === 'signin' ? 'border-red-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setErrorMsg(null); setInfoMsg(null); }}
            className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
              mode === 'signup' ? 'border-red-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Register
          </button>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-6 p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-sm flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
            <span className="flex-1">{infoMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Alex Morgan"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Profile['role'])}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 transition-colors"
                >
                  <option value="donor">Volunteer Donor</option>
                  <option value="hospital">Hospital Administrator</option>
                  <option value="caregiver">Caregiver</option>
                </select>
              </div>

              {role === 'hospital' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Hospital / Clinic Name</label>
                  <div className="relative">
                    <Hospital className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      placeholder="St. Jude Memorial Hospital"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.org"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-2 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-red-900/20"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : mode === 'signin' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}