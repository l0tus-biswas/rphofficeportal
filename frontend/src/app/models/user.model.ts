export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'agent';
  level?: 'associate' | 'senior associate' | 'field manager' | 'senior manager' | 'division executive' | 'regional executive' | 'national executive';
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
}
