export interface Profile {
  id: string;
  full_name: string;
  role: 'donor' | 'hospital' | 'caregiver';
  hospital_name: string | null;
  phone_number: string | null;
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
  status: string;
  created_at: string;
}