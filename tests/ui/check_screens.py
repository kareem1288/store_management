import sys,json,time,threading,subprocess,urllib.request,base64,re,os
from pathlib import Path
from http.server import HTTPServer,BaseHTTPRequestHandler
from types import SimpleNamespace
import jinja2
from websockets.sync.client import connect
ROOT=Path(__file__).resolve().parents[2]
items=[dict(name=f'ITM-{i}',item_name=name,item_group='Grocery',standard_rate=45+i*5,stock_uom='kg',image='') for i,name in enumerate(['Sugar','Rice','Wheat Flour','Oil','Dal','Tea','Coffee','Milk','Bread','Biscuits','Eggs','Tomato'])]
rows=[dict(date=f'2026-10-{i:02}',sales=i*50,total=i*50,profit=i*30,orders=2) for i in range(1,8)]
period=dict(start='2026-10-01',end='2026-10-07',month=10,year=2026)
summary=dict(today_sales=1250,today_bills=14,weekly_sales=9450,period_sales=3800,period_bills=14,period_items_sold=63,active_customers=2,period_expenses=1200,period=period,weekly_trend=rows,stores=['Main Store'],sales_by_store=[dict(label='Main Store',value=1950),dict(label='Branch Store',value=1150)],top_items=[dict(item_name='Sugar',sold=17,revenue=765)],recent_bills=[],current_summaries=dict(week=dict(start='2026-10-05',end='2026-10-11',rows=rows,sales=1250,active_days=3,average_bill_value=125),month=dict(start='2026-10-01',end='2026-10-31',rows=rows,sales=3800,expenses=1200,orders=14,profit=2600)))
bootstrap=dict(items=items,summary=summary,categories=[dict(name='Grocery',color='#00994f')],shop_name='Main Store',default_customer='Walk-in Customer')
MOCK='''<script>
window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message));window.addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
window.__=s=>s;localStorage.setItem('my-sales-ui-version','20261007-5');
window.frappe={session:{user:'cashier@example.com'},csrf_token:'test',boot:{lang:'en'},utils:{},ready:fn=>{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();},msgprint:m=>{window.__message=m;},show_alert:()=>{},call:async opts=>{const method=opts.method;let message=[];if(method.includes('get_pos_bootstrap'))message=BOOTSTRAP;else if(method.includes('get_dashboard_summary'))message=BOOTSTRAP.summary;else if(method.includes('get_master_records'))message=BOOTSTRAP.items;else if(method.includes('create_pos_bill'))message={name:'TEST-INVOICE',payment_entry:'TEST-PAYMENT'};else if(method.includes('assistant.ask'))message={text:'Sales summary',metrics:{Sales:'₹1,250.00',Bills:14}};else if(method.includes('query_report.run'))message={columns:[],result:[]};const res={message};opts.callback?.(res);opts.always?.();return res;}};
</script>'''.replace('BOOTSTRAP',json.dumps(bootstrap))
parent='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+MOCK+'{% block head_include %}{% endblock %}</head><body>{% block page_content %}{% endblock %}{% block script %}{% endblock %}</body></html>'
env=jinja2.Environment(loader=jinja2.ChoiceLoader([jinja2.DictLoader({'templates/web.html':parent}),jinja2.FileSystemLoader(str(ROOT/'store_management/www'))]))
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=self.path.split('?')[0]
  if path.startswith('/assets/store_management/'):
   target=ROOT/'store_management/public'/path.split('/assets/store_management/')[1]
   if target.exists():data=target.read_bytes();ctype='text/css' if target.suffix=='.css' else 'text/javascript'
   else:data=b'';ctype='text/plain'
  elif path.startswith('/api/'):
   data=b'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="15" fill="green"/></svg>';ctype='image/svg+xml'
  else:
   page=path.strip('/') or 'pos'
   try:data=env.get_template(page+'/index.html').render(frappe=SimpleNamespace(session=SimpleNamespace(user='cashier@example.com')),pos_bootstrap_json=json.dumps(bootstrap),configured_reports_json='[]',default_company='Main Store',insights_dashboards=[],insights_dashboard_url='').encode();ctype='text/html'
   except Exception as exc:data=str(exc).encode();ctype='text/plain'
  self.send_response(200);self.send_header('Content-Type',ctype+'; charset=utf-8');self.end_headers();self.wfile.write(data)
server=HTTPServer(('127.0.0.1',8876),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
chrome=subprocess.Popen([os.environ.get('MY_SALES_TEST_CHROME', str(Path.home()/'.cache/ms-playwright/chromium-1208/chrome-linux64/chrome')),'--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=9336','--user-data-dir=/tmp/my-sales-reference-browser','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(50):
  try:pages=json.load(urllib.request.urlopen('http://127.0.0.1:9336/json'));break
  except Exception:time.sleep(.1)
 ws=connect(pages[0]['webSocketDebuggerUrl'],max_size=20_000_000)
 seq=0
 def cmd(method,params={}):
  global seq
  seq+=1;ws.send(json.dumps(dict(id=seq,method=method,params=params)))
  while True:
   msg=json.loads(ws.recv())
   if msg.get('id')==seq:
    if 'error' in msg:raise RuntimeError(msg['error'])
    return msg.get('result',{})
 def evaluate(code):
  res=cmd('Runtime.evaluate',dict(expression=code,returnByValue=True,awaitPromise=True))
  if 'exceptionDetails' in res:raise RuntimeError(res['exceptionDetails'])
  return res['result'].get('value')
 cmd('Page.enable');cmd('Runtime.enable')
 results=[]
 check="""(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';const bad=[...document.querySelectorAll('.sm-top-nav,.my-sales-kpis,.my-sales-dashboard-grid,.sm-pos-browser,.sm-current-bill,.sm-checkout-drawer.open,.sm-masters-modal.open,.my-sales-bill-preview:not([hidden]),.my-sales-mobile-nav-open .my-sales-mobile-drawer,.msa-shell')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left < -1||r.right>innerWidth+1}).map(e=>e.className);return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,bad,errors:__errors}})()"""
 for width,height in [(320,720),(390,844),(768,1024),(844,390),(1440,1024)]:
  cmd('Emulation.setDeviceMetricsOverride',dict(width=width,height=height,deviceScaleFactor=1,mobile=width<=768))
  for route in ['/pos','/pos#billing-panel','/masters?doctype=Item','/reports?type=sales','/assistant','/store-login','/store-signup']:
   cmd('Page.navigate',dict(url='http://127.0.0.1:8876'+route));time.sleep(.25)
   results.append(dict(route=route,**evaluate(check)))
   if route=='/pos' and width<=768:
    evaluate("document.querySelector('.my-sales-more').click()");time.sleep(.05);results.append(dict(route='mobile-navigation',**evaluate(check)));evaluate("document.querySelector('.my-sales-mobile-overlay').click()")
   if route=='/pos#billing-panel':
    evaluate("addToCartByCode('ITM-0');location.hash='cart'");time.sleep(.05);results.append(dict(route='cart',**evaluate(check)))
    evaluate('openCheckout()');time.sleep(.05);results.append(dict(route='payment',**evaluate(check)))
    for mode in ['UPI','Card','Split','Cash']:
     evaluate(f"selectPayment('{mode}')");results.append(dict(route='payment-'+mode,**evaluate(check)))
    evaluate("selectPayment('Split');if(validateSelectedPayment())throw new Error('Empty split accepted');document.getElementById('split-cash').value='20';document.getElementById('split-card').value=String(smPosState.summary.total-20);if(!validateSelectedPayment())throw new Error('Valid split rejected');selectPayment('Cash');document.getElementById('cash-received').value='500';generateBill()");time.sleep(.05);results.append(dict(route='receipt-success',**evaluate(check)))
    evaluate('previewGeneratedBill()');time.sleep(.05);results.append(dict(route='invoice-preview',**evaluate(check)))
    evaluate("if(!document.querySelector('.sm-checkout-drawer').inert)throw new Error('Checkout interactive behind preview');document.querySelector('.my-sales-bill-preview [data-close]').click()");time.sleep(.05)
    evaluate("if(document.querySelector('.sm-checkout-drawer').inert)throw new Error('Checkout stayed inert after preview closed')")
   if route=='/masters?doctype=Item':
    evaluate('openCreateForm()');time.sleep(.05);results.append(dict(route='master-editor',**evaluate(check)))
   if route=='/assistant':
    evaluate("document.querySelector('[data-msa-question]').click()");time.sleep(.1);results.append(dict(route='assistant-response',**evaluate(check)))
   if width==390 and route in ['/pos','/pos#billing-panel','/assistant']:
    screenshot=cmd('Page.captureScreenshot',dict(format='png'));Path('/tmp/reference-'+route.split('?')[0].replace('/','').replace('#','-')+'.png').write_bytes(base64.b64decode(screenshot['data']))
 # Resize an existing cart across the desktop/mobile boundary without navigation.
 cmd('Emulation.setDeviceMetricsOverride',dict(width=1440,height=1024,deviceScaleFactor=1,mobile=False))
 cmd('Page.navigate',dict(url='http://127.0.0.1:8876/pos#billing-panel'));time.sleep(.3)
 evaluate("addToCartByCode('ITM-0')")
 for width,height in [(390,844),(1440,1024),(320,720)]:
  cmd('Emulation.setDeviceMetricsOverride',dict(width=width,height=height,deviceScaleFactor=1,mobile=width<=768));time.sleep(.15)
  evaluate("if(smPosState.cart.length!==1)throw new Error('Cart lost during resize');if(innerWidth<=768){const nav=document.querySelector('.sm-nav-primary');if(!nav||getComputedStyle(nav).display==='none'||Math.abs(nav.getBoundingClientRect().bottom-innerHeight)>1)throw new Error('Bottom navigation missing after resize');}")
  results.append(dict(route='resize-cart',**evaluate(check)))
 failures=[r for r in results if r['overflow'] or r['bad'] or r['errors']]
 Path('/tmp/my-sales-layout-results.json').write_text(json.dumps(results,indent=2))
 print(json.dumps(dict(scenarios=len(results),failures=failures),indent=2))
 assert not failures, 'Responsive scenario failures; see /tmp/my-sales-layout-results.json'
finally:
 chrome.terminate();server.shutdown()
