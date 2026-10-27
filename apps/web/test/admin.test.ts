import { describe, expect, it } from 'vitest';
import { refusal } from '@/server/modules/admin/people';
import { courseKey, ratio } from '@/server/modules/admin/metrics';
import { diff } from '@/server/modules/admin/audit';

const campusAdmin = { id: 'a', campus: 'IIM Ahmedabad', role: 'campus_admin' as const, scope: 'campus' as const };
const platformAdmin = { id: 'p', campus: 'IIM Ahmedabad', role: 'admin' as const, scope: 'platform' as const };
const student = { id: 's', campus: 'IIM Ahmedabad', role: 'student' as const };

describe('who may change whom', () => {
  it('lets a campus admin make a student a moderator', () => {
    expect(refusal(campusAdmin, student, { role: 'moderator' })).toBeNull();
  });
  it('keeps a campus admin inside their campus', () => {
    expect(refusal(campusAdmin, { ...student, campus: 'IIM Bangalore' }, { role: 'mentor' })).toMatch(/not on your campus/);
  });
  it('stops a campus admin minting admins or touching other admins', () => {
    expect(refusal(campusAdmin, student, { role: 'campus_admin' })).toMatch(/platform team/);
    expect(refusal(campusAdmin, student, { role: 'admin' })).toMatch(/platform team/);
    expect(refusal(campusAdmin, { ...student, role: 'campus_admin' }, { suspended: true })).toMatch(/platform team/);
  });
  it('never lets anyone change or suspend themselves', () => {
    expect(refusal(platformAdmin, { ...student, id: 'p' }, { suspended: true })).toMatch(/yourself/);
    expect(refusal(campusAdmin, { ...student, id: 'a', role: 'campus_admin' }, { role: 'student' })).toMatch(/your own/);
  });
  it('lets a platform admin change anyone else, anywhere', () => {
    expect(refusal(platformAdmin, { ...student, campus: 'XLRI Jamshedpur' }, { role: 'campus_admin' })).toBeNull();
  });
});

describe('metrics helpers', () => {
  it('withholds ratios over groups under the privacy floor', () => {
    expect(ratio(2, 4)).toEqual({ value: null, numerator: 0, denominator: 4, suppressed: true });
    expect(ratio(3, 8)).toEqual({ value: 37.5, numerator: 3, denominator: 8, suppressed: false });
  });
  it('matches courses by code or by a normalised name', () => {
    expect(courseKey({ code: 'FIN-301', name: 'Corporate Finance' })).toBe('fin301');
    expect(courseKey({ name: '  Corporate  Finance ' })).toBe('corporatefinance');
  });
});

describe('audit diff', () => {
  it('keeps only what changed', () => {
    expect(diff<Record<string, unknown>>({ a: 1, b: 'x', c: [1] }, { a: 1, b: 'y', c: [1, 2], d: undefined })).toEqual({ before: { b: 'x', c: [1] }, after: { b: 'y', c: [1, 2] }, changed: true });
  });
});
