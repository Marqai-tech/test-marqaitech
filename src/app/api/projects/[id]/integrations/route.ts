import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { encryptField, decryptField } from '@/lib/encryption';
import { logProjectActivity } from '@/lib/project-events';
import { resolveProjectAccess } from '@/lib/project-rbac';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET /api/projects/[id]/integrations
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const integrations = await db.projectIntegration.findMany({ where: { projectId: id } });
    return NextResponse.json(
      {
        integrations: integrations.map((i: any) => ({
          ...i,
          tokenEnc: undefined,
          hasToken: !!i.tokenEnc,
          mappingParsed: safeParse(i.mapping) || { tasks: {} },
        })),
        supported: ['jira', 'azure_devops'],
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get integrations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/integrations
// Body: { provider: 'jira'|'azure_devops', baseUrl, projectKey, username, token, status? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const body = await request.json();
    const provider = body.provider;
    if (!['jira', 'azure_devops'].includes(provider)) {
      return NextResponse.json({ error: 'provider must be "jira" or "azure_devops"' }, { status: 400, headers: corsHeaders() });
    }
    if (!body.baseUrl) return NextResponse.json({ error: 'baseUrl is required (e.g. https://yourcompany.atlassian.net)' }, { status: 400, headers: corsHeaders() });
    if (provider === 'jira' && !body.username) return NextResponse.json({ error: 'Jira account email (username) is required' }, { status: 400, headers: corsHeaders() });
    if (!body.token) return NextResponse.json({ error: 'API token / PAT is required (stored encrypted)' }, { status: 400, headers: corsHeaders() });

    // Optional live credential test before saving
    let test: { ok: boolean; message: string } | null = null;
    if (body.test !== false) {
      test = await testConnection(provider, body.baseUrl, body.username, body.token, body.projectKey);
      if (!test.ok) {
        return NextResponse.json({ error: `Connection test failed: ${test.message}` }, { status: 400, headers: corsHeaders() });
      }
    }

    const existing = await db.projectIntegration.findUnique({ where: { projectId_provider: { projectId: id, provider } } });
    const integration = existing
      ? await db.projectIntegration.update({
          where: { id: existing.id },
          data: {
            baseUrl: body.baseUrl,
            projectKey: body.projectKey || null,
            username: body.username || null,
            tokenEnc: encryptField(body.token),
            status: 'connected',
            lastSyncResult: test ? 'Connection test passed' : null,
          },
        })
      : await db.projectIntegration.create({
          data: {
            projectId: id,
            provider,
            baseUrl: body.baseUrl,
            projectKey: body.projectKey || null,
            username: body.username || null,
            tokenEnc: encryptField(body.token),
            mapping: JSON.stringify({ tasks: {}, statusMap: defaultStatusMap(provider) }),
            status: 'connected',
          },
        });

    await logProjectActivity(db, id, { type: 'integration', message: `${provider === 'jira' ? 'Jira' : 'Azure DevOps'} integration connected${test?.ok ? ' (credentials verified)' : ''}.` });

    return NextResponse.json({ integration: { ...integration, tokenEnc: undefined, hasToken: true } }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PATCH /api/projects/[id]/integrations
// Body: { integrationId, action: 'import' | 'push' | 'sync_status' | 'toggle', status? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const body = await request.json();
    const integration = await db.projectIntegration.findUnique({ where: { id: body.integrationId } });
    if (!integration || integration.projectId !== id) return NextResponse.json({ error: 'Integration not found on this project' }, { status: 404, headers: corsHeaders() });

    const tokenPlain = decryptField(integration.tokenEnc);
    if (!tokenPlain) return NextResponse.json({ error: 'Stored integration token could not be decrypted — please reconnect' }, { status: 409, headers: corsHeaders() });

    const mapping = safeParse(integration.mapping) || { tasks: {}, statusMap: defaultStatusMap(integration.provider) };

    if (body.action === 'toggle') {
      const updated = await db.projectIntegration.update({ where: { id: integration.id }, data: { status: body.status === 'disabled' ? 'disabled' : 'connected' } });
      return NextResponse.json({ integration: { ...updated, tokenEnc: undefined } }, { headers: corsHeaders() });
    }

    const project = await db.project.findUnique({ where: { id }, include: { tasks: { where: { status: { not: 'cancelled' } }, orderBy: { createdAt: 'asc' } } } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    let result: { imported: number; pushed: number; statusSynced: number; errors: string[] };

    try {
      if (body.action === 'import') {
        result = await importExternalIssues(db, integration, tokenPlain, mapping, project);
      } else if (body.action === 'push') {
        result = await pushLocalTasks(db, integration, tokenPlain, mapping, project);
      } else if (body.action === 'sync_status') {
        result = await syncStatuses(db, integration, tokenPlain, mapping, project);
      } else {
        return NextResponse.json({ error: 'action must be import | push | sync_status | toggle' }, { status: 400, headers: corsHeaders() });
      }
    } catch (e: any) {
      const msg = String(e?.message || 'External tool request failed');
      await db.projectIntegration.update({ where: { id: integration.id }, data: { status: 'error', lastSyncResult: msg.slice(0, 500) } });
      return NextResponse.json({ error: msg }, { status: 502, headers: corsHeaders() });
    }

    await db.projectIntegration.update({
      where: { id: integration.id },
      data: {
        mapping: JSON.stringify({ ...mapping, lastSyncAt: new Date().toISOString() }),
        status: 'connected',
        lastSyncAt: new Date(),
        lastSyncResult: `import:${result.imported} push:${result.pushed} status:${result.statusSynced}${result.errors.length ? ` errors:${result.errors.length}` : ''}`,
      },
    });

    await logProjectActivity(db, id, {
      type: 'integration',
      message: `${integration.provider === 'jira' ? 'Jira' : 'Azure DevOps'} sync — ${result.imported} imported, ${result.pushed} pushed, ${result.statusSynced} status updates.`,
    });

    return NextResponse.json({ ...result }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Sync integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/projects/[id]/integrations?integrationId=
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (!['tenant_admin', 'super_admin', 'admin'].includes((decoded as any).role)) {
      return NextResponse.json({ error: 'Only administrators can remove integrations' }, { status: 403, headers: corsHeaders() });
    }
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('integrationId');
    if (!integrationId) return NextResponse.json({ error: 'integrationId query param required' }, { status: 400, headers: corsHeaders() });

    const integration = await db.projectIntegration.findUnique({ where: { id: integrationId } });
    if (!integration || integration.projectId !== id) return NextResponse.json({ error: 'Integration not found on this project' }, { status: 404, headers: corsHeaders() });
    await db.projectIntegration.delete({ where: { id: integrationId } });
    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ═══════════════ Provider implementations ═══════════════

function defaultStatusMap(provider: string): Record<string, string> {
  if (provider === 'jira') {
    return { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done', cancelled: 'Cancelled' };
  }
  return { todo: 'To Do', in_progress: 'Active', review: 'Resolved', done: 'Closed', cancelled: 'Removed' };
}

function safeParse(s: unknown): any {
  if (!s) return null;
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

async function jiraAuth(username: string, token: string): Promise<string> {
  return 'Basic ' + Buffer.from(`${username}:${token}`).toString('base64');
}

async function adoAuth(token: string): Promise<string> {
  return 'Basic ' + Buffer.from(`:${token}`).toString('base64');
}

async function testConnection(provider: string, baseUrl: string, username: string | undefined, token: string, projectKey: string | undefined): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'jira') {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/myself`, {
        headers: { Authorization: await jiraAuth(username!, token), Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { ok: false, message: `Jira returned ${res.status}` };
      const me: any = await res.json();
      return { ok: true, message: `Connected as ${me.displayName || me.emailAddress || 'user'}` };
    }
    // Azure DevOps: hit the project endpoint
    const url = projectKey
      ? `${baseUrl.replace(/\/$/, '')}/_apis/projects/${encodeURIComponent(projectKey)}?api-version=7.0`
      : `${baseUrl.replace(/\/$/, '')}/_apis/projects?api-version=7.0`;
    const res = await fetch(url, {
      headers: { Authorization: await adoAuth(token), Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, message: `Azure DevOps returned ${res.status}` };
    return { ok: true, message: 'Azure DevOps connection verified' };
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e) };
  }
}

/** Pull external issues → create unmapped ProjectTasks. */
async function importExternalIssues(db: any, integration: any, token: string, mapping: any, project: any) {
  const errors: string[] = [];
  let imported = 0;

  let externals: Array<{ key: string; summary: string; description: string; status: string; url?: string }> = [];
  if (integration.provider === 'jira') {
    const jql = integration.projectKey ? `project = "${integration.projectKey}" ORDER BY created DESC` : 'ORDER BY created DESC';
    const res = await fetch(`${integration.baseUrl.replace(/\/$/, '')}/rest/api/3/search?maxResults=50`, {
      method: 'POST',
      headers: { Authorization: await jiraAuth(integration.username!, token), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jql, fields: ['summary', 'description', 'status'] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Jira search failed (${res.status})`);
    const data: any = await res.json();
    for (const issue of data.issues || []) {
      externals.push({
        key: issue.key,
        summary: issue.fields?.summary || '(untitled)',
        description: typeof issue.fields?.description === 'string' ? issue.fields.description : '',
        status: issue.fields?.status?.name || 'To Do',
        url: `${integration.baseUrl.replace(/\/$/, '')}/browse/${issue.key}`,
      });
    }
  } else {
    // Azure DevOps WIQL query
    const orgUrl = integration.baseUrl.replace(/\/$/, '');
    const wiql = {
      query: `SELECT [System.Id], [System.Title], [System.State], [System.Description] FROM WorkItems WHERE [System.TeamProject] = '${(integration.projectKey || '').replace(/'/g, "''")}' ORDER BY [System.CreatedDate] DESC`,
    };
    const res = await fetch(`${orgUrl}/_apis/wit/wiql?api-version=7.0`, {
      method: 'POST',
      headers: { Authorization: await adoAuth(token), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(wiql),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Azure DevOps WIQL failed (${res.status})`);
    const data: any = await res.json();
    const ids = (data.workItems || []).slice(0, 50).map((w: any) => w.id);
    if (ids.length > 0) {
      const detailsRes = await fetch(`${orgUrl}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=none&api-version=7.0`, {
        headers: { Authorization: await adoAuth(token), Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (detailsRes.ok) {
        const details: any = await detailsRes.json();
        for (const wi of details.value || []) {
          externals.push({
            key: String(wi.id),
            summary: wi.fields?.['System.Title'] || '(untitled)',
            description: (wi.fields?.['System.Description'] || '').replace(/<[^>]*>/g, ''),
            status: wi.fields?.['System.State'] || 'To Do',
            url: wi.url?._links?.html?.href || `${orgUrl}/`,
          });
        }
      }
    }
  }

  for (const ext of externals) {
    if (mapping.tasks && Object.values(mapping.tasks).some((m: any) => m.externalKey === ext.key)) continue;
    const task = await db.projectTask.create({
      data: {
        projectId: project.id,
        name: `[${ext.key}] ${ext.summary}`.slice(0, 300),
        description: ext.description || `Imported from ${integration.provider}. ${ext.url || ''}`,
        status: externalToLocalStatus(integration.provider, ext.status, mapping),
        isBillable: project.billingType !== 'non_billable',
      },
    });
    mapping.tasks[task.id] = { externalKey: ext.key, url: ext.url, provider: integration.provider };
    imported++;
  }

  return { imported, pushed: 0, statusSynced: 0, errors };
}

/** Push unmapped local tasks → create external issues. */
async function pushLocalTasks(db: any, integration: any, token: string, mapping: any, project: any) {
  const errors: string[] = [];
  let pushed = 0;
  const mappedIds = new Set(Object.keys(mapping.tasks || {}));
  const unmapped = (project.tasks || []).filter((t: any) => !mappedIds.has(t.id)).slice(0, 50);

  for (const task of unmapped) {
    try {
      if (integration.provider === 'jira') {
        const res = await fetch(`${integration.baseUrl.replace(/\/$/, '')}/rest/api/3/issue`, {
          method: 'POST',
          headers: { Authorization: await jiraAuth(integration.username!, token), 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            fields: {
              project: { key: integration.projectKey || undefined },
              summary: task.name.slice(0, 250),
              issuetype: { name: 'Task' },
              description: {
                type: 'doc', version: 1,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: (task.description || `Synced from 3Boxes HRMS project "${project.name}"`).slice(0, 3000) }] }],
              },
            },
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
          errors.push(`Jira push failed for "${task.name}": ${res.status}`);
          continue;
        }
        const created: any = await res.json();
        mapping.tasks[task.id] = { externalKey: created.key, url: `${integration.baseUrl.replace(/\/$/, '')}/browse/${created.key}`, provider: 'jira' };
      } else {
        const orgUrl = integration.baseUrl.replace(/\/$/, '').replace(/\/_apis.*$/, '');
        const projectPart = integration.projectKey || '';
        const res = await fetch(`${orgUrl}/${encodeURIComponent(projectPart)}/_apis/wit/workitems/$Task?api-version=7.0`, {
          method: 'POST',
          headers: { Authorization: await adoAuth(token), 'Content-Type': 'application/json-patch+json', Accept: 'application/json' },
          body: JSON.stringify([
            { op: 'add', path: '/fields/System.Title', value: task.name.slice(0, 250) },
            { op: 'add', path: '/fields/System.Description', value: (task.description || `Synced from 3Boxes HRMS project "${project.name}"`).slice(0, 3000) },
          ]),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
          errors.push(`ADO push failed for "${task.name}": ${res.status}`);
          continue;
        }
        const created: any = await res.json();
        mapping.tasks[task.id] = { externalKey: String(created.id), url: created._links?.html?.href || '', provider: 'azure_devops' };
      }
      pushed++;
    } catch (e: any) {
      errors.push(`${task.name}: ${String(e?.message || e)}`);
    }
  }

  return { imported: 0, pushed, statusSynced: 0, errors };
}

/** Two-way status sync for mapped tasks (local → external). */
async function syncStatuses(db: any, integration: any, token: string, mapping: any, project: any) {
  const errors: string[] = [];
  let statusSynced = 0;
  const entries = Object.entries(mapping.tasks || {}) as Array<[string, any]>;

  for (const [taskId, meta] of entries) {
    const task = (project.tasks || []).find((t: any) => t.id === taskId);
    if (!task || meta.provider !== integration.provider) continue;
    const wanted = (mapping.statusMap || defaultStatusMap(integration.provider))[task.status] as string | undefined;
    if (!wanted) continue;

    try {
      if (integration.provider === 'jira') {
        // find the transition that matches the wanted status
        const tRes = await fetch(`${integration.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${meta.externalKey}/transitions`, {
          headers: { Authorization: await jiraAuth(integration.username!, token), Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        if (!tRes.ok) { errors.push(`Transitions lookup failed for ${meta.externalKey}: ${tRes.status}`); continue; }
        const tData: any = await tRes.json();
        const match = (tData.transitions || []).find((tr: any) => tr.name?.toLowerCase() === wanted.toLowerCase() || tr.to?.name?.toLowerCase() === wanted.toLowerCase());
        if (!match) continue; // no matching transition — skip silently
        const doRes = await fetch(`${integration.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${meta.externalKey}/transitions`, {
          method: 'POST',
          headers: { Authorization: await jiraAuth(integration.username!, token), 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ transition: { id: match.id } }),
          signal: AbortSignal.timeout(15000),
        });
        if (doRes.ok || doRes.status === 204) statusSynced++;
        else errors.push(`Transition failed for ${meta.externalKey}: ${doRes.status}`);
      } else {
        const orgUrl = integration.baseUrl.replace(/\/$/, '');
        const res = await fetch(`${orgUrl}/_apis/wit/workitems/${meta.externalKey}?api-version=7.0`, {
          method: 'PATCH',
          headers: { Authorization: await adoAuth(token), 'Content-Type': 'application/json-patch+json', Accept: 'application/json' },
          body: JSON.stringify([{ op: 'add', path: '/fields/System.State', value: wanted }]),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) statusSynced++;
        else errors.push(`ADO state update failed for #${meta.externalKey}: ${res.status}`);
      }
    } catch (e: any) {
      errors.push(`${meta.externalKey}: ${String(e?.message || e)}`);
    }
  }

  return { imported: 0, pushed: 0, statusSynced, errors };
}

function externalToLocalStatus(provider: string, externalStatus: string, mapping: any): string {
  const map = mapping?.statusMap || defaultStatusMap(provider);
  for (const [local, ext] of Object.entries(map)) {
    if (String(ext).toLowerCase() === String(externalStatus).toLowerCase()) return local;
  }
  return 'todo';
}
