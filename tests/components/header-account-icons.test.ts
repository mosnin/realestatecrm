import { describe, expect, it } from 'vitest';
import { accountInitials } from '@/components/dashboard/header-account-icons';

describe('accountInitials', () => {
  it('uses first and last name when both exist', () => {
    expect(accountInitials({ firstName: 'Pat', lastName: 'Lee', email: 'mosninco@gmail.com' })).toBe(
      'PL',
    );
  });

  it('falls back to the email initial when no name is set', () => {
    expect(accountInitials({ firstName: null, lastName: null, email: 'mosninco@gmail.com' })).toBe(
      'M',
    );
  });

  it('uses a neutral letter when identity is empty', () => {
    expect(accountInitials({ firstName: '', lastName: '', email: null })).toBe('U');
  });
});
