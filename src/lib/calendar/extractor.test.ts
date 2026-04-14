import { describe, it, expect } from 'vitest';
import { extractAppointments } from './extractor';

describe('extractAppointments', () => {
  it('returns empty array for content with no appointment data', () => {
    const result = extractAppointments({ title: 'Test', tags: [] }, 'doc-1');
    expect(result).toEqual([]);
  });

  it('extracts from followUpSchedule', () => {
    const content = {
      followUpSchedule: [
        {
          appointmentType: 'office visit',
          timeframe: '2 weeks',
          withProvider: {
            name: 'Dr. Smith',
            specialty: 'Cardiology',
            institution: { phone: '+1-555' },
          },
          purpose: 'Review lab results',
        },
      ],
    };

    const result = extractAppointments(content, 'doc-1', '2026-03-01');
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('Follow-up');
    expect(result[0].appointmentType).toBe('office visit');
    expect(result[0].provider?.name).toBe('Dr. Smith');
    expect(result[0].provider?.specialty).toBe('Cardiology');
    expect(result[0].sourceDocumentId).toBe('doc-1');
    expect(result[0].status).toBe('suggested');
    expect(result[0].synced).toBe(false);
  });

  it('extracts from nested recommendations.followUpSchedule', () => {
    const content = {
      recommendations: {
        followUpSchedule: [
          {
            appointmentType: 'lab work',
            timeframe: '1 month',
          },
        ],
      },
    };

    const result = extractAppointments(content, 'doc-2');
    expect(result).toHaveLength(1);
    expect(result[0].appointmentType).toBe('lab work');
  });

  it('extracts from referral recommendations', () => {
    const content = {
      recommendations: {
        recommendations: [
          {
            recommendation: 'Refer to neurologist',
            category: 'referral',
            priority: 'urgent',
            referralTo: {
              provider: { name: 'Dr. Neuro', specialty: 'Neurology' },
              urgency: 'urgent',
              reason: 'Persistent headaches',
            },
          },
        ],
      },
    };

    const result = extractAppointments(content, 'doc-3');
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('Referral');
    expect(result[0].appointmentType).toBe('referral');
    expect(result[0].priority).toBe('urgent');
    expect(result[0].provider?.name).toBe('Dr. Neuro');
  });

  it('extracts from follow_up category recommendations with timeframe', () => {
    const content = {
      recommendations: {
        recommendations: [
          {
            recommendation: 'Blood pressure check',
            category: 'follow_up',
            priority: 'routine',
            timeframe: '3 months',
          },
        ],
      },
    };

    const result = extractAppointments(content, 'doc-4', '2026-01-15');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Blood pressure check');
    expect(result[0].priority).toBe('routine');
  });

  it('extracts from carePlan.reviewDate', () => {
    const content = {
      recommendations: {
        carePlan: {
          goals: ['Control blood pressure'],
          reviewDate: '2026-06-15',
        },
        recommendations: [],
      },
    };

    const result = extractAppointments(content, 'doc-5');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Care plan review');
    expect(result[0].dateTime).toBe('2026-06-15');
    expect(result[0].appointmentType).toBe('review');
  });

  it('resolves relative timeframe "2 weeks" to ISO date', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit', timeframe: '2 weeks' },
      ],
    };

    const result = extractAppointments(content, 'doc-6', '2026-03-01');
    expect(result).toHaveLength(1);
    expect(result[0].dateTime).toBe('2026-03-15');
    expect(result[0].timeframe).toBeUndefined();
  });

  it('resolves relative timeframe "3 months" to ISO date', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit', timeframe: '3 months' },
      ],
    };

    const result = extractAppointments(content, 'doc-7', '2026-01-15');
    expect(result).toHaveLength(1);
    // Month addition via Date.setMonth; exact day may vary by timezone
    expect(result[0].dateTime).toMatch(/^2026-04-1[45]$/);
  });

  it('keeps timeframe as-is when no reference date', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit', timeframe: '2 weeks' },
      ],
    };

    const result = extractAppointments(content, 'doc-8');
    expect(result).toHaveLength(1);
    expect(result[0].dateTime).toBeUndefined();
    expect(result[0].timeframe).toBe('2 weeks');
  });

  it('keeps non-parseable timeframe as-is', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit', timeframe: 'as needed' },
      ],
    };

    const result = extractAppointments(content, 'doc-9', '2026-01-01');
    expect(result).toHaveLength(1);
    expect(result[0].dateTime).toBeUndefined();
    expect(result[0].timeframe).toBe('as needed');
  });

  it('uses ISO date timeframe directly', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit', timeframe: '2026-07-20' },
      ],
    };

    const result = extractAppointments(content, 'doc-10');
    expect(result).toHaveLength(1);
    expect(result[0].dateTime).toBe('2026-07-20');
  });

  it('maps urgency correctly', () => {
    const content = {
      recommendations: {
        recommendations: [
          {
            recommendation: 'Emergency referral',
            category: 'referral',
            priority: 'immediate',
            referralTo: {
              provider: { name: 'ER Doc', role: 'emergency_physician' },
              urgency: 'emergency',
            },
          },
        ],
      },
    };

    const result = extractAppointments(content, 'doc-11');
    expect(result[0].priority).toBe('immediate');
  });

  it('sets default reminders', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit', timeframe: '1 week' },
      ],
    };

    const result = extractAppointments(content, 'doc-12');
    expect(result[0].reminders).toEqual([1440, 60]); // 1 day + 1 hour
  });

  it('generates unique IDs for each appointment', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'visit A', timeframe: '1 week' },
        { appointmentType: 'visit B', timeframe: '2 weeks' },
      ],
    };

    const result = extractAppointments(content, 'doc-13');
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('handles mixed extraction points in one document', () => {
    const content = {
      followUpSchedule: [
        { appointmentType: 'lab work', timeframe: '1 week' },
      ],
      recommendations: {
        recommendations: [
          {
            recommendation: 'See specialist',
            category: 'referral',
            priority: 'routine',
            referralTo: {
              provider: { name: 'Specialist', role: 'neurologist' },
              urgency: 'routine',
            },
          },
        ],
        carePlan: {
          reviewDate: '2026-12-01',
        },
      },
    };

    const result = extractAppointments(content, 'doc-14');
    expect(result.length).toBeGreaterThanOrEqual(3);
    const types = result.map((a) => a.appointmentType);
    expect(types).toContain('lab work');
    expect(types).toContain('referral');
    expect(types).toContain('review');
  });

  it('skips followUpSchedule items without type and timeframe', () => {
    const content = {
      followUpSchedule: [
        { purpose: 'Just a note' }, // no appointmentType or timeframe
        { appointmentType: 'valid', timeframe: '1 week' },
      ],
    };

    const result = extractAppointments(content, 'doc-15');
    expect(result).toHaveLength(1);
    expect(result[0].appointmentType).toBe('valid');
  });

  it('handles recommendations as direct array', () => {
    const content = {
      recommendations: [
        {
          recommendation: 'Follow up with GP',
          category: 'follow_up',
          priority: 'routine',
          timeframe: '6 months',
        },
      ],
    };

    const result = extractAppointments(content, 'doc-16', '2026-01-01');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Follow up with GP');
  });
});
