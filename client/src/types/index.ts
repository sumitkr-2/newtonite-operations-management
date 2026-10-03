// Types for the Newtonite Work Management System

export type WorkStatus = 'OPEN' | 'INVESTIGATING' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'RESOLVED' | 'CLOSED';
export type WorkPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TeamRole = 'ADMIN' | 'MANAGER' | 'AGENT';

export interface User {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  teams: TeamMembership[];
}

export interface TeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

export interface Team {
  id: string;
  name: string;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  status: WorkStatus;
  priority: WorkPriority;
  teamId: string;
  teamName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string;
  createdByName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  workItemId: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface WorkItemEvent {
  id: string;
  workItemId: string;
  actorId: string;
  actorName: string;
  eventType: string;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkItemDetail extends WorkItem {
  comments: Comment[];
  history: WorkItemEvent[];
}

export interface WorkItemPage {
  items: WorkItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface DashboardSummary {
  statusCounts: { status: WorkStatus; count: number }[];
  priorityCounts: { priority: WorkPriority; count: number }[];
  myItems: any[];
  recentActivity: any[];
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface WorkItemFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkStatus;
  priority?: WorkPriority;
  teamId?: string;
  assigneeId?: string;
  sort?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  order?: 'asc' | 'desc';
}
