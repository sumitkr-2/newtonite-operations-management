import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { WorkItemDetail, WorkStatus, WorkPriority, TeamUser } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea, Select } from '@/components/ui/Input';
import { LoadingOverlay, ErrorMessage, Alert } from '@/components/ui/Feedback';
import { formatDateTime, timeAgo, formatEventDescription, generateIdempotencyKey } from '@/lib/utils';
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
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [commentBody, setCommentBody] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [globalSuccess, setGlobalSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');

  const { data: item, isLoading, error, refetch } = useQuery<WorkItemDetail>({
    queryKey: ['work-item', id],
    queryFn: async () => (await api.get(`/work-items/${id}`)).data,
    refetchOnWindowFocus: true,
  });

  const { data: teamUsers } = useQuery<TeamUser[]>({
    queryKey: ['team-users', item?.teamId],
    queryFn: async () => (await api.get(`/users?teamId=${item?.teamId}`)).data,
    enabled: !!item?.teamId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await api.patch(`/work-items/${id}`, updates, {
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['work-item', id], (old: any) => ({ ...old, ...data }));
      queryClient.invalidateQueries({ queryKey: ['work-item', id] });
      setGlobalSuccess('Updated successfully');
      setTimeout(() => setGlobalSuccess(''), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Update failed';
      const code = err.response?.data?.code;
      if (code === 'STALE_VERSION') {
        setGlobalError(`${msg} — click Refresh to get the latest version.`);
        refetch();
      } else {
        setGlobalError(msg);
      }
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (assigneeId: string | null) => {
      const res = await api.post(`/work-items/${id}/assign`,
        { version: item!.version, assigneeId },
        { headers: { 'Idempotency-Key': generateIdempotencyKey() } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['work-item', id], (old: any) => ({ ...old, ...data }));
      queryClient.invalidateQueries({ queryKey: ['work-item', id] });
      setGlobalSuccess('Assignment updated');
      setTimeout(() => setGlobalSuccess(''), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Assignment failed';
      const code = err.response?.data?.code;
      if (code === 'STALE_VERSION' || code === 'CONCURRENT_CONFLICT') {
        setGlobalError(`${msg} — refreshing...`);
        refetch();
      } else if (code === 'ALREADY_ASSIGNED') {
        setGlobalError(msg + ' Refreshing current state...');
        refetch();
      } else {
        setGlobalError(msg);
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post(`/work-items/${id}/comments`, { body }, {
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
      return res.data;
    },
    onSuccess: () => {
      setCommentBody('');
      queryClient.invalidateQueries({ queryKey: ['work-item', id] });
      setActiveTab('comments');
    },
    onError: (err: any) => {
      setGlobalError(err.response?.data?.error || 'Failed to add comment');
    },
  });

  if (isLoading) return <LoadingOverlay />;
  if (error) return (
    <div className="max-w-4xl">
      <ErrorMessage message="Work item not found or you do not have access" onRetry={() => refetch()} />
      <Link to="/work-items" className="mt-4 inline-block text-sm text-indigo-600">← Back to work items</Link>
    </div>
  );
  if (!item) return null;

  const handleStatusChange = (status: string) => {
    setGlobalError('');
    updateMutation.mutate({ version: item.version, status });
  };

  const handlePriorityChange = (priority: string) => {
    setGlobalError('');
    updateMutation.mutate({ version: item.version, priority });
  };

  const handleAssignToSelf = () => {
    setGlobalError('');
    assignMutation.mutate(user!.id);
  };

  const handleAssigneeChange = (assigneeId: string) => {
    setGlobalError('');
    assignMutation.mutate(assigneeId || null);
  };

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    commentMutation.mutate(commentBody);
  };

  const isAssignedToMe = item.assigneeId === user?.id;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/work-items" className="hover:text-indigo-600">Work Items</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">#{id?.slice(0, 8)}</span>
      </div>

      {/* Alerts */}
      {globalError && (
        <Alert type="error" message={globalError} onDismiss={() => setGlobalError('')} />
      )}
      {globalSuccess && (
        <Alert type="success" message={globalSuccess} onDismiss={() => setGlobalSuccess('')} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title + Description */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-xl font-bold text-gray-900 leading-snug">{item.title}</h1>
              <div className="flex gap-2 flex-shrink-0">
                <StatusBadge status={item.status} />
                <PriorityBadge priority={item.priority} />
              </div>
            </div>
            {item.description ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{item.description}</p>
              </div>
            ) : (
              <p className="text-gray-400 italic text-sm">No description provided</p>
            )}
          </div>

          {/* Comments + History tabs */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="border-b border-gray-200 px-6">
              <nav className="flex gap-6">
                {(['comments', 'history'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'comments' && item.comments.length > 0 && (
                      <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                        {item.comments.length}
                      </span>
                    )}
                    {tab === 'history' && item.history.length > 0 && (
                      <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                        {item.history.length}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'comments' ? (
                <div className="space-y-4">
                  {item.comments.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No comments yet. Be the first to add one.</p>
                  )}
                  {item.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700 flex-shrink-0">
                        {comment.userName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="bg-gray-50 rounded-lg px-4 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">{comment.userName}</span>
                            <span className="text-xs text-gray-500">{timeAgo(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add comment form */}
                  <form onSubmit={handleComment} className="flex gap-3 pt-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-medium text-white flex-shrink-0">
                      {user?.name.charAt(0)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Textarea
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Add a comment..."
                        rows={3}
                        maxLength={5000}
                      />
                      <div className="flex justify-end">
                        <Button type="submit" size="sm" isLoading={commentMutation.isPending} disabled={!commentBody.trim()}>
                          Post Comment
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="space-y-3">
                  {item.history.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No activity yet</p>
                  ) : (
                    [...item.history].reverse().map((event) => (
                      <div key={event.id} className="flex gap-3 items-start">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 flex-shrink-0 mt-0.5">
                          {event.actorName.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-800">{formatEventDescription(event)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(event.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar metadata */}
        <div className="space-y-4">
          {/* Status & Priority controls */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>

            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <Select
                options={STATUS_OPTIONS}
                value={item.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Priority</p>
              <Select
                options={PRIORITY_OPTIONS}
                value={item.priority}
                onChange={(e) => handlePriorityChange(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Assignee</p>
              <Select
                options={teamUsers?.map(u => ({ value: u.id, label: u.name })) || []}
                placeholder="Unassigned"
                value={item.assigneeId || ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                disabled={assignMutation.isPending}
              />
              {!isAssignedToMe && !item.assigneeId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  isLoading={assignMutation.isPending}
                  onClick={handleAssignToSelf}
                >
                  Assign to me
                </Button>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Info</h3>
            <InfoRow label="Team" value={item.teamName} />
            <InfoRow label="Created by" value={item.createdByName} />
            <InfoRow label="Created" value={formatDateTime(item.createdAt)} />
            <InfoRow label="Updated" value={timeAgo(item.updatedAt)} />
            <InfoRow label="Version" value={String(item.version)} />
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {item.status === 'OPEN' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => handleStatusChange('INVESTIGATING')}
                  isLoading={updateMutation.isPending}
                >
                  Start Investigating
                </Button>
              )}
              {item.status === 'INVESTIGATING' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => handleStatusChange('IN_PROGRESS')}
                  isLoading={updateMutation.isPending}
                >
                  Mark In Progress
                </Button>
              )}
              {item.status === 'IN_PROGRESS' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => handleStatusChange('WAITING_APPROVAL')}
                  isLoading={updateMutation.isPending}
                >
                  Request Approval
                </Button>
              )}
              {item.status === 'WAITING_APPROVAL' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => handleStatusChange('RESOLVED')}
                  isLoading={updateMutation.isPending}
                >
                  Mark Resolved
                </Button>
              )}
              {!['RESOLVED', 'CLOSED'].includes(item.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-gray-500 hover:text-gray-900"
                  onClick={() => handleStatusChange('CLOSED')}
                  isLoading={updateMutation.isPending}
                >
                  Close Item
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => refetch()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}
