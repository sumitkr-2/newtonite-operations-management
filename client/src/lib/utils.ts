import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { WorkStatus, WorkPriority } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABELS: Record<WorkStatus, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  IN_PROGRESS: 'In Progress',
  WAITING_APPROVAL: 'Waiting Approval',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<WorkPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const STATUS_COLORS: Record<WorkStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  INVESTIGATING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  WAITING_APPROVAL: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
};

export const PRIORITY_COLORS: Record<WorkPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export const PRIORITY_DOT_COLORS: Record<WorkPriority, string> = {
  LOW: 'bg-gray-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) return formatDate(date);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function formatEventDescription(event: { eventType: string; oldValue: string | null; newValue: string | null; actorName: string }): string {
  const actor = event.actorName;
  switch (event.eventType) {
    case 'CREATED': return `${actor} created the work item`;
    case 'STATUS_CHANGED': return `${actor} changed status from ${STATUS_LABELS[event.oldValue as WorkStatus] || event.oldValue} to ${STATUS_LABELS[event.newValue as WorkStatus] || event.newValue}`;
    case 'PRIORITY_CHANGED': return `${actor} changed priority from ${PRIORITY_LABELS[event.oldValue as WorkPriority] || event.oldValue} to ${PRIORITY_LABELS[event.newValue as WorkPriority] || event.newValue}`;
    case 'ASSIGNED':
      if (!event.oldValue && event.newValue) return `${actor} assigned to ${event.newValue}`;
      if (event.oldValue && !event.newValue) return `${actor} unassigned ${event.oldValue}`;
      return `${actor} reassigned from ${event.oldValue} to ${event.newValue}`;
    case 'TITLE_CHANGED': return `${actor} updated the title`;
    case 'DESCRIPTION_CHANGED': return `${actor} updated the description`;
    case 'TEAM_CHANGED': return `${actor} moved item from ${event.oldValue} to ${event.newValue}`;
    case 'COMMENTED': return `${actor} added a comment`;
    default: return `${actor} performed action: ${event.eventType}`;
  }
}
