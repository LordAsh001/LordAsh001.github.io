// 1stPaper — data layer. Two back ends with the same methods:
//   SupabaseAPI (live)  and  DemoAPI (sample data in this browser only)
(function () {
  const cfg = window.FIRSTPAPER_CONFIG || {};

  // ------------------------------------------------------------------ Supabase
  function SupabaseAPI() {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true }
    });
    let user = null;
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    const api = {
      mode: 'live',
      async init() {
        const { data } = await sb.auth.getSession();
        user = data.session ? data.session.user : null;
        // tidy the ?code= left by the sign-in link
        if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
        return user;
      },
      onAuth(cb) {
        sb.auth.onAuthStateChange((ev, s) => {
          const prev = user && user.id; user = s ? s.user : null;
          if ((ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') && prev !== (user && user.id)) setTimeout(() => cb(user), 0);
        });
      },
      user: () => user,
      async signIn(email) {
        ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
      },
      async signInGoogle() {
        ok(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
      },
      async signOut() { await sb.auth.signOut(); user = null; },

      async getProfile(id) {
        return ok(await sb.from('fp_profiles').select('*').eq('id', id || user.id).maybeSingle());
      },
      async saveProfile(p) {
        const row = { ...p, id: user.id }; delete row.is_admin; delete row.created_at;
        return ok(await sb.from('fp_profiles').upsert(row).select().single());
      },
      async listProfiles() { return ok(await sb.from('fp_profiles').select('id,full_name,country,institution,field,skills,interests,role,bio')); },

      async listGroups() { return ok(await sb.from('fp_groups').select('*').order('created_at', { ascending: false })); },
      async getGroup(id) { return ok(await sb.from('fp_groups').select('*').eq('id', id).maybeSingle()); },
      async getPrivate(id) { return ok(await sb.from('fp_group_private').select('*').eq('group_id', id).maybeSingle()); },
      async createGroup(g, priv) {
        const row = ok(await sb.from('fp_groups').insert(g).select().single());
        if (priv) ok(await sb.from('fp_group_private').update(priv).eq('group_id', row.id));
        return row;
      },
      async updateGroup(id, patch) { return ok(await sb.from('fp_groups').update(patch).eq('id', id).select().single()); },
      async updatePrivate(id, patch) { ok(await sb.from('fp_group_private').update({ ...patch, updated_at: new Date().toISOString() }).eq('group_id', id)); },
      async deleteGroup(id) { ok(await sb.from('fp_groups').delete().eq('id', id)); },

      async members(gid) {
        return ok(await sb.from('fp_group_members').select('*, profile:fp_profiles(id,full_name,country,institution,field,skills,role)').eq('group_id', gid).order('joined_at'));
      },
      async myMemberships() { return ok(await sb.from('fp_group_members').select('*').eq('user_id', user.id)); },
      async updateMyMembership(gid, patch) { ok(await sb.from('fp_group_members').update(patch).eq('group_id', gid).eq('user_id', user.id)); },
      async removeMember(gid, uid) { ok(await sb.from('fp_group_members').delete().eq('group_id', gid).eq('user_id', uid)); },

      async requestJoin(gid, as_role, note) { ok(await sb.from('fp_join_requests').insert({ group_id: gid, user_id: user.id, as_role, note })); },
      async myRequests() { return ok(await sb.from('fp_join_requests').select('*, group:fp_groups(id,title,status)').eq('user_id', user.id).order('created_at', { ascending: false })); },
      async requestsFor(gid) {
        return ok(await sb.from('fp_join_requests').select('*, profile:fp_profiles(id,full_name,country,institution,field,skills,role,bio)').eq('group_id', gid).eq('status', 'pending').order('created_at'));
      },
      async incomingRequests() {
        const mine = ok(await sb.from('fp_groups').select('id').eq('founder_id', user.id));
        if (!mine.length) return [];
        return ok(await sb.from('fp_join_requests').select('*, group:fp_groups(id,title)').in('group_id', mine.map(g => g.id)).eq('status', 'pending'));
      },
      async accept(rid) { ok(await sb.rpc('fp_accept_request', { rid })); },
      async decline(rid) { ok(await sb.rpc('fp_decline_request', { rid })); },
      async withdraw(rid) { ok(await sb.from('fp_join_requests').delete().eq('id', rid)); },

      async contributions(gid) {
        return ok(await sb.from('fp_contributions').select('*, profile:fp_profiles(full_name)').eq('group_id', gid).order('created_at', { ascending: false }));
      },
      async addContribution(gid, note) { ok(await sb.from('fp_contributions').insert({ group_id: gid, user_id: user.id, note })); },

      async pendingGroups() { return ok(await sb.from('fp_groups').select('*, founder:fp_profiles!fp_groups_founder_id_fkey(full_name,country,field)').eq('status', 'pending').order('created_at')); },
      async review(gid, approve, note) { ok(await sb.rpc('fp_review_group', { gid, approve, note })); }
    };
    return api;
  }

  // ------------------------------------------------------------------ Demo
  function DemoAPI() {
    const KEY = 'fp_demo_v1';
    const uid = () => 'id-' + Math.random().toString(36).slice(2, 10);
    const now = () => new Date().toISOString();
    const ago = d => new Date(Date.now() - d * 864e5).toISOString();
    const ME = 'me';

    function seed() {
      const P = (id, full_name, country, field, skills, role, institution, interests = []) =>
        ({ id, full_name, country, field, skills, role, institution, interests, bio: '', guide_progress: {}, is_admin: false, created_at: ago(30) });
      const profiles = [
        { ...P(ME, '', '', '', [], 'student', ''), is_admin: true },
        P('u1', 'Amaka Obi', 'Nigeria', 'Earth & Environmental Sciences', ['GIS / mapping', 'Field data collection'], 'student', 'University of Nigeria, Nsukka', ['flooding', 'remote sensing']),
        P('u2', 'Kwame Mensah', 'Ghana', 'Agriculture & Food', ['Statistics', 'R', 'Survey design'], 'student', 'KNUST', ['food security']),
        P('u3', 'Dr Wanjiru Kamau', 'Kenya', 'Health & Medical Sciences', ['Systematic review', 'Academic writing', 'Statistics'], 'mentor', 'University of Toronto', ['public health']),
        P('u4', 'Tendai Moyo', 'Zimbabwe', 'Engineering', ['Python', 'Modelling / simulation', 'Data visualisation'], 'student', 'University of Zimbabwe', ['solar energy']),
        P('u5', 'Fatima Bello', 'Nigeria', 'Social Sciences', ['Qualitative analysis', 'Survey design', 'Academic writing'], 'student', 'Ahmadu Bello University', ['education access'])
      ];
      const G = (id, founder_id, title, summary, field, article_type, skills_needed, max_size, status, stage, member_count, days) =>
        ({ id, founder_id, title, summary, field, article_type, methods: '', skills_needed, max_size, timeline: '6 months', status, stage, member_count, review_note: '', created_at: ago(days), updated_at: ago(days) });
      const groups = [
        G('g1', 'u1', 'Mapping flood exposure of informal settlements in Lagos with free satellite data', 'Using Sentinel-1 radar images to map how often informal settlements along the Lagos lagoon flooded between 2018 and 2025.', 'Earth & Environmental Sciences', 'Original research', ['GIS / mapping', 'Python', 'Academic writing'], 4, 'open', 3, 2, 12),
        G('g2', 'u2', 'Post-harvest losses of maize in West Africa: a scoping review', 'A scoping review of studies measuring post-harvest maize losses in ECOWAS countries since 2010, and what storage methods reduced them.', 'Agriculture & Food', 'Systematic or scoping review', ['Systematic review', 'Literature searching', 'Reference management'], 5, 'open', 2, 3, 20),
        G('g3', 'u4', 'Performance of rooftop solar on Zimbabwean schools', 'Comparing measured output of rooftop solar systems at 12 rural schools with simulated output, to explain the performance gap.', 'Engineering', 'Short communication', ['Python', 'Statistics'], 3, 'full', 7, 3, 45),
        G('g4', 'u5', 'Why girls leave secondary school in northern Nigeria: a review of evidence', 'A narrative review of published studies and reports on the causes of secondary-school dropout among girls in northern Nigeria.', 'Social Sciences', 'Narrative review', ['Literature searching', 'Qualitative analysis', 'Editing & proofreading'], 4, 'pending', 0, 1, 2)
      ];
      const members = [
        ['g1', 'u1', 'founder', 15], ['g1', 'u4', 'member', 10], ['g1', 'u3', 'mentor', 8],
        ['g2', 'u2', 'founder', 20], ['g2', 'u5', 'member', 18], ['g2', 'u1', 'member', 14],
        ['g3', 'u4', 'founder', 45], ['g3', 'u2', 'member', 40], ['g3', 'u1', 'member', 38],
        ['g4', 'u5', 'founder', 2]
      ].map(([group_id, user_id, role, d]) => ({ group_id, user_id, role, credit_roles: [], agreed: true, joined_at: ago(d) }));
      const priv = groups.map(g => ({ group_id: g.id, details: 'Full protocol, shared folder link and meeting times are visible to members here.', agreement: window.FP_CONTENT.AGREEMENT, updated_at: now() }));
      return { profiles, groups, members, priv, requests: [], contribs: [
        { id: 'c1', group_id: 'g1', user_id: 'u1', note: 'Downloaded 2018–2025 Sentinel-1 scenes for the study area', created_at: ago(6) },
        { id: 'c2', group_id: 'g1', user_id: 'u4', note: 'Wrote the Python script for water masking', created_at: ago(3) }
      ] };
    }

    let db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || !db.groups) db = seed();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
    const prof = id => db.profiles.find(p => p.id === id);
    const grp = id => db.groups.find(g => g.id === id);
    const isMember = (gid, u = ME) => db.members.some(m => m.group_id === gid && m.user_id === u);
    const recount = gid => { const g = grp(gid); if (g) g.member_count = db.members.filter(m => m.group_id === gid && m.role !== 'mentor').length; };
    const clone = x => JSON.parse(JSON.stringify(x));
    let signedIn = true;

    return {
      mode: 'demo',
      async init() { return signedIn ? { id: ME, email: 'you@example.com' } : null; },
      onAuth() {},
      user: () => (signedIn ? { id: ME, email: 'you@example.com' } : null),
      async signIn() { signedIn = true; },
      async signInGoogle() { signedIn = true; },
      async signOut() { signedIn = false; },
      reset() { db = seed(); save(); },

      async getProfile(id) { return clone(prof(id || ME) || null); },
      async saveProfile(p) { const cur = prof(ME); Object.assign(cur, p, { id: ME, is_admin: cur.is_admin }); save(); return clone(cur); },
      async listProfiles() { return clone(db.profiles); },

      async listGroups() {
        return clone(db.groups.filter(g => ['open', 'full'].includes(g.status) || g.founder_id === ME || isMember(g.id) || prof(ME).is_admin)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      async getGroup(id) { return clone(grp(id) || null); },
      async getPrivate(id) { return isMember(id) || prof(ME).is_admin ? clone(db.priv.find(p => p.group_id === id) || null) : null; },
      async createGroup(g, priv) {
        const row = { ...g, id: uid(), founder_id: ME, status: 'pending', stage: g.stage || 0, member_count: 0, review_note: '', created_at: now(), updated_at: now() };
        db.groups.push(row);
        db.members.push({ group_id: row.id, user_id: ME, role: 'founder', credit_roles: [], agreed: false, joined_at: now() });
        db.priv.push({ group_id: row.id, details: (priv && priv.details) || '', agreement: (priv && priv.agreement) || '', updated_at: now() });
        recount(row.id); save(); return clone(row);
      },
      async updateGroup(id, patch) {
        const g = grp(id); const p = { ...patch };
        if (['pending', 'rejected'].includes(g.status)) p.status = 'pending';
        else if (p.status && !['open', 'full', 'closed'].includes(p.status)) delete p.status;
        Object.assign(g, p, { updated_at: now() }); save(); return clone(g);
      },
      async updatePrivate(id, patch) { Object.assign(db.priv.find(p => p.group_id === id), patch, { updated_at: now() }); save(); },
      async deleteGroup(id) {
        db.groups = db.groups.filter(g => g.id !== id);
        ['members', 'priv', 'requests', 'contribs'].forEach(k => { db[k] = db[k].filter(r => r.group_id !== id); }); save();
      },

      async members(gid) { return clone(db.members.filter(m => m.group_id === gid).map(m => ({ ...m, profile: prof(m.user_id) }))); },
      async myMemberships() { return clone(db.members.filter(m => m.user_id === ME)); },
      async updateMyMembership(gid, patch) { Object.assign(db.members.find(m => m.group_id === gid && m.user_id === ME), patch); save(); },
      async removeMember(gid, u) { db.members = db.members.filter(m => !(m.group_id === gid && m.user_id === u && m.role !== 'founder')); recount(gid); save(); },

      async requestJoin(gid, as_role, note) {
        if (db.requests.some(r => r.group_id === gid && r.user_id === ME)) throw new Error('You have already asked to join this group');
        db.requests.push({ id: uid(), group_id: gid, user_id: ME, as_role, note, status: 'pending', created_at: now() });
        // In the demo, the founder "accepts" automatically after a moment so you can see the member view
        save();
      },
      async myRequests() { return clone(db.requests.filter(r => r.user_id === ME).map(r => ({ ...r, group: grp(r.group_id) }))); },
      async requestsFor(gid) { return clone(db.requests.filter(r => r.group_id === gid && r.status === 'pending').map(r => ({ ...r, profile: prof(r.user_id) }))); },
      async incomingRequests() {
        const mine = db.groups.filter(g => g.founder_id === ME).map(g => g.id);
        return clone(db.requests.filter(r => mine.includes(r.group_id) && r.status === 'pending').map(r => ({ ...r, group: grp(r.group_id) })));
      },
      async accept(rid) {
        const r = db.requests.find(x => x.id === rid); const g = grp(r.group_id);
        if (r.as_role === 'member' && g.member_count >= g.max_size) throw new Error('This group is already full');
        db.members.push({ group_id: r.group_id, user_id: r.user_id, role: r.as_role, credit_roles: [], agreed: false, joined_at: now() });
        r.status = 'accepted'; recount(g.id); if (g.status === 'open' && g.member_count >= g.max_size) g.status = 'full'; save();
      },
      async decline(rid) { db.requests.find(x => x.id === rid).status = 'declined'; save(); },
      async withdraw(rid) { db.requests = db.requests.filter(r => r.id !== rid); save(); },

      async contributions(gid) { return clone(db.contribs.filter(c => c.group_id === gid).map(c => ({ ...c, profile: prof(c.user_id) })).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
      async addContribution(gid, note) { db.contribs.push({ id: uid(), group_id: gid, user_id: ME, note, created_at: now() }); save(); },

      async pendingGroups() { return clone(db.groups.filter(g => g.status === 'pending').map(g => ({ ...g, founder: prof(g.founder_id) }))); },
      async review(gid, approve, note) { const g = grp(gid); g.status = approve ? 'open' : 'rejected'; g.review_note = note || ''; save(); },

      // demo-only helper: simulate someone asking to join your group
      simulateRequest(gid) {
        const candidates = db.profiles.filter(p => p.id !== ME && !isMember(gid, p.id) && !db.requests.some(r => r.group_id === gid && r.user_id === p.id));
        if (!candidates.length) return false;
        const p = candidates[0];
        db.requests.push({ id: uid(), group_id: gid, user_id: p.id, as_role: p.role === 'mentor' ? 'mentor' : 'member', note: `Hi, I'm ${p.full_name.split(' ')[0]}. I can help with ${p.skills.slice(0, 2).join(' and ').toLowerCase()}.`, status: 'pending', created_at: now() });
        save(); return true;
      }
    };
  }

  const live = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase;
  window.FP_API = live ? SupabaseAPI() : DemoAPI();
})();
