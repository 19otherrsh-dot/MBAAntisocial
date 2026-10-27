import { ssoProviders } from '@/lib/auth';
import RegisterForm from './RegisterForm';

export default function RegisterPage() {
  return <RegisterForm providers={ssoProviders} />;
}
