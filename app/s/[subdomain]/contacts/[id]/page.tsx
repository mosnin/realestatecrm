import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Mail, Phone, MapPin, FileText, Briefcase, CalendarDays, Wallet } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  QUALIFICATION: 'bg-blue-100 text-blue-700',
  TOUR: 'bg-amber-100 text-amber-700',
  APPLICATION: 'bg-green-100 text-green-700'
};

function formatType(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

export default async function ClientDetailPage({
  params
}: {
  params: Promise<{ subdomain: string; id: string }>;
}) {
  const { subdomain, id } = await params;

  type ClientWithDeals = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    budget: number | null;
    createdAt: Date;
    address: string | null;
    preferences: string | null;
    properties: string[];
    tags: string[];
    notes: string | null;
    type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
    dealContacts: Array<{
      deal: {
        id: string;
        title: string;
        address: string | null;
        value: number | null;
        stage: {
          name: string;
          color: string;
        };
      };
    }>;
  };

  const contact: ClientWithDeals | null = await db.contact.findUnique({
    where: { id },
    include: {
      dealContacts: {
        include: {
          deal: { include: { stage: true } }
        }
      }
    }
  });

  if (!contact) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/s/${subdomain}/contacts`}>
            <ArrowLeft size={18} />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{contact.name}</h2>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[contact.type]}`}>
            {formatType(contact.type)}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contact.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="text-muted-foreground flex-shrink-0" />
              <a href={`mailto:${contact.email}`} className="hover:underline">
                {contact.email}
              </a>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone size={16} className="text-muted-foreground flex-shrink-0" />
              <a href={`tel:${contact.phone}`} className="hover:underline">
                {contact.phone}
              </a>
            </div>
          )}
          {contact.budget != null && (
            <div className="flex items-center gap-3 text-sm">
              <Wallet size={16} className="text-muted-foreground flex-shrink-0" />
              <span>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0
                }).format(contact.budget)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <CalendarDays size={16} className="text-muted-foreground flex-shrink-0" />
            <span>Date Joined: {new Date(contact.createdAt).toLocaleDateString()}</span>
          </div>
          {contact.address && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin size={16} className="text-muted-foreground flex-shrink-0" />
              <span>{contact.address}</span>
            </div>
          )}
          {contact.preferences && (
            <div className="flex gap-3 text-sm">
              <FileText size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground whitespace-pre-wrap">
                <span className="font-medium text-foreground">Preferences: </span>
                {contact.preferences}
              </p>
            </div>
          )}
          {contact.properties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contact.properties.map((property) => (
                <Badge key={property} variant="secondary">
                  {property}
                </Badge>
              ))}
            </div>
          )}
          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {contact.notes && (
            <div className="flex gap-3 text-sm">
              <FileText size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-muted-foreground whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase size={18} />
            Associated Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contact.dealContacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No deals associated with this client.</p>
          ) : (
            <div className="space-y-3">
              {contact.dealContacts.map(({ deal }) => (
                <Link
                  key={deal.id}
                  href={`/s/${subdomain}/deals`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{deal.title}</p>
                    {deal.address && (
                      <p className="text-xs text-muted-foreground">{deal.address}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: deal.stage.color }}
                    >
                      {deal.stage.name}
                    </span>
                    {deal.value != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ${deal.value.toLocaleString()}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
