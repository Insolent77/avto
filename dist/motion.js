const svg=body=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icons={
 arrow:svg('<path d="M5 19 19 5M5 5h14v14"/>'),
 clock:svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
 check:svg('<path d="m5 12 4 4L19 6"/>'),
 sparkle:svg('<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>'),
 garage:svg('<path d="M3 21V7l9-4 9 4v14M7 21V10h10v11M7 14h10M7 18h10"/>'),
 tag:svg('<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/>'),
 wash:svg('<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>'),
 interior:svg('<path d="M6 3h5a3 3 0 0 1 3 3v6h3a3 3 0 0 1 3 3v3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2ZM7 18v3m10-3v3M4 12h10"/>'),
 polish:svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m18 2 1.2 2.8L22 6l-2.8 1.2L18 10l-1.2-2.8L14 6l2.8-1.2Z"/>'),
 ceramic:svg('<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>')
};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let revealObserver;
export function animateView(){
 const view=document.querySelector('#view');revealObserver?.disconnect();
 if(reduced.matches)return;
 view.getAnimations().forEach(a=>a.cancel());
 view.animate([{opacity:.3,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
 revealObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');revealObserver.unobserve(e.target);}}),{threshold:.08});
 view.querySelectorAll('.reveal').forEach(el=>{el.classList.add('reveal-ready');revealObserver.observe(el);});
}
export function animateStep(host){
 const shouldFocus=['step-next','step-back'].includes(document.activeElement?.id);
 requestAnimationFrame(()=>{
 if(!reduced.matches){host.getAnimations().forEach(a=>a.cancel());host.animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'});}
 if(shouldFocus){const heading=host.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
 });
}
export function updateNavigation(view){const nav=document.querySelector('.bottom-nav');const index=['home','services','bookings'].indexOf(view);nav.style.setProperty('--nav-index',Math.max(0,index));nav.classList.toggle('no-selection',index<0);}
export function updateProgress(step){document.querySelectorAll('.booking-progress span').forEach((el,i)=>{el.classList.toggle('current',i===step);el.classList.toggle('complete',i<step);if(i===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});}
export async function closeSheet(dialog){if(!dialog.open||dialog.dataset.closing)return;dialog.dataset.closing='true';if(!reduced.matches){await dialog.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(18px)'}],{duration:150,easing:'ease-in'}).finished.catch(()=>{});}dialog.close();delete dialog.dataset.closing;}
export function setupMotion(){
 reduced.addEventListener('change',()=>{if(reduced.matches){document.getAnimations().forEach(a=>a.cancel());document.querySelectorAll('.reveal-ready').forEach(el=>el.classList.add('is-visible'));}});
 document.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&!button.disabled&&!reduced.matches){button.animate([{scale:'1'},{scale:'.97'},{scale:'1'}],{duration:220,easing:'ease-out'});}});
}
