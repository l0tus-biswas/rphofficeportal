export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'agent';
  level?: 'associate' | 'senior associate' | 'manager' | 'senior manager' | 'regional executive' | 'senior regional executive' | 'national executive' | 'senior national executive';
  promotedAt?: Date;
  promotedBy?: User;
  referralCode?: string;
  referredBy?: User;
  isActive: boolean;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  children?: User[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface ApplyFormData {
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  metadata?: any;
}

export interface TrainingMaterial {
  _id: string;
  title: string;
  description?: string;
  type: 'link' | 'youtube' | 'document' | 'video' | 'other';
  url: string;
  category: string;
  tags?: string[];
  thumbnail?: string;
  accessLevel: 'all' | 'agent';
  uploadedBy: User;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  [key: string]: any;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Stats {
  totalUsers?: number;
  totalAdmins?: number;
  totalAgents?: number;
  activeUsers?: number;
  inactiveUsers?: number;
  recentUsers?: number;
  directRecruits?: number;
  totalDownline?: number;
  activeRecruits?: number;
  inactiveRecruits?: number;
  licensedAgents?: number;
  unlicensedAgents?: number;
  totalProduction?: number;
  productionInForce?: number;
  recentProduction?: number;
  totalPremiumInForce?: number;
  // §25.3 — 24-hour activity
  newAgents24h?: number;
  newLicensedAgents24h?: number;
  newUnlicensedAgents24h?: number;
  newProduction24h?: number;
  newProductionSubmitted24h?: number;
  newProductionInForce24h?: number;
  newApplications24h?: number;
  recentActivity?: ActivityItem[];
  // §25.4 — ACA leaderboard
  totalACAClients?: number;
  acaBatch?: string;
  topPersonalACA?: ACALeaderEntry[];
  topTeamACA?: ACATeamEntry[];
  // §25.5 — Recent alerts
  recentAlerts?: AlertItem[];
}

export interface ActivityItem {
  type: string;
  icon: string;
  color: string;
  text: string;
  time: string;
}

export interface ACALeaderEntry {
  agentName: string;
  clientCount: number;
}

export interface ACATeamEntry {
  agentName: string;
  teamClientCount: number;
}

export interface AlertItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}
