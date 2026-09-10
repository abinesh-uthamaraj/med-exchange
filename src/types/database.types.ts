export interface Profile {
  id: string;
  full_name: string;
  role: 'donor' | 'hospital' | 'caregiver';
  hospital_name: string | null;
  phone_number: string | null;
  blood_group?: string | null;
  last_donation_date: string | null;
  created_at: string;
}

export interface MedicalRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  item_type: 'blood' | 'medicine';
  item_name: string;
  units_needed: number;
  urgency: 'Critical' | 'Urgent' | 'Standard';
  hospital_location: string;
  contact_info: string;
  status: 'Active' | 'Fulfilled' | 'Archived';
  created_at: string;
}

export interface Pledge {
  id: string;
  request_id: string;
  donor_id: string;
  units_pledged: number;
  status: 'Pending' | 'Pledged' | 'Verified';
  eta_minutes: number;
  donor_phone: string;
  created_at: string;
  verified_at: string | null;
  profiles?: { full_name: string; phone_number: string | null };
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
