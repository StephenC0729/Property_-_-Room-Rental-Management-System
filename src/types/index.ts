// ─── User & Auth ─────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'admin' | 'operator'

export interface UserProfile {
  id: string
  full_name: string
  role: UserRole
}

// ─── Properties ──────────────────────────────────────────────────────────────

export interface Property {
  id: string
  name: string
  address: string
  created_at: string
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export type RoomStatus = 'occupied' | 'vacant' | 'maintenance'

export interface Room {
  id: string
  property_id: string
  code: string       // e.g. "1-A-1"
  room_number: string
  base_rent: number
  status: RoomStatus
  notes: string | null
  created_at: string
}

// ─── Billing Status (derived, not stored) ────────────────────────────────────

export type BillingStatus = 'paid' | 'overdue' | 'partial' | 'vacant' | 'maintenance' | 'upcoming'

export interface RoomBillingStatus {
  room_id: string
  room_code: string
  room_number: string
  base_rent: number
  room_status: RoomStatus
  billing_status: BillingStatus
  tenant_name: string | null
  tenant_phone: string | null
  lease_id: string | null
  monthly_rent: number | null
  due_day: number | null
  total_paid: number
  utilities_collected: number
  total_collected: number
  outstanding_balance: number
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  full_name: string
  nric_passport: string | null
  phone: string | null
  emergency_name: string | null
  emergency_relation: string | null
  emergency_phone: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

// ─── Leases ──────────────────────────────────────────────────────────────────

export type LeaseStatus = 'active' | 'expired' | 'terminated'

export interface Lease {
  id: string
  room_id: string
  tenant_id: string
  monthly_rent: number
  due_day: number
  move_in_date?: string | null
  expiry_date?: string | null
  status: LeaseStatus
  security_deposit: number
  utility_deposit: number
  notes: string | null
  created_at: string
  created_by: string | null
  // Joined fields
  room?: Room
  tenant?: Tenant
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'bank_transfer'

export interface Payment {
  id: string
  lease_id: string
  room_id: string
  tenant_id: string
  amount: number
  water_bill: number
  electricity_bill: number
  aircond_bill: number
  payment_date: string
  paid_at: string
  payment_method: PaymentMethod
  reference: string | null
  billing_month: string  // ISO date, always day 1: e.g. "2026-06-01"
  recorded_by: string | null
  notes: string | null
  // Joined fields
  room?: Room
  tenant?: Tenant
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type AuditAction =
  | 'PAYMENT_LOGGED'
  | 'PAYMENT_UPDATED'
  | 'PAYMENT_DELETED'
  | 'TENANT_CREATED'
  | 'TENANT_UPDATED'
  | 'LEASE_CREATED'
  | 'LEASE_UPDATED'
  | 'LEASE_TERMINATED'
  | 'ROOM_STATUS_CHANGED'
  | 'PROPERTY_CREATED'
  | 'PROPERTY_UPDATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_REMOVED'

export interface AuditLog {
  id: string
  user_id: string | null
  action: AuditAction
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  // Joined
  user_profile?: UserProfile
}
