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
      if(next==='/' && user.value)next='/'+user.value.role.toLowerCase()
      path.value=next; history.pushState({},'',next); error.value=''; busy.value=true
      try { await loadWorkspace() } catch(e) { error.value=e.message } finally { busy.value=false }
    }
    window.addEventListener('popstate', async()=>{ path.value=window.location.pathname; try{await loadWorkspace()}catch(e){error.value=e.message} })
    async function signIn() {
      busy.value=true; error.value=''
      try {
        const result=await api('/api/demo/session',{method:'POST',body:JSON.stringify({demo_user_id:selected.value})})
        user.value=result.user; csrf.value=result.csrf_token; selected.value=result.user.id
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
        try {const s=await api('/api/auth/session');user.value=s.user;csrf.value=s.csrf_token;selected.value=s.user.id}
        catch(e){if(e.status!==401)throw e}
        if(user.value && path.value==='/'){path.value='/'+user.value.role.toLowerCase();history.replaceState({},'',path.value)}
        await loadWorkspace()
      } catch(e){error.value='Backend is unavailable or setup is incomplete. Start FastAPI, run migrations and seed the demo, then retry.'}
      finally {loading.value=false}
    }
    onMounted(initialize)
    return {config,users,user,loading,busy,error,data,path,selected,known,forbidden,requiredRole,navigate,signIn,logout,initialize,api,knownPath}
  },
  template: `
  <div>
    <header class="topbar">
      <a class="brand" href="/seller" @click.prevent="navigate(user ? '/'+user.role.toLowerCase() : '/')">Invoice Trust Agent</a>
      <nav aria-label="Main navigation" v-if="user?.role==='SELLER'"><a href="/seller" @click.prevent="navigate('/seller')" :class="{active:path==='/seller'}">Invoices</a><a href="/seller/invoices/new" @click.prevent="navigate('/seller/invoices/new')" :class="{active:path.endsWith('/new')}">New invoice</a></nav>
      <nav v-else-if="user?.role==='REVIEWER'"><a href="/reviewer" @click.prevent="navigate('/reviewer')">Queue</a></nav>
      <div class="account" v-if="user"><details><summary>{{config?.demo_mode?'Demo · ':''}}{{user.id}}</summary><div class="account-menu"><p>{{user.display_name}}</p><form v-if="config?.demo_mode" @submit.prevent="signIn"><label for="switch-identity">Switch demo account</label><select id="switch-identity" v-model="selected" :disabled="busy"><option v-for="u in users" :key="u.id" :value="u.id">{{u.display_name}}</option></select><button :disabled="busy">Switch account</button></form><button class="secondary" @click="logout" :disabled="busy">Sign out</button></div></details></div>
    </header>
    <main>
      <div v-if="loading" class="panel" role="status">Loading your workspace…</div>
      <div v-if="error" class="error" role="alert">{{error}} <button @click="initialize">Retry connection</button></div>
      <template v-if="!loading">
        <section v-if="!user" class="panel welcome"><h1>Open your workspace</h1><p v-if="config?.demo_mode">Choose a test account to create and review invoice drafts.</p><form v-if="config?.demo_mode" @submit.prevent="signIn"><label for="identity">Demo account</label><select id="identity" v-model="selected" :disabled="busy"><option v-for="u in users" :key="u.id" :value="u.id">{{u.display_name}}</option></select><button :disabled="busy">Open workspace</button></form><p v-else>Sign-in is not available in this prototype configuration.</p></section>
        <section v-else-if="!knownPath" class="panel"><h1>Page not found</h1><button @click="navigate('/')">Back to workspace</button></section>
        <section v-else-if="forbidden" class="panel"><h1>Access denied</h1><p>This page is unavailable to your current account.</p></section>
        <InvoiceDraft v-else-if="path.startsWith('/seller/invoices/')" :key="user.id+path" :api="api" :path="path" :navigate="navigate" />
        <section v-else-if="path==='/seller' && data"><div class="page-heading"><h1>Invoices</h1><button @click="navigate('/seller/invoices/new')">+ New invoice</button></div><div class="panel table-scroll"><table><thead><tr><th>Case</th><th>Buyer</th><th>Amount</th><th>Review state</th><th>PayPal status</th><th>Due</th><th>Checked</th></tr></thead><tbody><tr v-for="i in data.invoices" :key="i.case_id"><td><a :href="'/seller/invoices/'+i.case_id" @click.prevent="navigate('/seller/invoices/'+i.case_id)">{{i.case_id.slice(0,8)}}</a></td><td>{{i.buyer_email}}</td><td class="nowrap">USD {{i.total}}</td><td><span class="pill">Draft</span></td><td>No draft</td><td>—</td><td>—</td></tr><tr v-if="!data.invoices.length"><td colspan="7" class="empty"><h2>No invoices yet</h2><p>Create your first invoice to get started.</p><button @click="navigate('/seller/invoices/new')">Create invoice</button></td></tr></tbody></table></div><p class="caption">Local drafts are not sent to the buyer. Payment status appears after PayPal integration is connected.</p></section>
        <section v-else-if="path==='/reviewer' && data" class="panel empty"><h1>Review queue</h1><p>No review workflow is connected yet.</p></section>
        <section v-else-if="path==='/buyer' && data" class="panel empty"><h1>Terms review</h1><p>Private buyer review is not connected yet.</p></section>
      </template>
    </main>
  </div>`
}
createApp(App).mount('#app')
