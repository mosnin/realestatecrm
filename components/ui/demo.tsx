import { PulseFitHero } from '@/components/ui/pulse-fit-hero';

export default function PulseFitHeroDemo() {
  return (
    <PulseFitHero
      logo="Chippi"
      title="Qualify leasing leads without the chaos"
      subtitle="One intake link, structured qualification, and practical scoring context so solo realtors can follow up faster."
      primaryAction={{ label: 'Start free trial', onClick: () => console.log('Start free trial') }}
      secondaryAction={{ label: 'See how it works', onClick: () => console.log('See how it works') }}
      disclaimer="*7-day free trial"
      socialProof={{
        avatars: [
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop',
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop',
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop',
          'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=80&h=80&fit=crop'
        ],
        text: 'Trusted by agents handling renter and leasing leads'
      }}
    />
  );
}
