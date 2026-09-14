// Legacy entry point retained for compatibility. All shared interactions live in site.js.
if (!document.querySelector('script[src*="site.js"]')) {
 const script=document.createElement("script");script.src="/site.js?v=4.1";document.body.appendChild(script);
}
