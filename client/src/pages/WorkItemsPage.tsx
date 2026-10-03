import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { WorkItemPage, WorkStatus, WorkPriority, WorkItemFilters, Team, TeamUser } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { LoadingOverlay, ErrorMessage, EmptyState } from '@/components/ui/Feedback';
import { timeAgo, cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'INVESTIGATING', label: 'Investigating' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'WAITING_APPROVAL', label: 'Waiting Approval' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const PRIORITY_OPTIONS: { value: WorkPriority; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export default function WorkItemsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: WorkItemFilters = {
    page: parseInt(searchParams.get('page') || '1'),
    limit: 20,
    search: debouncedSearch || undefined,
    status: (searchParams.get('status') as WorkStatus) || undefined,
    priority: (searchParams.get('priority') as WorkPriority) || undefined,
    teamId: searchParams.get('teamId') || undefined,
    assigneeId: searchParams.get('assigneeId') || undefined,
    sort: (searchParams.get('sort') as any) || 'updatedAt',
    order: (searchParams.get('order') as any) || 'desc',
  };

  const updateFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const { data, isLoading, error, refetch } = useQuery<WorkItemPage>({
    queryKey: ['work-items', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
      const res = await api.get(`/work-items?${params}`);
      return res.data;
    },
    keepPreviousData: true,
  } as any);

  const { data: teams } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => (await api.get('/teams')).data,
  });

  const { data: users } = useQuery<TeamUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const totalPages = data?.pages || 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Items</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? `${data.total} item${data.total !== 1 ? 's' : ''}` : '...'}
          </p>
        </div>
        <Link
          to="/work-items/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Item
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                placeholder="Search work items..."
                className="block w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <Select
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            value={filters.status || ''}
            onChange={(e) => updateFilter('status', e.target.value || undefined)}
          />

          <Select
            options={PRIORITY_OPTIONS}
            placeholder="All priorities"
            value={filters.priority || ''}
            onChange={(e) => updateFilter('priority', e.target.value || undefined)}
          />

          <Select
            options={teams?.map(t => ({ value: t.id, label: t.name })) || []}
            placeholder="All teams"
            value={filters.teamId || ''}
            onChange={(e) => updateFilter('teamId', e.target.value || undefined)}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Select
            options={[
              { value: 'unassigned', label: 'Unassigned' },
              ...(users?.map(u => ({ value: u.id, label: u.name })) || []),
            ]}
            placeholder="All assignees"
            value={filters.assigneeId || ''}
            onChange={(e) => updateFilter('assigneeId', e.target.value || undefined)}
            className="max-w-xs"
          />
          <Select
            options={[
              { value: 'updatedAt', label: 'Last updated' },
              { value: 'createdAt', label: 'Created date' },
              { value: 'priority', label: 'Priority' },
              { value: 'status', label: 'Status' },
            ]}
            value={filters.sort || 'updatedAt'}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className="max-w-xs"
          />
          <button
            onClick={() => {
              setSearch('');
              setDebouncedSearch('');
              setSearchParams(new URLSearchParams());
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingOverlay />
      ) : error ? (
        <ErrorMessage message="Failed to load work items" onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <EmptyState
            title="No work items found"
            description="Try adjusting your search or filters"
            action={
              <Link to="/work-items/new" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
                Create first work item →
              </Link>
            }
            icon={
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Team</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Assignee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/work-items/${item.id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 line-clamp-1">
                      {item.title}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">#{item.id.slice(0, 8)} · by {item.createdByName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{item.teamName}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {item.assigneeName ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-700">
                          {item.assigneeName.charAt(0)}
                        </div>
                        <span className="text-sm text-gray-700">{item.assigneeName}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden xl:table-cell">{timeAgo(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Page {data.page} of {totalPages} · {data.total} items
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => updateFilter('page', String(data.page - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= totalPages}
                  onClick={() => updateFilter('page', String(data.page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
