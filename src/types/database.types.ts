export type UserRole = 'donor' | 'recipient' | 'hospital';
export type RequestUrgency = 'Critical' | 'Urgent' | 'Standard';
export type RequestStatus = 'Active' | 'Fulfilled' | 'Archived';
export type PledgeStatus = 'Pending' | 'Verified' | 'Cancelled';

export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  role: UserRole;
  hospital_name: string | null;
  last_donation_date?: string | null;
  created_at: string;
}

export interface MedicalRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  item_type: 'blood' | 'medicine';
  item_name: string;
  units_needed: number;
  urgency: RequestUrgency;
  hospital_location: string;
  contact_info: string;
  status: RequestStatus;
  created_at: string;
}

export interface Pledge {
  id: string;
  request_id: string;
  donor_id: string;
  units_pledged: number;
  status: PledgeStatus;
  eta_minutes: number;
  donor_phone: string;
  verified_at?: string | null;
  created_at: string;
  requests?: MedicalRequest;
}

export interface DonationHistory {
  id: string;
  donor_id: string;
  request_id: string;
  item_name: string;
  units_donated: number;
  hospital_location: string;
  verified_by: string;
  verified_at: string;
}