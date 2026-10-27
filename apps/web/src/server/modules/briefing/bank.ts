import type { QuizQuestion } from '@/models/career/Quiz';

/**
 * Evergreen business GK for days without a generated quiz (no AI key, or the
 * feeds were unreachable). Five are drawn per day, deterministically, so
 * everyone on a campus gets the same set.
 */
export const QUIZ_BANK: QuizQuestion[] = [
  { prompt: 'What does EBITDA exclude that net profit includes?', options: ['Revenue and COGS', 'Interest, taxes, depreciation, amortisation', 'Dividends and buybacks', 'Working capital changes'], answerIndex: 1, explanation: 'EBITDA strips financing, tax, and non-cash charges to compare operating performance — expect it in any finance PI.', category: 'business' },
  { prompt: 'The repo rate is the rate at which…', options: ['Banks lend to each other overnight', 'The RBI lends to commercial banks', 'Banks park surplus with the RBI', 'The government borrows from the market'], answerIndex: 1, explanation: 'Repo is the RBI’s main policy lever; reverse repo/SDF is the parking side.', category: 'economy' },
  { prompt: 'A company’s P/E ratio of 40 means investors pay…', options: ['₹40 for every ₹1 of annual earnings', '40% of book value', '₹1 for every ₹40 of revenue', 'A 40% dividend yield'], answerIndex: 0, explanation: 'High P/E signals growth expectations — or overvaluation. Be ready to argue which.', category: 'markets' },
  { prompt: 'In Porter’s Five Forces, which is NOT one of the forces?', options: ['Threat of substitutes', 'Bargaining power of suppliers', 'Government regulation', 'Rivalry among competitors'], answerIndex: 2, explanation: 'Regulation shapes the forces but is not one; some frameworks add it as a sixth.', category: 'business' },
  { prompt: 'GST in India replaced which of these?', options: ['Income tax', 'Corporate tax', 'Excise duty and VAT, among others', 'Customs duty entirely'], answerIndex: 2, explanation: 'GST subsumed most indirect taxes in 2017; customs on imports largely remains.', category: 'policy' },
  { prompt: 'What does UPI stand for?', options: ['Unified Payments Interface', 'Universal Payment Index', 'United Payments Infrastructure', 'Unified Processing Interface'], answerIndex: 0, explanation: 'Built by NPCI; a favourite GD topic on fintech and digital public infrastructure.', category: 'tech' },
  { prompt: 'Contribution margin is…', options: ['Revenue minus fixed costs', 'Revenue minus variable costs', 'Net profit divided by revenue', 'Gross margin minus taxes'], answerIndex: 1, explanation: 'Core to break-even and unit-economics questions in consulting cases.', category: 'business' },
  { prompt: 'A fiscal deficit is the gap between…', options: ['Exports and imports', 'Total expenditure and total receipts excluding borrowings', 'Revenue receipts and revenue expenditure only', 'Money supply and demand'], answerIndex: 1, explanation: 'Know the Union Budget’s current fiscal-deficit target as a share of GDP.', category: 'economy' },
  { prompt: 'Which metric best measures a SaaS company’s revenue retention from existing customers?', options: ['CAC', 'Net revenue retention (NRR)', 'Gross margin', 'Burn multiple'], answerIndex: 1, explanation: 'NRR over 100% means existing customers grow revenue even before new sales.', category: 'tech' },
  { prompt: 'The BCG growth-share matrix labels a high-share, low-growth business a…', options: ['Star', 'Question mark', 'Cash cow', 'Dog'], answerIndex: 2, explanation: 'Cash cows fund stars and question marks — classic portfolio-strategy vocabulary.', category: 'business' },
  { prompt: 'CPI inflation in India is measured and released by…', options: ['RBI', 'NSO (MoSPI)', 'SEBI', 'NITI Aayog'], answerIndex: 1, explanation: 'The RBI targets CPI inflation of 4% (±2%), but MoSPI’s NSO publishes it.', category: 'economy' },
  { prompt: 'An IPO’s “green shoe” option lets underwriters…', options: ['Sell extra shares to cover over-allotment', 'Delay the listing date', 'Price below the band', 'Convert debt to equity'], answerIndex: 0, explanation: 'Usually up to 15% extra, used to stabilise the post-listing price.', category: 'markets' },
  { prompt: 'In marketing, the 4 Ps are Product, Price, Place and…', options: ['People', 'Promotion', 'Positioning', 'Packaging'], answerIndex: 1, explanation: 'Services extend it to 7 Ps (people, process, physical evidence).', category: 'business' },
  { prompt: 'Which body regulates India’s securities markets?', options: ['RBI', 'IRDAI', 'SEBI', 'PFRDA'], answerIndex: 2, explanation: 'SEBI governs listed companies, brokers, and mutual funds.', category: 'policy' },
  { prompt: 'Working capital is…', options: ['Total assets minus total liabilities', 'Current assets minus current liabilities', 'Cash plus marketable securities', 'Equity plus long-term debt'], answerIndex: 1, explanation: 'A cash-cycle question favourite: inventory, receivables, payables.', category: 'business' },
  { prompt: 'Little’s Law relates inventory, throughput and…', options: ['Cost', 'Flow time', 'Quality', 'Capacity utilisation'], answerIndex: 1, explanation: 'Inventory = throughput × flow time; operations interviewers love it.', category: 'business' },
  { prompt: 'A country’s current account deficit widens when…', options: ['Imports of goods and services rise faster than exports', 'FDI inflows rise', 'The central bank cuts rates', 'Taxes go up'], answerIndex: 0, explanation: 'Oil prices are a big swing factor for India’s CAD.', category: 'economy' },
  { prompt: 'In a DCF, the terminal value usually represents…', options: ['The first year’s cash flow', 'Value beyond the explicit forecast period', 'Liquidation value of assets', 'Book value of equity'], answerIndex: 1, explanation: 'Often the majority of a DCF’s value — be ready to defend the growth rate.', category: 'markets' },
  { prompt: 'Net Promoter Score asks customers…', options: ['How satisfied they were today', 'How likely they are to recommend you', 'How much they would pay', 'How often they buy'], answerIndex: 1, explanation: 'Promoters (9–10) minus detractors (0–6), on a 0–10 scale.', category: 'business' },
  { prompt: 'ONDC is India’s initiative to…', options: ['Digitise land records', 'Open up e-commerce via an interoperable network', 'Build a national cloud', 'Regulate data centres'], answerIndex: 1, explanation: 'A “UPI for commerce” — strong GD material on platforms vs. protocols.', category: 'tech' },
];

/** Five questions for `day`, the same for everyone. */
export function bankQuizFor(day: string): QuizQuestion[] {
  let seed = [...day].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pool = [...QUIZ_BANK];
  const picked: QuizQuestion[] = [];
  while (picked.length < 5 && pool.length) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
}
