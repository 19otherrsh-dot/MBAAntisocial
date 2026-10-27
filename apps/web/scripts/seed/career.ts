import User from '../../src/models/User';
import CompanyPage from '../../src/models/career/CompanyPage';
import { companyKeyOf } from '../../src/models/Application';
import ReferralRequest from '../../src/models/career/ReferralRequest';
import NewsItem from '../../src/models/career/NewsItem';
import { QuizDay, QuizAttempt } from '../../src/models/career/Quiz';
import JargonTerm from '../../src/models/career/JargonTerm';
import { CURATED_TERMS } from '../../src/server/modules/jargon/curated';
import { istDay } from '../../src/server/modules/briefing/service';
import type { SeedContext } from './index';

const ALUMNI = [
  { name: 'Vikram Iyer', email: 'vikram@alumni.iima.ac.in', company: 'McKinsey & Company', designation: 'Engagement Manager', graduationYear: 2019, capacity: 3, specializations: ['Consulting', 'Strategy'] },
  { name: 'Aisha Khan', email: 'aisha@alumni.iima.ac.in', company: 'Goldman Sachs', designation: 'Vice President, IBD', graduationYear: 2018, capacity: 2, specializations: ['Finance'] },
  { name: 'Rahul Menon', email: 'rahul@alumni.iima.ac.in', company: 'Google', designation: 'Product Manager', graduationYear: 2021, capacity: 4, specializations: ['Product', 'Analytics'] },
];

const STORIES = [
  { title: 'RBI holds repo rate, signals focus on core inflation', source: 'businessline', category: 'economy', summary: 'The Monetary Policy Committee kept the repo rate unchanged and retained its stance, citing sticky core inflation even as headline numbers eased.', whyItMatters: 'Rate decisions drive borrowing costs for companies and consumers — a staple of finance and GD questions.', gdAngle: 'Should the RBI prioritise growth over its inflation target in a slowing global economy?', tags: ['RBI', 'monetary policy'] },
  { title: 'Quick-commerce players expand dark-store networks into tier-2 cities', source: 'livemint', category: 'business', summary: 'Major quick-commerce platforms announced expansion of dark stores beyond metros, betting on rising order frequency in smaller cities.', whyItMatters: 'A live case on unit economics, density, and the threat to kirana stores and traditional e-commerce.', gdAngle: 'Is ten-minute delivery a sustainable business or a cash-burning race?', tags: ['retail', 'unit economics'] },
  { title: 'Government notifies draft rules under the digital data protection law', source: 'economictimes', category: 'policy', summary: 'Draft rules detail consent requirements, data-breach reporting timelines, and obligations for significant data fiduciaries.', whyItMatters: 'Every consumer-tech and fintech company’s product and compliance plans change with these rules.', gdAngle: 'Does stronger data protection slow down India’s digital innovation?', tags: ['privacy', 'regulation'] },
  { title: 'Indian IT majors report steady deal wins led by AI-services demand', source: 'businessline', category: 'tech', summary: 'Large IT services firms reported deal pipelines supported by generative-AI and cloud-modernisation projects, while discretionary spending stayed cautious.', whyItMatters: 'Shows how services firms are repositioning around AI — useful for strategy and IT-consulting interviews.', gdAngle: 'Will AI shrink or grow India’s IT services workforce over the next decade?', tags: ['IT services', 'AI'] },
  { title: 'Sensex, Nifty close at record highs on strong FPI inflows', source: 'livemint', category: 'markets', summary: 'Benchmark indices hit fresh highs as foreign portfolio investors turned buyers, led by banking and auto stocks.', whyItMatters: 'Market levels and FPI flows feed into questions on valuations, the rupee, and capital raising.', gdAngle: 'Are Indian equity valuations justified by earnings growth?', tags: ['markets', 'FPI'] },
  { title: 'EV makers seek extended incentives as subsidy scheme nears end', source: 'economictimes', category: 'business', summary: 'Electric two-wheeler manufacturers asked for continued incentives, warning that prices could rise as the current scheme winds down.', whyItMatters: 'A clean example of policy-dependent demand and the economics of an industry transition.', gdAngle: 'Should EV adoption be driven by subsidies or by market forces?', tags: ['EV', 'policy'] },
];

export async function run({ campus, users }: SeedContext): Promise<string> {
  await User.deleteMany({ email: { $in: ALUMNI.map((a) => a.email) } });
  const alumni = [];
  for (const a of ALUMNI) {
    alumni.push(
      await User.create({
        name: a.name,
        email: a.email,
        password: 'seedpassword123',
        campus,
        role: 'alumni',
        year: 2,
        batch: `${a.graduationYear - 2}-${String(a.graduationYear).slice(2)}`,
        specializations: a.specializations,
        emailVerifiedAt: new Date(),
        authProviders: ['password'],
        alumniProfile: { graduationYear: a.graduationYear, company: a.company, designation: a.designation, referralsOpen: true, referralCapacity: a.capacity },
        onboardedAt: new Date(),
      })
    );
  }

  await Promise.all([CompanyPage.deleteMany({ campus }), ReferralRequest.deleteMany({ campus }), JargonTerm.deleteMany({ source: 'curated' })]);
  await JargonTerm.insertMany(CURATED_TERMS.map((t) => ({ ...t, key: t.term.toLowerCase(), source: 'curated' })));

  const day = istDay();
  await Promise.all([NewsItem.deleteMany({ url: /example\.com\/seed/ }), QuizDay.deleteMany({ day }), QuizAttempt.deleteMany({ day })]);
  await NewsItem.insertMany(STORIES.map((s, i) => ({ ...s, url: `https://example.com/seed/${day}/${i}`, publishedAt: new Date(Date.now() - i * 45 * 60_000), day })));

  const u = (p: string) => users.find((x) => x.email.startsWith(`${p}@`));
  const [ananya, priya, sneha, tanvi] = ['ananya', 'priya', 'sneha', 'tanvi'].map(u);
  if (ananya && priya) {
    await CompanyPage.create({
      campus, key: companyKeyOf('McKinsey & Company'), name: 'McKinsey & Company', sector: 'Consulting',
      sections: {
        overview: 'Generalist consulting with a strong India practice. MBAs join as Associates; summer interns work on a real client study for 8 weeks.',
        process: 'Shortlist on CV (academics + leadership). **Two rounds**, each with two case interviews and a PEI (personal experience interview). Cases are interviewer-led — expect a chart to read and a quick maths check.',
        roles: 'Associate (generalist), with optional practice affiliation after a year. Offices: Mumbai, Delhi NCR, Bengaluru.',
        prep: 'Do 30+ live cases with a partner. Practise maths under time pressure. Prepare 3–4 PEI stories using a clear situation → action → result, with numbers.',
        culture: 'Long but structured weeks; strong feedback culture. Travel varies a lot by study.',
      },
      revisions: [
        { editor: ananya._id, section: 'process', summary: 'Added round structure from this year', previous: '', at: new Date(Date.now() - 3 * 86_400_000) },
        { editor: priya._id, section: 'prep', summary: 'Prep tips', previous: '', at: new Date(Date.now() - 86_400_000) },
      ],
    });
    await CompanyPage.create({ campus, key: companyKeyOf('Hindustan Unilever'), name: 'Hindustan Unilever', sector: 'FMCG', sections: { overview: 'The classic marketing and sales leadership track (UFLP).', process: 'Group discussion, then two personal interviews. Brand-based questions are common.', roles: '', prep: 'Know two HUL brands deeply — positioning, recent campaigns, competitors.', culture: '' }, revisions: [{ editor: priya._id, section: 'overview', summary: '', previous: '', at: new Date() }] });
  }
  if (sneha && tanvi) {
    await ReferralRequest.create({ campus, requester: sneha._id, alum: alumni[0]._id, company: 'McKinsey & Company', role: 'Summer Associate', note: 'I have led two live consulting projects with a Gujarat MSME cluster and placed in the national strategy case comp. I would love to be considered for the summer associate role in the Mumbai office.', status: 'pending' });
    await ReferralRequest.create({ campus, requester: tanvi._id, alum: alumni[2]._id, company: 'Google', role: 'APM Intern', note: 'I built a campus marketplace app with 2,000 users and ran its growth experiments; I am applying for the APM internship and would value a referral.', status: 'accepted', response: 'Happy to — send me your latest resume.', respondedAt: new Date() });
  }
  return `${alumni.length} alumni, ${CURATED_TERMS.length} glossary terms, ${STORIES.length} stories, 2 wiki pages, 2 referral requests`;
}
