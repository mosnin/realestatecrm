import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.stubGlobal('React',React);
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/s/test/communication',notFound:()=>{throw new Error('Not found');},redirect:()=>{throw new Error('Redirect');}}));
vi.mock('@clerk/nextjs/server',()=>({auth:async()=>({userId:'user'})}));
vi.mock('@/lib/space',()=>({getSpaceFromSlug:async()=>({id:'space'}),getSpaceForUser:async()=>({id:'space'})}));
const mocks=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('@/lib/offers',()=>({listOffers:mocks.list}));
import {CommunicationView} from '@/app/s/[slug]/communication/communication-view';
import OffersPage from '@/app/s/[slug]/offers/page';
it('renders a concise mailbox with a connect action and honest Outlook capability',()=>{
 const html=renderToStaticMarkup(React.createElement(CommunicationView,{slug:'test',initialTab:'email',emailConnected:true,emailProvider:'outlook',messagesConnected:false}));
 expect(html).toContain('Mailbox');expect(html).toContain('reading mail here is not available yet');
});
it('renders Offers with its board and truthful aggregate counts',async()=>{
 mocks.list.mockResolvedValue([{id:'one',status:'submitted',amount:550000,buyerName:'Alex',terms:{}}]);
 const html=renderToStaticMarkup(await OffersPage({params:Promise.resolve({slug:'test'})}));
 expect(html).toContain('Offers');expect(html).toContain('Alex');expect(html).toContain('Offer volume');
});
it('does not render zero offers after a failed query',async()=>{
 mocks.list.mockRejectedValue(new Error('Unavailable'));
 await expect(OffersPage({params:Promise.resolve({slug:'test'})})).rejects.toThrow('Unavailable');
});
