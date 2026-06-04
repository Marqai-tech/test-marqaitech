import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { jobTitle, skills, experience, type } = body;

    if (!jobTitle) {
      return NextResponse.json({ error: 'Job title is required' }, { status: 400 });
    }

    const skillsStr = Array.isArray(skills) ? skills.join(', ') : skills || 'General';
    const typeStr = type || 'technical';

    const prompt = `Generate 5 ${typeStr} interview questions for a ${jobTitle} position.
Required skills: ${skillsStr}
Experience level: ${experience || 'Mid-level'}

Format each question as a JSON array of objects with:
- "question": the interview question
- "category": category (technical/behavioral/situational/domain)
- "difficulty": easy/medium/hard
- "expectedPoints": key points expected in the answer (array of strings)

Return ONLY the JSON array, no other text.`;

    let questions = [];
    let score = 0;

    try {
      const zai = await ZAI.create();
      const response = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert HR interviewer. Generate relevant, professional interview questions. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
      });

      const content = response?.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
        score = questions.length * 20;
      }
    } catch (aiError) {
      console.error('AI interview error:', aiError);
      // Fallback questions
      questions = [
        { question: `Tell me about your experience with ${skillsStr}?`, category: 'technical', difficulty: 'medium', expectedPoints: ['Relevant experience', 'Specific projects', 'Problem-solving approach'] },
        { question: `How do you handle tight deadlines in a ${jobTitle} role?`, category: 'behavioral', difficulty: 'medium', expectedPoints: ['Time management', 'Prioritization', 'Communication'] },
        { question: `Describe a challenging project you worked on as a ${jobTitle}.`, category: 'situational', difficulty: 'hard', expectedPoints: ['Problem description', 'Solution approach', 'Outcome'] },
        { question: `What methodologies do you follow for ${skillsStr}?`, category: 'domain', difficulty: 'medium', expectedPoints: ['Best practices', 'Industry standards', 'Adaptability'] },
        { question: `Where do you see yourself in 3 years in this ${jobTitle} career path?`, category: 'behavioral', difficulty: 'easy', expectedPoints: ['Career goals', 'Growth mindset', 'Alignment with role'] },
      ];
      score = 100;
    }

    // Log the AI interaction
    await prisma.aIChatLog.create({
      data: {
        userId: decoded.id as string,
        sessionId: `interview-${Date.now()}`,
        role: 'assistant',
        message: `Generated ${questions.length} interview questions for ${jobTitle}`,
        source: 'interview',
        metadata: JSON.stringify({ jobTitle, skills: skillsStr, experience, type: typeStr }),
      },
    });

    return NextResponse.json({ questions, score });
  } catch (error) {
    console.error('AI Interview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
