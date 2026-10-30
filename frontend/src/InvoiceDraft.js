import { ref, computed, watch, onMounted } from 'vue/dist/vue.esm-bundler.js'

export const InvoiceDraft = {
  props: ['api', 'path', 'navigate'],
  setup(props) {
    const emptyItem = () => ({name:'', description:'', quantity:1, unit_price:''})
    const form = ref({buyer_email:'',currency:'USD',items:[emptyItem()],note:''})
    const preview = ref(false), busy = ref(false), error = ref(''), fields = ref({}), saved = ref(null)
    const operationKey = ref(crypto.randomUUID()), retryPayload = ref(null)
    const lineCents = i => {
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(i.unit_price) || !Number.isInteger(i.quantity)) return null
      const [whole, fraction=''] = i.unit_price.split('.')
      return (BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*BigInt(i.quantity)
    }
    const money = cents => cents===null ? '—' : `${cents/100n}.${String(cents%100n).padStart(2,'0')}`
    const total = computed(()=>money(form.value.items.reduce((sum,i)=>sum+(lineCents(i)??0n),0n)))
    function validate() {
      const f = {}, v=form.value
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.buyer_email.trim()))f.buyer_email='Enter a valid buyer email.'
      v.items.forEach((i,n)=>{
        if(!i.name.trim() || i.name.trim().length>200)f[`items.${n}.name`]='Enter an item name up to 200 characters.'
        if(!Number.isInteger(i.quantity)||i.quantity<=0||i.quantity>1000000)f[`items.${n}.quantity`]='Quantity must be a whole number greater than zero (maximum 1,000,000).'
        if(lineCents(i)===null || lineCents(i)<=0n)f[`items.${n}.unit_price`]='Enter a positive price with up to two decimal places (maximum 999,999,999.99).'
        if(i.description.length>2000)f[`items.${n}.description`]='Use 2,000 characters or fewer.'
      })
      if(v.note.length>2000)f.note='Use 2,000 characters or fewer.'
      fields.value=f; return !Object.keys(f).length
    }
    function showPreview(){error.value=''; if(validate())preview.value=true}
    async function save(){
      if(busy.value)return
      if(!validate()){preview.value=false;return}
      const payload=JSON.stringify(form.value)
      if(retryPayload.value!==payload){operationKey.value=crypto.randomUUID();retryPayload.value=payload}
      busy.value=true; error.value=''
      try {
        const result=await props.api('/api/invoices',{method:'POST',headers:{'Idempotency-Key':operationKey.value},body:payload})
        saved.value=result
        await props.navigate('/seller/invoices/'+result.case_id)
      }catch(e){fields.value=e.fields||{}; if(e.status===422)preview.value=false; error.value=e.status===422?'Check the highlighted fields.':"Couldn’t save the draft. Please try again."}
      finally{busy.value=false}
    }
    async function load(){
      error.value=''; saved.value=null
      if(props.path.endsWith('/new'))return
      busy.value=true
      try{saved.value=await props.api('/api/invoices/'+encodeURIComponent(props.path.split('/').pop()))}
      catch(e){error.value=e.status===404?'Invoice not found.':e.message}
      finally{busy.value=false}
    }
    watch(()=>props.path,load); onMounted(load)
    function focusForm(){document.querySelector('#buyer-email')?.focus()}
    return {focusForm,form,preview,busy,error,fields,saved,total,lineCents,money,showPreview,save,emptyItem}
  },
  template:`<section class="invoice-panel">
    <div v-if="error" class="error" role="alert">{{error}}</div>
    <div v-if="busy" class="caption" role="status">{{path.endsWith('/new')?'Saving draft…':'Loading invoice…'}}</div>
    <template v-if="saved">
      <div class="page-heading"><div><h1>{{saved.items[0]?.name || 'Invoice'}}</h1><p>{{saved.buyer_email}} · Version {{saved.version}} · USD {{saved.total}}</p></div><span class="pill" role="status">Draft saved</span></div>
      <div class="status-strip"><span>Buyer agreement: not requested</span><span>Review: not started</span><span>PayPal delivery: no draft</span><span>Payment: none</span></div>
      <div class="saved-grid"><section class="panel"><h2>Invoice</h2><div v-for="(i,n) in saved.items" :key="n" class="invoice-line"><strong>{{i.name}}</strong><p class="preserve">{{i.description}}</p><span>{{i.quantity}} × USD {{i.unit_price}} = USD {{i.line_total}}</span></div><p class="preserve">{{saved.note}}</p><div class="total-row"><strong>Total</strong><strong>USD {{saved.total}}</strong></div><button class="secondary" @click="navigate('/seller')">Back to invoices</button></section><section class="panel"><h2>Review status</h2><div class="status-row"><span>Invoice saved</span><span class="done">Done</span></div><div class="status-row"><span>Agent review</span><span>Not started</span></div><p class="caption">Agent review is not connected yet. This invoice remains a local draft.</p><p>PayPal invoice has not been created or sent.</p></section></div>
    </template>
    <template v-else-if="path.endsWith('/new')">
      <h1>New invoice</h1><div class="invoice-grid">
      <form class="panel" @submit.prevent="save" novalidate><fieldset :disabled="busy">
        <label for="buyer-email">Buyer email</label><input id="buyer-email" type="email" v-model="form.buyer_email" placeholder="buyer@example.com" :aria-invalid="!!fields.buyer_email" aria-describedby="email-error"><p id="email-error" class="field-error" v-if="fields.buyer_email">{{fields.buyer_email}}</p>
        <h2 class="section-heading">Items</h2>
        <div v-for="(item,n) in form.items" :key="n" class="item-editor">
          <div class="item-fields"><div><label :for="'name-'+n">Item name</label><input :id="'name-'+n" v-model="item.name" :aria-invalid="!!fields['items.'+n+'.name']"><p v-if="fields['items.'+n+'.name']" class="field-error">{{fields['items.'+n+'.name']}}</p></div>
          <div><label :for="'quantity-'+n">Qty</label><input :id="'quantity-'+n" type="number" min="1" max="1000000" step="1" v-model.number="item.quantity"><p v-if="fields['items.'+n+'.quantity']" class="field-error">{{fields['items.'+n+'.quantity']}}</p></div>
          <div><label :for="'price-'+n">Unit price (USD)</label><input :id="'price-'+n" inputmode="decimal" v-model="item.unit_price" placeholder="0.00"><p v-if="fields['items.'+n+'.unit_price']" class="field-error">{{fields['items.'+n+'.unit_price']}}</p></div>
          <button class="secondary remove" type="button" :aria-label="'Remove item '+(n+1)" :disabled="form.items.length===1" @click="form.items.splice(n,1)">Remove</button></div>
          <label :for="'description-'+n">Description (optional)</label><textarea :id="'description-'+n" rows="2" v-model="item.description"></textarea><p v-if="fields['items.'+n+'.description']" class="field-error">{{fields['items.'+n+'.description']}}</p>
        </div>
        <button class="secondary add-item" type="button" :disabled="form.items.length>=100" @click="form.items.push(emptyItem())">+ Add item</button>
        <label for="invoice-note">Note to buyer (optional)</label><textarea id="invoice-note" rows="2" v-model="form.note"></textarea><p v-if="fields.note" class="field-error">{{fields.note}}</p>
        <p class="currency">Currency: <strong>USD</strong></p>
      </fieldset></form>
      <div class="preview-column"><section class="panel preview" aria-label="Invoice preview" aria-live="polite"><h2>Preview</h2><span class="pill">Draft · not sent</span><p class="preview-recipient">To {{form.buyer_email || 'buyer email'}}</p><table><thead><tr><th>Item</th><th>Qty</th><th class="align-right">Total</th></tr></thead><tbody><tr v-for="(i,n) in form.items" :key="n"><td><strong>{{i.name || 'Item name'}}</strong><p class="preserve">{{i.description}}</p></td><td>{{i.quantity}}</td><td class="align-right nowrap">USD {{money(lineCents(i))}}</td></tr></tbody></table><p v-if="form.note" class="preserve preview-note">{{form.note}}</p><div class="total-row"><strong>Total</strong><strong class="nowrap">USD {{total}}</strong></div></section>
      <div class="preview-actions"><button class="secondary" @click="focusForm" :disabled="busy">Edit</button><button @click="save" :disabled="busy">{{busy?'Saving…':'Save draft'}}</button></div><p class="caption">Preview updates as you type. Final totals are calculated by the server when you save.</p></div>
      </div>
    </template>
  </section>`
}
