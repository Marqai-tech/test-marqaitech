import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/trial/register
 * Public endpoint — companies register for a trial.
 * Creates a TrialRegistration record (status: "pending").
 * Super admin must approve before tenant/user are created.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyName,
      companyCode,
      companyEmail,
      companyPhone,
      companyWebsite,
      industry,
      country,
      currency,
      employeeCount,
      contactName,
      contactEmail,
      contactPhone,
      designation,
      address,
      city,
      state,
      zipCode,
    } = body;

    // Validate required fields
    if (!companyName || !companyCode || !companyEmail || !contactName || !contactEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: companyName, companyCode, companyEmail, contactName, contactEmail' },
        { status: 400 }
      );
    }

    // Normalize companyCode to slug-safe format
    const slug = companyCode
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if companyCode/slug already exists as a tenant
    const existingTenant = await db.tenant.findFirst({
      where: { slug },
    });
    if (existingTenant) {
      return NextResponse.json(
        { error: `Company code "${slug}" is already taken. Please choose a different one.` },
        { status: 409 }
      );
    }

    // Check if companyEmail already registered
    const existingRegByEmail = await db.trialRegistration.findFirst({
      where: { companyEmail },
    });
    if (existingRegByEmail) {
      return NextResponse.json(
        { error: 'This company email is already registered for a trial.' },
        { status: 409 }
      );
    }

    // Check if contactEmail already registered
    const existingRegByContact = await db.trialRegistration.findFirst({
      where: { contactEmail },
    });
    if (existingRegByContact) {
      return NextResponse.json(
        { error: 'This contact email is already registered for a trial.' },
        { status: 409 }
      );
    }

    // Create the trial registration
    const registration = await db.trialRegistration.create({
      data: {
        companyName,
        companyCode: slug,
        companyEmail,
        companyPhone: companyPhone || null,
        companyWebsite: companyWebsite || null,
        industry: industry || null,
        country: country || 'IN',
        currency: currency || 'INR',
        employeeCount: employeeCount || 10,
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
        designation: designation || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        status: 'pending',
        trialDays: 15,
      },
    });

    return NextResponse.json({
      message: 'Trial registration submitted successfully. Our team will review and approve your request within 24 hours.',
      registrationId: registration.id,
      companyCode: slug,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[Trial Register] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit registration. Please try again.' },
      { status: 500 }
    );
  }
}
