import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { generatePrivacyPolicy } from '@/lib/privacy-policy-template';
import Link from 'next/link';

export const revalidate = 300; // Cache 5 minutes

export default async function RealtorPrivacyPolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settings }, { data: owner }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('privacyPolicyHtml, businessName')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('name')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const businessName = settings?.businessName || space.name;
  // Use the realtor's custom policy, or auto-generate a comprehensive default
  const policyHtml = settings?.privacyPolicyHtml || generatePrivacyPolicy(businessName, 'realtor');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">{businessName}</h1>
            <p className="text-xs text-muted-foreground">Privacy Policy</p>
          </div>
          <Link href={`/apply/${slug}`} className="text-xs text-primary underline">
            Back to application
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <article
          className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h2:text-lg prose-h3:text-base prose-p:text-sm prose-li:text-sm"
          dangerouslySetInnerHTML={{ __html: policyHtml }}
        />
        <div className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>This privacy policy is maintained by {businessName}.</p>
          <p>
            {businessName} uses{' '}
            <a href="https://usechippi.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Chippi
            </a>{' '}
            to process applications. Chippi&apos;s own{' '}
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Terms of Service
            </a>{' '}
            also apply.
          </p>
        </div>
      </main>
    </div>
  );
}
