import bcrypt from 'bcryptjs';
import { pool } from './pool';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    await client.query('BEGIN');

    // Clear existing data
    await client.query('TRUNCATE idempotency_keys, work_item_events, comments, work_items, team_members, teams, users CASCADE');

    // Create users
    const passwordHash = await bcrypt.hash('password123', 10);
    const adminHash = await bcrypt.hash('admin123', 10);

    const usersResult = await client.query(`
      INSERT INTO users (id, name, email, password_hash, is_admin) VALUES
      (gen_random_uuid(), 'Alice Admin', 'alice@newtonite.com', $1, true),
      (gen_random_uuid(), 'Marcus Manager', 'marcus@newtonite.com', $2, false),
      (gen_random_uuid(), 'Rahul Agent', 'rahul@newtonite.com', $2, false),
      (gen_random_uuid(), 'Priya Agent', 'priya@newtonite.com', $2, false),
      (gen_random_uuid(), 'Sam Support', 'sam@newtonite.com', $2, false),
      (gen_random_uuid(), 'Divya Dev', 'divya@newtonite.com', $2, false)
      RETURNING id, name, email
    `, [adminHash, passwordHash]);

    const users = usersResult.rows;
    const alice = users[0];
    const marcus = users[1];
    const rahul = users[2];
    const priya = users[3];
    const sam = users[4];
    const divya = users[5];

    console.log('Created users:', users.map((u: any) => u.email));

    // Create teams
    const teamsResult = await client.query(`
      INSERT INTO teams (id, name) VALUES
      (gen_random_uuid(), 'Platform Engineering'),
      (gen_random_uuid(), 'Customer Support'),
      (gen_random_uuid(), 'Security & Compliance')
      RETURNING id, name
    `);
    const teams = teamsResult.rows;
    const platform = teams[0];
    const support = teams[1];
    const security = teams[2];

    console.log('Created teams:', teams.map((t: any) => t.name));

    // Add team members - use individual inserts to avoid parameter confusion
    const memberships = [
      { userId: alice.id, teamId: platform.id, role: 'ADMIN' },
      { userId: alice.id, teamId: support.id, role: 'ADMIN' },
      { userId: alice.id, teamId: security.id, role: 'ADMIN' },
      { userId: marcus.id, teamId: platform.id, role: 'MANAGER' },
      { userId: marcus.id, teamId: support.id, role: 'MANAGER' },
      { userId: rahul.id, teamId: platform.id, role: 'AGENT' },
      { userId: rahul.id, teamId: support.id, role: 'AGENT' },
      { userId: priya.id, teamId: platform.id, role: 'AGENT' },
      { userId: priya.id, teamId: security.id, role: 'AGENT' },
      { userId: sam.id, teamId: support.id, role: 'AGENT' },
      { userId: divya.id, teamId: platform.id, role: 'AGENT' },
    ];
    for (const m of memberships) {
      await client.query(
        'INSERT INTO team_members (user_id, team_id, role) VALUES ($1, $2, $3)',
        [m.userId, m.teamId, m.role]
      );
    }


    // Create work items
    const workItemsData = [
      { title: 'Payment gateway timeout causing checkout failures', description: 'Users are experiencing 30s timeouts when attempting checkout via the payment gateway. Affects ~15% of transactions during peak hours. Need immediate investigation.', status: 'IN_PROGRESS', priority: 'CRITICAL', team_id: platform.id, assignee_id: rahul.id, created_by_id: marcus.id },
      { title: 'Database connection pool exhaustion under load', description: 'During high traffic periods, the connection pool is being exhausted causing 500 errors. Pool max is set to 20, need to investigate query inefficiency or increase pool size.', status: 'INVESTIGATING', priority: 'HIGH', team_id: platform.id, assignee_id: divya.id, created_by_id: alice.id },
      { title: 'Customer unable to reset password', description: 'Multiple customers reporting that the password reset email is not arriving. The reset links that do arrive appear to expire before use.', status: 'OPEN', priority: 'HIGH', team_id: support.id, assignee_id: sam.id, created_by_id: marcus.id },
      { title: 'API rate limiter blocking legitimate traffic', description: 'Our API rate limiter is incorrectly flagging legitimate partner API calls as abuse. Need to investigate rate limit configuration and whitelist partner IPs.', status: 'WAITING_APPROVAL', priority: 'HIGH', team_id: platform.id, assignee_id: rahul.id, created_by_id: rahul.id },
      { title: 'SSL certificate expiry warning for api.newtonite.com', description: 'SSL certificate for api.newtonite.com expires in 14 days. Need to renew and deploy before expiry to prevent service disruption.', status: 'OPEN', priority: 'CRITICAL', team_id: security.id, assignee_id: priya.id, created_by_id: alice.id },
      { title: 'User profile page slow to load', description: 'The user profile page is taking 5-8 seconds to load due to unoptimized queries. Need to add database indexes and implement caching.', status: 'OPEN', priority: 'MEDIUM', team_id: platform.id, assignee_id: null, created_by_id: marcus.id },
      { title: 'Export to CSV feature not working for large datasets', description: 'When exporting more than 1000 records to CSV, the request times out. Need to implement background job processing for large exports.', status: 'OPEN', priority: 'MEDIUM', team_id: platform.id, assignee_id: null, created_by_id: rahul.id },
      { title: 'Onboarding email sequence contains broken links', description: 'Several links in the new user onboarding email sequence point to outdated URLs. Need to update all email templates.', status: 'RESOLVED', priority: 'MEDIUM', team_id: support.id, assignee_id: sam.id, created_by_id: sam.id },
      { title: 'Two-factor authentication bypass vulnerability', description: 'Security audit identified a potential bypass in the 2FA implementation. The time-based OTP window is too wide (10 minutes). Need to reduce to 30 seconds.', status: 'IN_PROGRESS', priority: 'CRITICAL', team_id: security.id, assignee_id: priya.id, created_by_id: alice.id },
      { title: 'Mobile app crashes on iOS 17 after update', description: 'Following the latest app update, users on iOS 17 are experiencing crashes when accessing the notifications panel.', status: 'INVESTIGATING', priority: 'HIGH', team_id: platform.id, assignee_id: divya.id, created_by_id: marcus.id },
      { title: 'Update privacy policy for GDPR compliance', description: 'Legal team has requested updates to the privacy policy to comply with new GDPR requirements effective next month.', status: 'OPEN', priority: 'LOW', team_id: security.id, assignee_id: null, created_by_id: alice.id },
      { title: 'Dashboard loading time optimization', description: 'Executive dashboard takes 12+ seconds to load. Need to implement data aggregation jobs and caching layer.', status: 'OPEN', priority: 'MEDIUM', team_id: platform.id, assignee_id: null, created_by_id: marcus.id },
      { title: 'Support ticket system integration with Slack', description: 'Team has requested that new support tickets automatically create Slack notifications in the #support-alerts channel.', status: 'CLOSED', priority: 'LOW', team_id: support.id, assignee_id: sam.id, created_by_id: marcus.id },
      { title: 'Implement audit logging for admin actions', description: 'Compliance requires that all admin actions be logged with user ID, timestamp, and action details. Currently missing for several admin endpoints.', status: 'IN_PROGRESS', priority: 'HIGH', team_id: security.id, assignee_id: priya.id, created_by_id: alice.id },
      { title: 'Search performance degraded after index rebuild', description: 'After the scheduled index rebuild last night, full-text search is returning results 3x slower than before. Need to investigate query plan changes.', status: 'OPEN', priority: 'MEDIUM', team_id: platform.id, assignee_id: rahul.id, created_by_id: divya.id },
    ];

    const workItemIds: string[] = [];
    for (const wi of workItemsData) {
      const res = await client.query(`
        INSERT INTO work_items (title, description, status, priority, team_id, assignee_id, created_by_id)
        VALUES ($1, $2, $3::work_status, $4::work_priority, $5, $6, $7)
        RETURNING id
      `, [wi.title, wi.description, wi.status, wi.priority, wi.team_id, wi.assignee_id, wi.created_by_id]);
      workItemIds.push(res.rows[0].id);
    }

    console.log(`Created ${workItemIds.length} work items`);

    // Add comments
    const commentsData = [
      { work_item_id: workItemIds[0], user_id: rahul.id, body: 'Started investigation. The issue appears to be in the payment provider SDK. Seeing timeouts at the network level.' },
      { work_item_id: workItemIds[0], user_id: marcus.id, body: 'Payment provider has been contacted. They acknowledge the issue on their end and are investigating.' },
      { work_item_id: workItemIds[0], user_id: priya.id, body: 'Added retry logic as a temporary mitigation. Will monitor error rates.' },
      { work_item_id: workItemIds[1], user_id: divya.id, body: 'Found 3 N+1 query patterns in the user dashboard endpoint. Fixing those should reduce connection hold time significantly.' },
      { work_item_id: workItemIds[1], user_id: alice.id, body: 'Good find. Also consider increasing the pool size to 50 as an immediate relief measure.' },
      { work_item_id: workItemIds[2], user_id: sam.id, body: 'Reproduced the issue. The email service provider is showing delays. Will contact their support.' },
      { work_item_id: workItemIds[8], user_id: priya.id, body: 'Patch deployed to staging. Testing now. Will push to production after sign-off.' },
      { work_item_id: workItemIds[8], user_id: alice.id, body: 'Please expedite. This is a critical security issue.' },
      { work_item_id: workItemIds[9], user_id: divya.id, body: 'Crash report analyzed. It\'s a threading issue with the new notification library. Fix is in progress.' },
    ];

    for (const c of commentsData) {
      await client.query(
        'INSERT INTO comments (work_item_id, user_id, body) VALUES ($1, $2, $3)',
        [c.work_item_id, c.user_id, c.body]
      );
    }

    // Add audit events
    const eventsData = [
      { work_item_id: workItemIds[0], actor_id: marcus.id, event_type: 'CREATED', old_value: null, new_value: 'Payment gateway timeout causing checkout failures' },
      { work_item_id: workItemIds[0], actor_id: marcus.id, event_type: 'ASSIGNED', old_value: null, new_value: rahul.name },
      { work_item_id: workItemIds[0], actor_id: rahul.id, event_type: 'STATUS_CHANGED', old_value: 'OPEN', new_value: 'INVESTIGATING' },
      { work_item_id: workItemIds[0], actor_id: rahul.id, event_type: 'STATUS_CHANGED', old_value: 'INVESTIGATING', new_value: 'IN_PROGRESS' },
      { work_item_id: workItemIds[1], actor_id: alice.id, event_type: 'CREATED', old_value: null, new_value: 'Database connection pool exhaustion under load' },
      { work_item_id: workItemIds[1], actor_id: alice.id, event_type: 'PRIORITY_CHANGED', old_value: 'MEDIUM', new_value: 'HIGH' },
      { work_item_id: workItemIds[1], actor_id: alice.id, event_type: 'ASSIGNED', old_value: null, new_value: divya.name },
      { work_item_id: workItemIds[3], actor_id: rahul.id, event_type: 'CREATED', old_value: null, new_value: 'API rate limiter blocking legitimate traffic' },
      { work_item_id: workItemIds[3], actor_id: rahul.id, event_type: 'STATUS_CHANGED', old_value: 'OPEN', new_value: 'WAITING_APPROVAL' },
      { work_item_id: workItemIds[7], actor_id: sam.id, event_type: 'CREATED', old_value: null, new_value: 'Onboarding email sequence contains broken links' },
      { work_item_id: workItemIds[7], actor_id: sam.id, event_type: 'STATUS_CHANGED', old_value: 'OPEN', new_value: 'IN_PROGRESS' },
      { work_item_id: workItemIds[7], actor_id: sam.id, event_type: 'STATUS_CHANGED', old_value: 'IN_PROGRESS', new_value: 'RESOLVED' },
      { work_item_id: workItemIds[8], actor_id: alice.id, event_type: 'CREATED', old_value: null, new_value: 'Two-factor authentication bypass vulnerability' },
      { work_item_id: workItemIds[8], actor_id: alice.id, event_type: 'PRIORITY_CHANGED', old_value: 'HIGH', new_value: 'CRITICAL' },
      { work_item_id: workItemIds[8], actor_id: alice.id, event_type: 'ASSIGNED', old_value: null, new_value: priya.name },
    ];

    for (const e of eventsData) {
      await client.query(
        'INSERT INTO work_item_events (work_item_id, actor_id, event_type, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
        [e.work_item_id, e.actor_id, e.event_type, e.old_value, e.new_value]
      );
    }

    await client.query('COMMIT');
    console.log('Database seeded successfully!');
    console.log('\nDemo credentials:');
    console.log('  Admin:   alice@newtonite.com / admin123');
    console.log('  Manager: marcus@newtonite.com / password123');
    console.log('  Agent:   rahul@newtonite.com / password123');
    console.log('  Agent:   priya@newtonite.com / password123');
    console.log('  Agent:   sam@newtonite.com / password123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
