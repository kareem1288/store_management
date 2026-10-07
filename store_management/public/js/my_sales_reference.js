(() => {
  'use strict';
  const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'}).format(Number(value || 0));
  let initialized = false;
  function arrangeDashboard() {
    const kpis = document.querySelector('.my-sales-kpis');
    if (!kpis || kpis.querySelector('.ms-reference-target')) return;
    [['green','ms-reference-target'],['purple','ms-reference-week']].forEach(([tone, name]) => {
      const footer = kpis.querySelector(`[data-tone="${tone}"] footer`);
      if (!footer) return;
      const card = document.createElement('article');
      card.className = name;
      card.appendChild(footer);
      kpis.appendChild(card);
    });
  }
  function setupLayers() {
    const layers = [...document.querySelectorAll('.sm-checkout-drawer,.sm-payment-result,.sm-masters-modal,.my-sales-bill-preview,.sm-scan-modal')];
    let active = null;
    let previousFocus = null;
    function sync() {
      const next = [...layers].reverse().find(layer => layer.matches('.open') || (layer.matches('.my-sales-bill-preview') && !layer.hidden));
      if (next === active) return;
      if (active) active.removeAttribute('aria-modal');
      if (next) {
        previousFocus = document.activeElement;
        next.setAttribute('role','dialog');
        next.setAttribute('aria-modal','true');
        requestAnimationFrame(() => next.querySelector('button,input,[tabindex="0"]')?.focus());
      } else if (previousFocus?.isConnected) previousFocus.focus();
      active = next;
      layers.forEach(layer => { layer.inert = Boolean(active) && layer !== active && !layer.contains(active); });
      document.querySelectorAll(".sm-drawer-head,.sm-checkout-content,.sm-drawer-footer").forEach(el => { el.inert = Boolean(active?.matches(".sm-payment-result")); });
      document.body.classList.toggle('ms-layer-open', Boolean(active));
      document.querySelectorAll('.sm-top-nav,.sm-page-shell,.sm-masters-shell,.my-sales-desktop-sidebar,.sm-nav-primary').forEach(el => { el.inert = Boolean(active) && !el.contains(active); });
    }
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.my-sales-bill-preview').forEach(layer => { if (!layers.includes(layer)) { layers.push(layer); observer.observe(layer,{attributes:true,attributeFilter:['hidden','class']}); } });
      sync();
    });
    layers.forEach(layer => observer.observe(layer,{attributes:true,attributeFilter:['class','hidden']}));
    observer.observe(document.body,{childList:true});
    document.addEventListener('keydown', event => {
      if (!active) return;
      if (event.key === 'Escape') {
        if (active.matches('.sm-masters-modal')) window.closeModal?.();
        else if (active.matches('.sm-checkout-drawer')) window.closeCheckout?.();
        else if (active.matches('.my-sales-bill-preview')) active.querySelector('[data-close]')?.click();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...active.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
    });
  }
  function setupAssistant() {
    const form = document.getElementById('msa-form');
    if (!form) return;
    const conversation = document.getElementById('msa-conversation');
    const input = document.getElementById('msa-question');
    const history = document.getElementById('msa-history');
    const welcome = conversation.innerHTML;
    const append = (text, role) => {
      const bubble = document.createElement('article');bubble.className = `msa-message msa-${role}`;bubble.textContent = text;conversation.appendChild(bubble);conversation.scrollTop=conversation.scrollHeight;return bubble;
    };
    async function ask(question) {
      if (!question || form.dataset.busy) return;
      form.dataset.busy='1';input.value='';form.querySelector('button[type="submit"]').disabled=true;
      append(question,'user');
      const reply=append('Loading your store data…','assistant');
      try {
        const response=await frappe.call({method:'store_management.assistant.ask',args:{question}});
        reply.textContent=response.message.text;
        const row=document.createElement('button');row.type='button';row.textContent=question;row.addEventListener('click',()=>ask(question));history.prepend(row);
        const data=response.message.metrics;
        if (data) {
          const metrics=document.createElement('div');metrics.className='msa-metrics';
          Object.entries(data).forEach(([label,value])=>{const item=document.createElement('div');const title=document.createElement('small');title.textContent=label;const amount=document.createElement('strong');amount.textContent=typeof value==='number'?String(value):value;item.append(title,amount);metrics.append(item);});reply.append(metrics);
        }
      } catch (_) {reply.textContent='Could not load the data. Check your connection and access permissions, then try again.';}
      finally {delete form.dataset.busy;form.querySelector('button[type="submit"]').disabled=false;conversation.scrollTop=conversation.scrollHeight;}
    }
    form.addEventListener('submit',e=>{e.preventDefault();ask(input.value.trim());});
    document.querySelectorAll('[data-msa-question]').forEach(button=>button.addEventListener('click',()=>ask(button.dataset.msaQuestion)));
    document.getElementById('msa-new-chat').addEventListener('click',()=>{if(form.dataset.busy)return;conversation.innerHTML=welcome;history.replaceChildren();input.value='';input.focus();});
  }
  function initialize() {
    if (initialized) return;
    initialized=true;arrangeDashboard();setupLayers();setupAssistant();
    document.querySelector('.sm-pos-app')?.classList.add('ms-reference-pos');
    if (document.querySelector('.sm-assistant-app')) {
      document.querySelector('.my-sales-desktop-title strong')?.replaceChildren('MSA');
      document.querySelector('.my-sales-desktop-sidebar nav > a')?.classList.remove('active');
      document.querySelector('.my-sales-msa-link')?.classList.add('active');
    }
    document.querySelector('.sm-current-bill-head h3')?.replaceChildren('Cart');
    document.querySelector('.sm-search-box input')?.setAttribute('placeholder','Search item by name, code or scan barcode…');
  }
  window.addEventListener('my-sales-ready',initialize);
  window.addEventListener('my-sales-dashboard-updated',arrangeDashboard);
  document.addEventListener('DOMContentLoaded',()=>{if(!document.querySelector('.sm-page-app'))initialize();});
})();
