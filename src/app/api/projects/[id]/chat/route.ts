import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/projects/[id]/chat — Task 121
 * Ensures the project has a linked Collaboration chat room (roomType
 * 'project', projectId = project id) and returns it. Idempotent:
 *  - existing room -> returned as-is (membership topped up from the current
 *    project team, so newly allocated employees join the conversation)
 *  - missing room  -> created with name = project name and members =
 *    project manager + delivery manager + all allocated employees + requester
 * Access: requester must be on the project team, or hold an admin role.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const project = await db.project.findUnique({
      where: { id },
      include: {
        allocations: { select: { employeeId: true } },
      },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const isAdminRole = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(decoded.role);
    const teamIds = new Set<string>(project.allocations.map((a) => a.employeeId));
    if (project.projectManagerId) teamIds.add(project.projectManagerId);
    if (project.deliveryManagerId) teamIds.add(project.deliveryManagerId);
    const isOnTeam = teamIds.has(employee.id) || project.createdBy === employee.id;
    if (!isOnTeam && !isAdminRole) {
      return NextResponse.json({ error: 'Only project members can open the project chat' }, { status: 403 });
    }

    let room = await db.chatRoom.findFirst({
      where: { projectId: id, roomType: 'project', isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    let created = false;
    if (!room) {
      room = await db.chatRoom.create({
        data: {
          name: project.name || 'Project Chat',
          roomType: 'project',
          companyId: project.companyId,
          projectId: project.id,
          createdBy: employee.id,
          description: `Discussion space for project ${project.name || project.id}`,
        },
      });
      created = true;
    }

    // Sync members: the project team (current allocations + managers +
    // requester) always has access, even if the room predates them or they
    // were allocated after the room was created. Existing members preserved.
    const desired = new Set<string>(teamIds);
    desired.add(employee.id);
    desired.delete('');
    const existingMembers = await db.chatRoomMember.findMany({
      where: { roomId: room.id },
      select: { userId: true },
    });
    const have = new Set(existingMembers.map((m) => m.userId));
    const toAdd = Array.from(desired).filter((eid) => eid && !have.has(eid));
    if (toAdd.length > 0) {
      await db.chatRoomMember.createMany({
        data: toAdd.map((eid) => ({ roomId: room!.id, userId: eid, role: 'member' })),
      });
    }

    const memberCount = have.size + toAdd.length;
    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        roomType: room.roomType,
        projectId: room.projectId,
        memberCount,
      },
      created,
      addedMembers: toAdd.length,
    });
  } catch (error) {
    console.error('GET project chat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
