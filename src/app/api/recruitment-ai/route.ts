import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { action } = body;

    if (action === 'generate_jd') {
      const { jobTitle, department, experienceLevel, keySkills } = body;
      if (!jobTitle) return NextResponse.json({ error: 'Job title is required' }, { status: 400, headers: corsHeaders() });

      let jd = '';
      try {
        const zai = await ZAI.create();
        const response = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are an expert HR professional who creates compelling job descriptions. Return the job description in a structured format with sections: About the Role, Responsibilities, Requirements, Benefits, and About the Company placeholder.' },
            { role: 'user', content: `Generate a professional job description for:\nJob Title: ${jobTitle}\nDepartment: ${department || 'Not specified'}\nExperience Level: ${experienceLevel || 'Mid-level'}\nKey Skills: ${keySkills || 'Not specified'}` },
          ],
          stream: false,
        });
        if (response?.choices?.[0]?.message?.content) jd = response.choices[0].message.content;
      } catch {
        jd = `# ${jobTitle}\n\n## About the Role\nWe are looking for an experienced ${jobTitle} to join our ${department || 'dynamic'} team. This is an exciting opportunity for a ${experienceLevel || 'mid-level'} professional to make a significant impact.\n\n## Responsibilities\n- Lead and execute key projects within the ${department || 'department'}\n- Collaborate with cross-functional teams to drive results\n- Mentor junior team members and contribute to knowledge sharing\n- Identify process improvements and implement best practices\n- Report on progress and outcomes to senior leadership\n\n## Requirements\n- ${experienceLevel || '3-5 years'} of relevant experience in ${jobTitle}\n- Strong knowledge of ${keySkills || 'industry-standard tools and practices'}\n- Excellent communication and interpersonal skills\n- Problem-solving mindset with attention to detail\n- Bachelor's degree in a relevant field\n\n## Benefits\n- Competitive salary and equity package\n- Health, dental, and vision insurance\n- Flexible work arrangements\n- Professional development budget\n- Generous PTO and company holidays\n\n## About the Company\n[Company name] is a leading organization committed to excellence and innovation.`;
      }
      return NextResponse.json({ jd }, { headers: corsHeaders() });
    }

    if (action === 'parse_resume') {
      const { fileName } = body;
      // Simulate resume parsing (real implementation would use file upload + AI)
      const parsed = {
        name: 'John Smith',
        email: 'john.smith@email.com',
        phone: '+1-555-0123',
        skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS'],
        experience: [{ company: 'Tech Corp', role: 'Senior Developer', duration: '3 years', highlights: ['Led frontend team', 'Built microservices architecture'] }, { company: 'StartupXYZ', role: 'Full Stack Developer', duration: '2 years', highlights: ['Developed MVP', 'Implemented CI/CD'] }],
        education: [{ degree: 'BS Computer Science', institution: 'State University', year: 2018 }],
        summary: 'Experienced full-stack developer with 5+ years of expertise in modern web technologies. Proven track record of leading development teams and delivering high-quality software solutions.',
      };
      return NextResponse.json({ parsed }, { headers: corsHeaders() });
    }

    if (action === 'score_candidates') {
      const { jobPostingId } = body;
      // Generate mock AI scores for candidates
      const scores = [
        { candidateId: '1', name: 'Alice Johnson', skillsMatch: 85, experience: 78, education: 90, overall: 84 },
        { candidateId: '2', name: 'Bob Williams', skillsMatch: 72, experience: 88, education: 75, overall: 78 },
        { candidateId: '3', name: 'Carol Davis', skillsMatch: 90, experience: 65, education: 80, overall: 79 },
        { candidateId: '4', name: 'David Brown', skillsMatch: 60, experience: 92, education: 70, overall: 74 },
      ];
      return NextResponse.json({ scores }, { headers: corsHeaders() });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    console.error('Recruitment AI error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
