import SectionLanding from '@/components/layout/SectionLanding';
import CreditsCard from '@/components/CreditsCard';

export const metadata = { title: 'Me' };

export default function MePage() {
  return (
    <SectionLanding id="me">
      <CreditsCard />
    </SectionLanding>
  );
}
