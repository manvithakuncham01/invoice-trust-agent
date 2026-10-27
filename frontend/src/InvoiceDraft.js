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
    return {form,preview,busy,error,fields,saved,total,lineCents,money,showPreview,save,emptyItem}
  },
  template:`<section class="panel invoice-panel">
    <div v-if="error" class="error" role="alert">{{error}}</div>
    <div v-if="busy" role="status">{{path.endsWith('/new')?'Saving draft…':'Loading invoice…'}}</div>
    <template v-if="saved"><span class="pill" role="status">Draft saved</span><h2>Invoice · version {{saved.version}}</h2><p>{{saved.buyer_email}} · {{saved.review_status}}</p>
      <div v-for="(i,n) in saved.items" :key="n" class="invoice-line"><strong>{{i.name}}</strong><p class="preserve">{{i.description}}</p><span>{{i.quantity}} × USD {{i.unit_price}} = USD {{i.line_total}}</span></div>
      <p class="preserve">{{saved.note}}</p><h2>Total: USD {{saved.total}}</h2><p>Local draft. PayPal invoice has not been created or sent.</p><button @click="navigate('/seller')">Back to invoices</button>
    </template>
    <template v-else-if="path.endsWith('/new')">
      <h2>{{preview?'Preview invoice':'New invoice'}}</h2><p>Save a local draft before agent review. Currency: USD.</p>
      <form v-if="!preview" @submit.prevent="showPreview" novalidate>
        <fieldset :disabled="busy"><label for="buyer-email">Buyer email *</label><input id="buyer-email" type="email" v-model="form.buyer_email" :aria-invalid="!!fields.buyer_email" aria-describedby="email-error"><p id="email-error" class="field-error">{{fields.buyer_email}}</p>
        <div v-for="(item,n) in form.items" :key="n" class="item-editor"><h3>Item {{n+1}}</h3>
          <label :for="'name-'+n">Item name *</label><input :id="'name-'+n" v-model="item.name" :aria-invalid="!!fields['items.'+n+'.name']"><p class="field-error">{{fields['items.'+n+'.name']}}</p>
          <label :for="'description-'+n">Description (optional)</label><textarea :id="'description-'+n" v-model="item.description"></textarea><p class="field-error">{{fields['items.'+n+'.description']}}</p>
          <div class="form-grid"><div><label :for="'quantity-'+n">Quantity *</label><input :id="'quantity-'+n" type="number" min="1" max="1000000" step="1" v-model.number="item.quantity"><p class="field-error">{{fields['items.'+n+'.quantity']}}</p></div>
          <div><label :for="'price-'+n">Unit price (USD) *</label><input :id="'price-'+n" inputmode="decimal" v-model="item.unit_price" placeholder="200.00"><p class="field-error">{{fields['items.'+n+'.unit_price']}}</p></div></div>
          <p>Line total: USD {{money(lineCents(item))}}</p><button class="secondary" type="button" :disabled="form.items.length===1" @click="form.items.splice(n,1)">Remove item {{n+1}}</button>
        </div>
        <button class="secondary" type="button" :disabled="form.items.length>=100" @click="form.items.push(emptyItem())">Add item</button>
        <label for="invoice-note">Note to buyer (optional)</label><textarea id="invoice-note" v-model="form.note"></textarea><p class="field-error">{{fields.note}}</p>
        <h3>Total: USD {{total}}</h3><button type="submit">Preview invoice</button></fieldset>
      </form>
      <div v-else><p><strong>Buyer:</strong> {{form.buyer_email}}</p><div v-for="(i,n) in form.items" :key="n" class="invoice-line"><strong>{{i.name}}</strong><p class="preserve">{{i.description}}</p><span>{{i.quantity}} × USD {{i.unit_price}} = USD {{money(lineCents(i))}}</span></div><p class="preserve">{{form.note}}</p><h2>Total: USD {{total}}</h2><div class="inline"><button class="secondary" @click="preview=false" :disabled="busy">Edit / Back</button><button @click="save" :disabled="busy">{{busy?'Saving…':'Save draft'}}</button></div></div>
    </template>
  </section>`
}
