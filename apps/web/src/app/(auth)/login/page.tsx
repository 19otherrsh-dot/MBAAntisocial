import { ssoProviders } from '@/lib/auth';
import LoginForm from './LoginForm';

/**
 * The query is read here, on the server, and handed down: reading it with
 * useSearchParams in the form would leave only a skeleton in the HTML until
 * the JavaScript arrives.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  return <LoginForm providers={ssoProviders} callbackUrl={one(query.callbackUrl) ?? '/home'} initialError={one(query.error)} />;
}
