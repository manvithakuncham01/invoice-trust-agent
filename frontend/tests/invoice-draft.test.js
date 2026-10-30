import { JSDOM } from 'jsdom'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173'})
for(const key of ['window','document','Document','Element','HTMLElement','SVGElement','Node','Event','MouseEvent'])globalThis[key]=dom.window[key]
const {createApp,nextTick}=await import('vue/dist/vue.esm-bundler.js')
const {InvoiceDraft}=await import('../src/InvoiceDraft.js')
const tick=async()=>{await nextTick();await new Promise(r=>setTimeout(r,0))}
function mount(api=async()=>({}),path='/seller/invoices/new',navigate=()=>{}){
  const app=createApp(InvoiceDraft,{api,path,navigate});const vm=app.mount('#app');return {vm,app}
}
function input(selector,value){const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}
function valid(){input('#buyer-email','buyer@example.com');input('#name-0','Website design');input('#quantity-0','1');input('#price-0','200.00')}

test('side-by-side preview updates, validates, saves, and navigates',async()=>{
 let request,route;const {app}=mount(async(url,o)=>{request={url,...o};return {case_id:'case-1',version:1,items:[],total:'200.00'}},undefined,p=>{route=p})
 const button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t)
 button('Save draft').click();await tick();assert.match(document.body.textContent,/Enter a valid buyer email/);assert.equal(request,undefined)
 valid();await tick();assert.match(document.querySelector('[aria-label="Invoice preview"]').textContent,/Website design/);assert.match(document.querySelector('[aria-label="Invoice preview"]').textContent,/USD 200.00/)
 button('Edit').click();assert.equal(document.activeElement.id,'buyer-email');assert.equal(document.querySelector('#price-0').value,'200.00')
 input('#price-0','250.00');await tick();assert.match(document.querySelector('[aria-label="Invoice preview"]').textContent,/USD 250.00/)
 button('Save draft').click();await tick()
 assert.equal(request.url,'/api/invoices');assert.equal(JSON.parse(request.body).items[0].unit_price,'250.00');assert.ok(request.headers['Idempotency-Key']);assert.equal(route,'/seller/invoices/case-1');app.unmount()
})
test('network failure preserves input and reuses save key',async()=>{
 const keys=[];const {vm,app}=mount(async(url,o)=>{keys.push(o.headers['Idempotency-Key']);throw new Error('network')});valid();await tick();vm.showPreview();await vm.save();assert.match(document.body.textContent,/Couldn’t save/);await vm.save();assert.equal(keys[0],keys[1]);vm.preview=false;await tick();assert.equal(document.querySelector('#buyer-email').value,'buyer@example.com');app.unmount()
})
test('exact arithmetic, item controls, and escaped seller content',async()=>{
 const {vm,app}=mount();vm.form.items=[{name:'<img src=x onerror=alert(1)>',description:'',quantity:3,unit_price:'0.10'},{name:'B',description:'',quantity:1,unit_price:'0.20'}];vm.form.buyer_email='b@example.com';await tick();assert.equal(vm.total,'0.50');vm.showPreview();await tick();assert.equal(document.querySelector('img'),null);assert.match(document.body.textContent,/<img src=x/);app.unmount()
})
test('saved invoice reloads and renders the canonical server values',async()=>{
 const {app}=mount(async()=>({version:1,buyer_email:'buyer@example.com',review_status:'DRAFT',items:[{name:'Design',description:'',quantity:1,unit_price:'200.00',line_total:'200.00'}],total:'200.00'}),'/seller/invoices/case-1');await tick();assert.match(document.body.textContent,/Draft saved/);assert.match(document.body.textContent,/PayPal invoice has not been created or sent/);app.unmount()
})
