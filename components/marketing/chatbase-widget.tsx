'use client';

/**
 * ChatbaseWidget — injects the Chatbase chat bubble on the logged-out
 * (marketing) site. Mounted once in app/(marketing)/layout.tsx so every
 * public page gets it; the widget renders its own launcher in the
 * bottom-right corner (Chatbase's default placement).
 *
 * The inline snippet is Chatbase's official embed verbatim (agent id
 * Gp8m1A7-Uc-3rpFX-OfPf): a command-queue proxy stub so `window.chatbase(…)`
 * calls made before embed.min.js loads are replayed after, then the loader
 * appended on window load. Same next/script idiom as FprScript above it in
 * the layout.
 *
 * Public agent id only — no secrets.
 */

import Script from 'next/script';

const CHATBASE_SNIPPET = `
(function(){if(!window.chatbase||window.chatbase("getState")!=="initialized"){window.chatbase=(...arguments)=>{if(!window.chatbase.q){window.chatbase.q=[]}window.chatbase.q.push(arguments)};window.chatbase=new Proxy(window.chatbase,{get(target,prop){if(prop==="q"){return target.q}return(...args)=>target(prop,...args)}})}const onLoad=function(){const script=document.createElement("script");script.src="https://www.chatbase.co/embed.min.js";script.id="Gp8m1A7-Uc-3rpFX-OfPf";script.domain="www.chatbase.co";document.body.appendChild(script)};if(document.readyState==="complete"){onLoad()}else{window.addEventListener("load",onLoad)}})();
`;

export function ChatbaseWidget() {
  return (
    <Script
      id="chatbase-embed"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: CHATBASE_SNIPPET }}
    />
  );
}
