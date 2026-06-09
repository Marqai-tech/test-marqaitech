import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/helpdesk
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const companyId = url.searchParams.get('companyId')
    const status = url.searchParams.get('status')
    const category = url.searchParams.get('category')
    const priority = url.searchParams.get('priority')

    const where: any = {}
    if (companyId) where.companyId = companyId
    if (status) where.status = status
    if (category) where.category = category
    if (priority) where.priority = priority

    const tickets = await db.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const open = tickets.filter(t => t.status === 'open').length
    const inProgress = tickets.filter(t => t.status === 'in_progress').length
    const resolved = tickets.filter(t => t.status === 'resolved').length
    const closed = tickets.filter(t => t.status === 'closed').length

    return NextResponse.json({ tickets, stats: { open, inProgress, resolved, closed, total: tickets.length } })
  } catch (error: any) {
    console.error('Helpdesk GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/helpdesk
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, requesterId, requesterType, category, priority, subject, description, assignedAgentId, sla } = body

    if (!companyId || !subject) {
      return NextResponse.json({ error: 'companyId and subject are required' }, { status: 400 })
    }

    const ticket = await db.ticket.create({
      data: {
        companyId,
        requesterId: requesterId || null,
        requesterType: requesterType || 'employee',
        category: category || 'hr',
        priority: priority || 'medium',
        subject,
        description: description || null,
        assignedAgentId: assignedAgentId || null,
        sla: sla || 24,
        status: 'open',
      },
    })

    await db.notification.create({
      data: { companyId, type: 'helpdesk', title: 'New Ticket Created', message: `Ticket: ${subject} (${priority} priority)` },
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error: any) {
    console.error('Helpdesk POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/helpdesk
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const ticket = await db.ticket.update({ where: { id }, data })

    if (data.status === 'resolved' || data.status === 'closed') {
      await db.notification.create({
        data: { companyId: ticket.companyId, type: 'helpdesk', title: `Ticket ${data.status}`, message: `Ticket "${ticket.subject}" has been ${data.status}` },
      })
    }

    return NextResponse.json(ticket)
  } catch (error: any) {
    console.error('Helpdesk PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
