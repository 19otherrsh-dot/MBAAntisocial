import { Suspense } from 'react';
import { ssoProviders } from '@/lib/auth';
import LoginForm from './LoginForm';
import styles from '../auth.module.css';

/**
 * `useSearchParams` opts a route out of static prerendering unless the reading
 * component sits behind a Suspense boundary, so the form is split out and the
 * page renders a skeleton around it.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.formBody}><div className="skeleton" style={{ height: 320 }} /></div>}>
      <LoginForm providers={ssoProviders} />
    </Suspense>
  );
}
