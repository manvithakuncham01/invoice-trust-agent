import {JSDOM} from 'jsdom'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173/'})
for(const key of ['window','document','Document','Element','HTMLElement','SVGElement','Node','Event','MouseEvent','history'])globalThis[key]=dom.window[key]
const seller={id:'seller-a',role:'SELLER',display_name:'Maya · seller A'}
globalThis.fetch=async url=>({ok:true,status:200,json:async()=>({
 '/api/config':{demo_mode:true},'/api/demo/users':{users:[seller]},
 '/api/auth/session':{user:seller,csrf_token:'test'},
 '/api/seller/workspace':{invoices:[{case_id:'a'.repeat(36),buyer_email:'b@example.com',total:'200.00'}]}
}[url])})
test('restored seller session lands on invoice list with compact account menu',async()=>{
 let source=readFileSync('src/main.js','utf8').replace("import './style.css'",'').replace("import { InvoiceDraft } from './InvoiceDraft.js'","const InvoiceDraft={template:'<div>Invoice form</div>'}")
 source=source.replace("from 'vue/dist/vue.esm-bundler.js'",`from '${new URL('../node_modules/vue/dist/vue.esm-bundler.js',import.meta.url).href}'`)
 await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
 await new Promise(r=>setTimeout(r,40))
 assert.equal(window.location.pathname,'/seller');assert.equal(document.querySelector('h1').textContent,'Invoices')
 assert.match(document.querySelector('table').textContent,/b@example.com/)
 assert.equal(document.querySelector('aside'),null);assert.doesNotMatch(document.body.textContent,/Explore a demo role|STARTER PROJECT|ITA-03|Python \/ FastAPI/)
 assert.equal(document.querySelector('.account details').open,false)
})
