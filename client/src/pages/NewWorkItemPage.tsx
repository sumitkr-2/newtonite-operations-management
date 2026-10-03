import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Team, TeamUser } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Feedback';
import { generateIdempotencyKey } from '@/lib/utils';

export default function NewWorkItemPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState('');

  const { data: teams } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => (await api.get('/teams')).data,
  });

  const { data: teamUsers } = useQuery<TeamUser[]>({
    queryKey: ['team-users', teamId],
    queryFn: async () => (await api.get(`/users?teamId=${teamId}`)).data,
    enabled: !!teamId,
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/work-items', data, {
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
      return res.data;
    },
    onSuccess: (data) => {
      navigate(`/work-items/${data.id}`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create work item');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!teamId) { setError('Please select a team'); return; }
    mutation.mutate({
      title,
      description,
      teamId,
      priority,
      assigneeId: assigneeId || undefined,
    });
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Work Item</h1>
        <p className="text-sm text-gray-500 mt-1">Create a new work item for your team</p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert type="error" message={error} onDismiss={() => setError('')} />
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief, descriptive title of the work item"
            required
            maxLength={200}
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide context, steps to reproduce, or any relevant details..."
            rows={5}
            maxLength={10000}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Team *"
              options={teams?.map(t => ({ value: t.id, label: t.name })) || []}
              placeholder="Select team"
              value={teamId}
              onChange={(e) => { setTeamId(e.target.value); setAssigneeId(''); }}
              required
            />

            <Select
              label="Priority"
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>

          {teamId && (
            <Select
              label="Assignee"
              options={teamUsers?.map(u => ({ value: u.id, label: u.name })) || []}
              placeholder="Unassigned"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={mutation.isPending}>
              Create Work Item
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
