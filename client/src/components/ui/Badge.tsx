import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline';
}

export function Badge({ children, className, variant = 'default' }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      className
    )}>
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  INVESTIGATING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  WAITING_APPROVAL: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  IN_PROGRESS: 'In Progress',
  WAITING_APPROVAL: 'Waiting Approval',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge className={STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

interface PriorityBadgeProps {
  priority: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-gray-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Badge className={cn('gap-1.5', PRIORITY_STYLES[priority] || 'bg-gray-100 text-gray-600')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[priority])} />
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </Badge>
  );
}
