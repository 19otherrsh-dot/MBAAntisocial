import type { CampusStatus } from '@mba/shared/campus';

/**
 * Starter directory of institutes and their official domains. Seeded into the
 * registry on first boot so common schools work immediately; platform admins
 * maintain it from then on. Domains here are a best-effort starting point —
 * an institute's alumni or programme subdomains match automatically.
 */
export interface DirectoryEntry {
  name: string;
  shortName: string;
  domains: string[];
  city: string;
  status: CampusStatus;
}

export const CAMPUS_DIRECTORY: DirectoryEntry[] = [
  { name: 'IIM Ahmedabad', shortName: 'IIMA', domains: ['iima.ac.in'], city: 'Ahmedabad', status: 'open' },
  { name: 'IIM Bangalore', shortName: 'IIMB', domains: ['iimb.ac.in'], city: 'Bengaluru', status: 'open' },
  { name: 'IIM Calcutta', shortName: 'IIMC', domains: ['iimcal.ac.in'], city: 'Kolkata', status: 'open' },
  { name: 'IIM Lucknow', shortName: 'IIML', domains: ['iiml.ac.in'], city: 'Lucknow', status: 'open' },
  { name: 'IIM Kozhikode', shortName: 'IIMK', domains: ['iimk.ac.in'], city: 'Kozhikode', status: 'open' },
  { name: 'IIM Indore', shortName: 'IIMI', domains: ['iimidr.ac.in'], city: 'Indore', status: 'open' },
  { name: 'XLRI Jamshedpur', shortName: 'XLRI', domains: ['xlri.ac.in'], city: 'Jamshedpur', status: 'open' },
  { name: 'FMS Delhi', shortName: 'FMS', domains: ['fms.edu'], city: 'New Delhi', status: 'open' },
  { name: 'ISB Hyderabad', shortName: 'ISB', domains: ['isb.edu'], city: 'Hyderabad', status: 'open' },
  { name: 'MDI Gurgaon', shortName: 'MDI', domains: ['mdi.ac.in'], city: 'Gurugram', status: 'open' },
  { name: 'SPJIMR Mumbai', shortName: 'SPJIMR', domains: ['spjimr.org'], city: 'Mumbai', status: 'open' },
  { name: 'JBIMS Mumbai', shortName: 'JBIMS', domains: ['jbims.edu'], city: 'Mumbai', status: 'open' },
  { name: 'IIFT Delhi', shortName: 'IIFT', domains: ['iift.edu', 'iift.ac.in'], city: 'New Delhi', status: 'open' },
  { name: 'NMIMS Mumbai', shortName: 'NMIMS', domains: ['nmims.edu', 'nmims.edu.in'], city: 'Mumbai', status: 'open' },
  { name: 'SIBM Pune', shortName: 'SIBM', domains: ['sibm.edu.in'], city: 'Pune', status: 'open' },
  { name: 'SCMHRD Pune', shortName: 'SCMHRD', domains: ['scmhrd.edu'], city: 'Pune', status: 'open' },
  { name: 'IMT Ghaziabad', shortName: 'IMT', domains: ['imt.edu'], city: 'Ghaziabad', status: 'open' },
  { name: 'Great Lakes Chennai', shortName: 'GLIM', domains: ['greatlakes.edu.in'], city: 'Chennai', status: 'open' },
];
