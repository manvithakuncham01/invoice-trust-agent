import { createApp, ref, onMounted, computed } from 'vue/dist/vue.esm-bundler.js'
import './style.css'
import { InvoiceDraft } from './InvoiceDraft.js'

const App = {
  components: {InvoiceDraft},
  setup() {
    const config = ref(null), users = ref([]), user = ref(null), csrf = ref('')
    const loading = ref(true), busy = ref(false), error = ref(''), data = ref(null)
    const path = ref(window.location.pathname)
    const selected = ref('seller-a')
    const known = ['/','/seller','/reviewer','/buyer']
    const requiredRole = computed(() => path.value.startsWith('/seller/invoices/') ? 'SELLER' : ({ '/seller':'SELLER', '/reviewer':'REVIEWER', '/buyer':'BUYER' }[path.value]))
    const knownPath = computed(() => known.includes(path.value) || /^\/seller\/invoices\/(new|[0-9a-f-]{36})$/.test(path.value))
    const forbidden = computed(() => user.value && requiredRole.value && user.value.role !== requiredRole.value)
    async function api(url, options = {}) {
      const response = await fetch(url, { credentials:'same-origin', ...options,
        headers:{ 'Content-Type':'application/json', ...(csrf.value ? {'X-CSRF-Token':csrf.value}:{}), ...options.headers } })
      const result = response.status === 204 ? null : await response.json()
      if (!response.ok) {
        const err = new Error(result?.error?.message || 'Request failed. Please retry.')
        err.status = response.status; err.fields=result?.error?.fields; throw err
      }
      return result
    }
    async function loadWorkspace() {
      data.value = null
      if (!user.value || forbidden.value || !requiredRole.value || path.value.startsWith('/seller/invoices/')) return
      data.value = await api('/api'+path.value+'/workspace')
    }
    async function navigate(next) {
      path.value=next; history.pushState({},'',next); error.value=''; busy.value=true
      try { await loadWorkspace() } catch(e) { error.value=e.message } finally { busy.value=false }
    }
    window.addEventListener('popstate', async()=>{ path.value=window.location.pathname; try{await loadWorkspace()}catch(e){error.value=e.message} })
    async function signIn() {
      busy.value=true; error.value=''
      try {
        const result=await api('/api/demo/session',{method:'POST',body:JSON.stringify({demo_user_id:selected.value})})
        user.value=result.user; csrf.value=result.csrf_token
        await navigate('/'+user.value.role.toLowerCase())
      } catch(e) { error.value=e.message } finally { busy.value=false }
    }
    async function logout() {
      busy.value=true
      try { await api('/api/auth/logout',{method:'POST'}); user.value=null; csrf.value=''; await navigate('/') }
      catch(e){error.value=e.message}finally{busy.value=false}
    }
    async function initialize() {
      loading.value=true;error.value=''
      try {
        config.value=await api('/api/config')
        if(config.value.demo_mode) users.value=(await api('/api/demo/users')).users
        try {const s=await api('/api/auth/session');user.value=s.user;csrf.value=s.csrf_token}
        catch(e){if(e.status!==401)throw e}
        await loadWorkspace()
      } catch(e){error.value='Backend is unavailable or setup is incomplete. Start FastAPI, run migrations and seed the demo, then retry.'}
      finally {loading.value=false}
    }
    onMounted(initialize)
    return {config,users,user,loading,busy,error,data,path,selected,known,forbidden,requiredRole,navigate,signIn,logout,initialize,api,knownPath}
  },
  template: `
  <div class="layout">
    <aside>
      <a class="brand" href="/" @click.prevent="navigate('/')"><span class="mark">IT</span><span>Invoice<br><strong>Trust Agent</strong></span></a>
      <div v-if="config?.demo_mode" class="demo">LOCAL DEMO</div>
      <nav aria-label="Main navigation">
        <a href="/" @click.prevent="navigate('/')" :class="{active:path==='/'}">Overview</a>
        <a v-if="user?.role==='SELLER'" href="/seller" @click.prevent="navigate('/seller')" :class="{active:path==='/seller'}">Seller workspace</a>
        <a v-if="user?.role==='REVIEWER'" href="/reviewer" @click.prevent="navigate('/reviewer')" :class="{active:path==='/reviewer'}">Review queue</a>
        <a v-if="user?.role==='BUYER'" href="/buyer" @click.prevent="navigate('/buyer')" :class="{active:path==='/buyer'}">Buyer review</a>
      </nav>
      <p class="aside-note">Review before sending.<br>Pay through PayPal.</p>
    </aside>
    <main>
      <header><div><span class="eyebrow">INVOICE DRAFTS · ITA-03</span><h1>{{ path==='/seller'?'Seller workspace':path==='/reviewer'?'Review queue':path==='/buyer'?'Buyer review':'A clearer path to trusted invoices' }}</h1></div><button v-if="user" class="secondary" @click="logout" :disabled="busy">Sign out</button></header>
      <div v-if="loading" class="panel" role="status">Connecting to your local backend…</div>
      <div v-if="error" class="error" role="alert">{{error}} <button @click="initialize">Retry connection</button></div>
      <template v-if="!loading">
        <section v-if="config?.demo_mode" class="session panel">
          <div><h2>Explore a demo role</h2><p>Switch between seeded test identities. This is local demo access, not PayPal login or buyer email verification.</p></div>
          <form @submit.prevent="signIn"><label for="identity">Demo identity</label><div class="inline"><select id="identity" v-model="selected" :disabled="busy"><option v-for="u in users" :key="u.id" :value="u.id">{{u.display_name}}</option></select><button :disabled="busy">{{busy?'Loading…':'Open workspace'}}</button></div></form>
        </section>
        <p v-if="user" class="identity">Signed in as <strong>{{user.display_name}}</strong> · {{user.role}}</p>
        <section v-if="!knownPath" class="panel"><h2>Page not found</h2><p>This route is not part of the starter app.</p><button @click="navigate('/')">Back to overview</button></section>
        <section v-else-if="forbidden" class="panel"><h2>Access denied</h2><p>This workspace is unavailable to your current role. Backend endpoints enforce this restriction too.</p></section>
        <section v-else-if="requiredRole && !user" class="panel"><h2>Sign in to continue</h2><p v-if="config?.demo_mode">Choose a demo identity above to open this workspace.</p><p v-else>Demo access is disabled. Production sign-in is outside this foundation story.</p></section>
        <InvoiceDraft v-else-if="path.startsWith('/seller/invoices/')" :key="user.id+path" :api="api" :path="path" :navigate="navigate" />
        <section v-else-if="path==='/seller' && data" class="panel"><h2>Your invoices</h2><button @click="navigate('/seller/invoices/new')">New invoice</button><p v-if="!data.invoices.length">No invoices yet. Create your first local draft.</p><div v-for="i in data.invoices" :key="i.case_id" class="invoice-line"><strong>{{i.buyer_email}}</strong><p>USD {{i.total}} · {{i.review_status}}</p><button class="secondary" @click="navigate('/seller/invoices/'+i.case_id)">Open draft</button></div></section>
        <section v-else-if="path==='/reviewer' && data" class="panel empty"><div class="empty-icon">✓</div><h2>No cases to review</h2><p>The reviewer queue and decisions are planned in ITA-11 and ITA-12.</p></section>
        <section v-else-if="path==='/buyer' && data" class="panel empty"><h2>Buyer shell only</h2><p>Private case links and email verification will be built in ITA-09. This demo role does not prove buyer agreement.</p></section>
        <section v-else-if="path==='/'" class="overview"><div class="hero panel"><span class="pill">STARTER PROJECT</span><h2>Build the review.<br>Keep sending under control.</h2><p>Prepare and save seller-owned invoice drafts with exact totals. Agent conversations and PayPal integration come in later stories.</p><div class="tags"><span>Python / FastAPI</span><span>Vue / JavaScript</span><span>Local database</span></div></div><div class="cards"><article class="panel"><h3>Seller</h3><p>Prepare invoices and answer the assistant’s questions.</p><span>Drafts available · Agent review next</span></article><article class="panel"><h3>Buyer</h3><p>Review exact proposed terms before the invoice is sent.</p><span>Planned · ITA-09 / 10</span></article><article class="panel"><h3>Reviewer</h3><p>Resolve concerns with evidence and cited guidance.</p><span>Planned · ITA-11 / 12</span></article></div></section>
      </template>
      <footer>Draft preparation · Fake agent adapter · Local drafts · No PayPal calls or real payments</footer>
    </main>
  </div>`
}
createApp(App).mount('#app')
