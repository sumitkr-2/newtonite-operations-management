import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { DashboardSummary, WorkStatus, WorkPriority } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { LoadingOverlay, ErrorMessage } from '@/components/ui/Feedback';
import { timeAgo, formatEventDescription, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';

const STATUS_ORDER: WorkStatus[] = ['OPEN', 'INVESTIGATING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'RESOLVED', 'CLOSED'];
const PRIORITY_ORDER: WorkPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const STATUS_BG: Record<WorkStatus, string> = {
  OPEN: 'bg-blue-500',
  INVESTIGATING: 'bg-yellow-500',
  IN_PROGRESS: 'bg-indigo-500',
  WAITING_APPROVAL: 'bg-orange-500',
  RESOLVED: 'bg-green-500',
  CLOSED: 'bg-gray-400',
};

const PRIORITY_BG: Record<WorkPriority, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-gray-400',
};

export default function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/work-items/dashboard/summary');
      return res.data;
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingOverlay />;
  if (error) return <ErrorMessage message="Failed to load dashboard" onRetry={() => refetch()} />;

  const statusCounts = data?.statusCounts || [];
  const priorityCounts = data?.priorityCounts || [];
  const myItems = data?.myItems || [];
  const recentActivity = data?.recentActivity || [];

  const totalOpen = statusCounts.filter(s => !['RESOLVED', 'CLOSED'].includes(s.status)).reduce((sum, s) => sum + s.count, 0);
  const criticalCount = priorityCounts.find(p => p.priority === 'CRITICAL')?.count || 0;
  const highCount = priorityCounts.find(p => p.priority === 'HIGH')?.count || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Good to see you, {user?.name}</p>
        </div>
        <Link
          to="/work-items/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Work Item
        </Link>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Items"
          value={totalOpen}
          icon="📋"
          color="bg-indigo-50 text-indigo-700"
        />
        <StatCard
          title="Critical"
          value={criticalCount}
          icon="🔴"
          color="bg-red-50 text-red-700"
        />
        <StatCard
          title="High Priority"
          value={highCount}
          icon="🟠"
          color="bg-orange-50 text-orange-700"
        />
        <StatCard
          title="My Active Items"
          value={myItems.length}
          icon="👤"
          color="bg-blue-50 text-blue-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Items by Status</h2>
          <div className="space-y-3">
            {STATUS_ORDER.map((status) => {
              const count = statusCounts.find(s => s.status === status)?.count || 0;
              const total = statusCounts.reduce((sum, s) => sum + s.count, 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{STATUS_LABELS[status]}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${STATUS_BG[status]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Items by Priority</h2>
          <div className="space-y-3">
            {PRIORITY_ORDER.map((priority) => {
              const count = priorityCounts.find(p => p.priority === priority)?.count || 0;
              const total = priorityCounts.reduce((sum, p) => sum + p.count, 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={priority}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{PRIORITY_LABELS[priority]}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${PRIORITY_BG[priority]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* My active items */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">My Active Items</h2>
            <Link to="/work-items?assigneeId=me" className="text-xs text-indigo-600 hover:text-indigo-800">View all</Link>
          </div>
          {myItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No active items assigned to you</p>
          ) : (
            <div className="space-y-3">
              {myItems.map((item: any) => (
                <Link key={item.id} to={`/work-items/${item.id}`} className="block group">
                  <div className="flex items-start gap-2">
                    <PriorityBadge priority={item.priority} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 group-hover:text-indigo-600 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.team_name} · {timeAgo(item.updated_at)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          <Link to="/work-items" className="text-xs text-indigo-600 hover:text-indigo-800">View all items →</Link>
        </div>
        {recentActivity.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">No recent activity</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentActivity.map((event: any) => (
              <li key={event.id} className="px-6 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-xs font-medium text-indigo-700">
                  {event.actorName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    {formatEventDescription(event)}
                    {event.workItemId && (
                      <> on <Link to={`/work-items/${event.workItemId}`} className="text-indigo-600 hover:underline">{event.workItemTitle}</Link></>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{timeAgo(event.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className={`text-2xl font-bold ${color.split(' ')[1]}`}>{value}</p>
          <p className="text-xs text-gray-500">{title}</p>
        </div>
      </div>
    </div>
  );
}
