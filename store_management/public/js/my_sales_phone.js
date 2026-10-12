/* Phone presentation of the shared billing, reporting and assistant features. */
(() => {
  'use strict';
  const phone = () => matchMedia('(max-width:768px)').matches;
  const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value || 0));
  let ready=false;
  let latestReport=null;
  function node(tag, className, text) {const el=document.createElement(tag);el.className=className || '';if(text!==undefined)el.textContent=text;return el;}
  function updateHeaders() {
    const top=document.querySelector('.sm-top-nav');
    if (!top) return;
    const dashboard=document.querySelector('.sm-pos-app') && !['#cart','#billing-panel'].includes(location.hash);
    top.classList.toggle('phone-dashboard-header',Boolean(dashboard));
    let brand=top.querySelector('.phone-header-brand');
    if (!brand) {
      brand=node('a','phone-header-brand');brand.href='/pos';
      const img=node('img');img.src='/api/method/store_management.api.get_brand_asset?name=my-sales-logo.svg';img.alt='';
      const label=node('span');label.append(node('strong','','My Sales'),node('small','','Main Store'));
      brand.append(img,label);top.append(brand);
      const account=node('a','phone-account',(window.frappe?.session?.user || 'A').slice(0,1).toUpperCase());account.href='/more';account.setAttribute('aria-label','Account and more');top.append(account);
    }
    const title=top.querySelector('.my-sales-mobile-title');
    if (title && document.querySelector('.sm-more-app')) title.textContent='More';
    if (title && document.querySelector('.sm-assistant-app')) title.textContent='✣ MSA';
    const cart=document.querySelector('.sm-current-bill');
    if (cart && !cart.querySelector('.phone-clear-cart')) {
      const clear=node('button','phone-clear-cart','Clear All');clear.type='button';clear.addEventListener('click',()=>window.clearCart?.());cart.querySelector('.sm-current-bill-head')?.append(clear);
    }
    document.querySelector('.sm-current-bill-head h3')?.replaceChildren(`Cart (${document.getElementById('cart-count')?.textContent.replace(/\D/g,'') || '0'})`);
    const select=document.querySelector('.my-sales-period-filter select');
    if (select && brand) {
      const form=select.closest('form');
      const label=select.closest('label');
      label?.classList.add('phone-store-filter');
      if (phone() && form && label && label.parentElement===form) {
        form.style.position='static';
        label.style.position='absolute';
      } else if(label)label.style.position='';
      brand.querySelector('small').textContent=select.selectedOptions[0]?.textContent || 'Main Store';
    }
    if (document.documentElement.classList.contains('my-sales-cart-view') && title) title.textContent=`Cart (${document.getElementById('cart-count')?.textContent.replace(/\D/g,'') || '0'})`;
  }
  function renderReport(data) {
    latestReport=data;
    const panel=document.querySelector('.sm-report-panel');
    if (!panel || !['sales','open-bills'].includes(new URLSearchParams(location.search).get('type') || 'sales')) return;
    let list=document.querySelector('.phone-report-records');
    if (!list) {list=node('section','phone-report-records');list.setAttribute('aria-label','Sales records');panel.append(list);}
    const columns=data.columns || [];
    const rows=(data.result || []).map(row=>Array.isArray(row)?Object.fromEntries(columns.map((column,index)=>[column.fieldname,row[index]])):row);
    list.replaceChildren();
    document.querySelector(".sm-reports-app")?.classList.toggle("phone-has-records",Boolean(rows.length));
    document.querySelector('.sm-reports-app')?.classList.add('phone-sales-list');
    if (!rows.length) {list.append(node('p','phone-report-empty','No records for the selected dates.'));return;}
    rows.forEach(row=>{
      const invoice=row.name || row.invoice || row.sales_invoice || row.voucher_no;
      const card=node(invoice?'a':'article','phone-report-record');
      if(invoice)card.href=`/printview?doctype=Sales%20Invoice&name=${encodeURIComponent(invoice)}&format=${encodeURIComponent('My Sales Thermal Receipt')}&no_letterhead=1`;
      const heading=node('div','phone-report-record-heading');heading.append(node('strong','',invoice || 'Sales record'),node('strong','',money(row.grand_total ?? row.base_grand_total ?? row.rounded_total ?? row.total ?? 0)));
      const customer=node('div','phone-report-record-meta');customer.append(node('span','',row.customer_name || row.customer || row.party || ''),node('span','',row.mode_of_payment || row.payment_method || ''));
      const footer=node('div','phone-report-record-meta');footer.append(node('time','',[row.posting_date,row.posting_time].filter(Boolean).join(' ')));
      const status=row.status || (row.outstanding_amount!==undefined?(Number(row.outstanding_amount)>0?'Unpaid':'Paid'):'');
      if(status)footer.append(node('span','phone-report-status',status));
      card.append(heading,customer,footer);list.append(card);
    });
    document.querySelector('.sm-reports-app')?.classList.add('phone-sales-list');
  }
  function assistantHome() {
    const welcome=document.querySelector('.msa-conversation .msa-assistant');
    if (!welcome) return;
    welcome.classList.add('phone-msa-welcome');
    welcome.replaceChildren(node('strong','','👋 Hello!'),node('b',"","I’m MSA, your My Sales Assistant."),node('p','','Ask me anything: general knowledge, explanations, writing, coding, planning, or your store reports.'));
    const suggestions=document.querySelector('.msa-suggestions');
    if(suggestions)suggestions.insertAdjacentElement('beforebegin',node('p','phone-msa-try','Try asking…'));
  }
  function dialogNavigation() {
    document.querySelectorAll('.sm-checkout-drawer,.my-sales-bill-preview').forEach(layer => {
      if(layer.querySelector('.phone-dialog-nav'))return;
      const source=document.querySelector('.sm-nav-primary');
      if(!source)return;
      const nav=node('nav','phone-dialog-nav');nav.setAttribute('aria-label','Main navigation');
      nav.innerHTML=source.innerHTML;
      layer.append(nav);
    });
  }
  function initialize() {
    if(ready)return;ready=true;
    updateHeaders();assistantHome();dialogNavigation();
    const reportType=new URLSearchParams(location.search).get('type');
    if(document.querySelector('.sm-reports-app') && ['sales','open-bills'].includes(reportType)) {
      document.querySelector('.sm-reports-app').classList.add('phone-sales-list');
      if(reportType==='sales')document.querySelector('.my-sales-mobile-title')?.replaceChildren('Sales Register');
    }
    new MutationObserver(dialogNavigation).observe(document.body,{childList:true});
    const cart=document.querySelector('.sm-current-bill');
    if(cart)new MutationObserver(updateHeaders).observe(document.getElementById('cart-count'),{childList:true,characterData:true,subtree:true});
    document.querySelectorAll('.sm-payment-option').forEach(button=>button.addEventListener('click',()=>{if(phone())document.documentElement.classList.add('phone-show-payment-detail');}));
    document.querySelector('.sm-drawer-head .sm-icon-button')?.addEventListener('click',event=>{
      if(phone() && document.documentElement.classList.contains('phone-show-payment-detail')) {event.stopImmediatePropagation();event.preventDefault();document.documentElement.classList.remove('phone-show-payment-detail');}
    },true);
    document.querySelector('.sm-checkout-drawer') && new MutationObserver(()=>{
      if(!document.querySelector('.sm-checkout-drawer.open'))document.documentElement.classList.remove('phone-show-payment-detail');
    }).observe(document.querySelector('.sm-checkout-drawer'),{attributes:true,attributeFilter:['class']});
    const split=document.querySelector('.sm-payment-option[data-payment="Split"]');
    if(split){split.classList.add('phone-split-toggle');split.setAttribute('aria-label','Split Payment: Cash and Card');}
    document.querySelector('.sm-nav-item[data-doctype="Company"]')?.querySelector('strong')?.replaceChildren('Companies');
    if(latestReport)renderReport(latestReport);
    const msa=document.querySelector('.msa-conversation');
    if(msa)new MutationObserver(()=>{
      const response=msa.querySelector('.msa-metrics');
      document.querySelector('.msa-chat')?.classList.toggle('phone-msa-has-response',Boolean(response));
    }).observe(msa,{childList:true,subtree:true});
  }
  window.addEventListener('my-sales-ready',initialize);
  window.addEventListener('my-sales-dashboard-updated',updateHeaders);
  window.addEventListener('my-sales-report-data',event=>renderReport(event.detail));
  window.addEventListener('hashchange',updateHeaders);
  matchMedia('(max-width:768px)').addEventListener('change',()=>{updateHeaders();dialogNavigation();});
})();
