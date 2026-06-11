'use client'

/**
 * FeaturesSection (Tailark) — the provided three-card soft feature grid with
 * live illustrations (meeting card + avatar row, review card, ask-assistant
 * composer), tailored to Chippi: tour prep, draft review, ask-anything.
 * One forced swap: the repo lint-bans the Sparkles icon; MessageCircle (the
 * Chippi mark) stands in.
 */

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowUp, CalendarCheck, Globe, Play, Plus, Signature, MessageCircle, Target } from 'lucide-react'

const MESCHAC_AVATAR = 'https://avatars.githubusercontent.com/u/47919550?v=4'
const BERNARD_AVATAR = 'https://avatars.githubusercontent.com/u/31113941?v=4'
const THEO_AVATAR = 'https://avatars.githubusercontent.com/u/68236786?v=4'
const GLODIE_AVATAR = 'https://avatars.githubusercontent.com/u/99137927?v=4'

export default function FeaturesTailark() {
    return (
        <section>
            <div className="py-24">
                <div className="mx-auto w-full max-w-5xl px-6">
                    <div>
                        <h2 className="max-w-2xl text-balance text-4xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
                            A teammate in every part of the day
                        </h2>
                    </div>
                    <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card className="overflow-hidden border-transparent bg-muted/30 p-6 shadow-none">
                            <Target className="size-5 text-brand" />
                            <h3 className="mt-5 text-lg font-semibold text-foreground">Tour prep, handled</h3>
                            <p className="mt-3 text-balance text-muted-foreground">The showing lands on your calendar with the buyer brief, the comps, and the confirmations already done.</p>

                            <MeetingIllustration />
                        </Card>

                        <Card className="group overflow-hidden border-transparent bg-muted/30 px-6 pt-6 shadow-none">
                            <CalendarCheck className="size-5 text-brand" />
                            <h3 className="mt-5 text-lg font-semibold text-foreground">Drafts you approve</h3>
                            <p className="mt-3 text-balance text-muted-foreground">Every reply written in your voice and queued for your tap — edit, send, or skip.</p>

                            <CodeReviewIllustration />
                        </Card>
                        <Card className="group overflow-hidden border-transparent bg-muted/30 px-6 pt-6 shadow-none">
                            <MessageCircle className="size-5 text-brand" />
                            <h3 className="mt-5 text-lg font-semibold text-foreground">Ask it anything</h3>
                            <p className="mt-3 text-balance text-muted-foreground">It knows your whole book — every deal, thread, and tour — and answers with names and numbers.</p>

                            <div className="-mx-2 -mt-2 px-2 pt-2 [mask-image:linear-gradient(to_bottom,black_50%,transparent)]">
                                <AIAssistantIllustration />
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    )
}

const MeetingIllustration = () => {
    return (
        <Card aria-hidden className="mt-9 aspect-video p-4 shadow-none">
            <div className="mb-0.5 text-sm font-semibold">Tour — 14 Oak St</div>
            <div className="mb-4 flex gap-2 text-sm">
                <span className="text-muted-foreground">Saturday, 2:00 – 2:45 PM</span>
            </div>
            <div className="mb-2 flex -space-x-1.5">
                <div className="flex -space-x-1.5">
                    {[
                        { src: MESCHAC_AVATAR, alt: 'Attendee' },
                        { src: BERNARD_AVATAR, alt: 'Attendee' },
                        { src: THEO_AVATAR, alt: 'Attendee' },
                        { src: GLODIE_AVATAR, alt: 'Attendee' },
                    ].map((avatar, index) => (
                        <div key={index} className="size-7 rounded-full border bg-background p-0.5 shadow shadow-zinc-950/5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="aspect-square rounded-full object-cover" src={avatar.src} alt={avatar.alt} height="460" width="460" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="text-sm font-medium text-muted-foreground">Brief + comps attached by Chippi</div>
        </Card>
    )
}

const CodeReviewIllustration = () => {
    return (
        <div aria-hidden className="relative mt-6">
            <Card className="aspect-video w-4/5 translate-y-4 p-3 shadow-none transition-transform duration-200 ease-in-out group-hover:-rotate-3">
                <div className="mb-3 flex items-center gap-2">
                    <div className="size-6 rounded-full border bg-background p-0.5 shadow shadow-zinc-950/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="aspect-square rounded-full object-cover" src={MESCHAC_AVATAR} alt="Realtor" height="460" width="460" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Draft for Maya</span>

                    <span className="text-xs text-muted-foreground/75">2m</span>
                </div>

                <div className="ml-8 space-y-2">
                    <div className="h-2 rounded-full bg-foreground/10"></div>
                    <div className="h-2 w-3/5 rounded-full bg-foreground/10"></div>
                    <div className="h-2 w-1/2 rounded-full bg-foreground/10"></div>
                </div>

                <Signature className="ml-8 mt-3 size-5 text-brand" />
            </Card>
            <Card className="absolute -top-4 right-0 flex aspect-[3/5] w-2/5 translate-y-4 p-2 shadow-none transition-transform duration-200 ease-in-out group-hover:rotate-3">
                <div className="m-auto flex size-10 rounded-full bg-foreground/5">
                    <Play className="m-auto size-4 fill-foreground/50 stroke-foreground/50" />
                </div>
            </Card>
        </div>
    )
}

const AIAssistantIllustration = () => {
    return (
        <Card aria-hidden className="mt-6 aspect-video translate-y-4 p-4 pb-6 shadow-none transition-transform duration-200 group-hover:translate-y-2">
            <div className="w-fit">
                <MessageCircle className="size-3.5 fill-brand/30 stroke-brand" />
                <p className="mt-2 line-clamp-2 text-sm">Which buyers should I call before the weekend, and why?</p>
            </div>
            <div className="-mx-3 -mb-3 mt-3 space-y-3 rounded-lg bg-foreground/5 p-3">
                <div className="text-sm text-muted-foreground">Ask Chippi</div>

                <div className="flex justify-between">
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" className="size-7 rounded-2xl bg-transparent shadow-none">
                            <Plus />
                        </Button>
                        <Button variant="outline" size="icon" className="size-7 rounded-2xl bg-transparent shadow-none">
                            <Globe />
                        </Button>
                    </div>

                    <Button size="icon" className="size-7 rounded-2xl">
                        <ArrowUp strokeWidth={3} />
                    </Button>
                </div>
            </div>
        </Card>
    )
}
