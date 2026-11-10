// 1stPaper — interface
(function () {
  const api = window.FP_API;
  const C = window.FP_CONTENT;
  const cfg = window.FIRSTPAPER_CONFIG || {};
  const LINKS = cfg.links || {};
  const main = document.getElementById('main');

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const fmtDate = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const chips = (arr, cls = '') => (arr || []).map(s => `<span class="chip ${cls}">${esc(s)}</span>`).join('');
  const STATUS = { pending: 'Awaiting review', open: 'Recruiting', full: 'Full', closed: 'Closed', rejected: 'Needs changes' };
  const stageName = n => (n === 0 ? 'Forming' : C.STEPS[n - 1].short);
  const go = h => { location.hash = h; };

  function toast(msg, kind = '') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show ' + kind;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = 'toast'), 3200);
  }
  async function guard(fn, btn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toast(e.message || 'Something went wrong', 'err'); } finally { if (btn) btn.disabled = false; }
  }

  // ---------------------------------------------------------------- state
  let user = null, profile = null, memberships = [];
  async function loadMe() {
    user = api.user();
    if (user) {
      profile = await api.getProfile().catch(() => null) || { id: user.id, full_name: '', skills: [], interests: [], guide_progress: {} };
      memberships = await api.myMemberships().catch(() => []);
    } else { profile = null; memberships = []; }
    renderNav();
  }
  const myRole = gid => (memberships.find(m => m.group_id === gid) || {}).role;
  const profileReady = () => profile && profile.full_name && profile.field;

  // ---------------------------------------------------------------- theme
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.getElementById('themeBtn').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    document.getElementById('themeBtn').innerHTML = dark ? '&#9788;' : '&#9790;';
  }
  document.getElementById('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; store.set('fp_theme', next); applyTheme(next);
  });
  applyTheme(store.get('fp_theme', null));

  // ---------------------------------------------------------------- nav
  function renderNav() {
    const nav = document.getElementById('navLinks');
    const items = [['#/guide', 'Guide'], ['#/groups', 'Research groups']];
    if (user) items.push(['#/my', 'My groups'], ['#/profile', 'Profile']);
    if (profile && profile.is_admin) items.push(['#/review', 'Review']);
    nav.innerHTML = items.map(([h, l]) => `<a href="${h}">${l}</a>`).join('') +
      (user ? `<button class="linkbtn" id="signOutBtn">Sign out</button>` : `<a href="#/signin" class="btn small">Sign in</a>`);
    const so = document.getElementById('signOutBtn');
    if (so) so.onclick = async () => { await api.signOut(); await loadMe(); go('#/'); route(); toast('Signed out'); };
    markActive();
  }
  function markActive() {
    const h = location.hash || '#/';
    document.querySelectorAll('#navLinks a').forEach(a => a.classList.toggle('active', h.startsWith(a.getAttribute('href'))));
  }
  document.getElementById('menuBtn').addEventListener('click', () => {
    const open = document.getElementById('navLinks').classList.toggle('open');
    document.getElementById('menuBtn').setAttribute('aria-expanded', open);
  });

  // ---------------------------------------------------------------- guide progress
  function getProgress() { return (user && profile && profile.guide_progress) || store.get('fp_progress', {}); }
  let saveTimer;
  function setProgress(p) {
    if (user && profile) {
      profile.guide_progress = p;
      clearTimeout(saveTimer); saveTimer = setTimeout(() => api.saveProfile({ guide_progress: p }).catch(() => {}), 600);
    } else store.set('fp_progress', p);
  }
  const stepDone = (p, s) => (p[s.key] || []).length;

  // ---------------------------------------------------------------- matching
  function matchScore(g, p) {
    if (!p) return 0;
    let s = 0;
    const mine = new Set((p.skills || []).map(x => x.toLowerCase()));
    (g.skills_needed || []).forEach(k => { if (mine.has(k.toLowerCase())) s += 2; });
    if (p.field && g.field === p.field) s += 2;
    const text = (g.title + ' ' + g.summary).toLowerCase();
    (p.interests || []).forEach(i => { if (i && text.includes(i.toLowerCase())) s += 1; });
    return s;
  }
  function personScore(p, g) {
    let s = 0;
    const need = new Set((g.skills_needed || []).map(x => x.toLowerCase()));
    (p.skills || []).forEach(k => { if (need.has(k.toLowerCase())) s += 2; });
    if (p.field === g.field) s += 1;
    if (p.role === 'mentor' && p.field === g.field) s += 1;
    return s;
  }

  // ---------------------------------------------------------------- views
  const views = {};

  views.home = async () => {
    const p = getProgress(); const done = C.STEPS.filter(s => stepDone(p, s) === s.actions.length).length;
    main.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Free · Open · For first-time authors</p>
      <h1>Publish your first research paper, with a guide and a team.</h1>
      <p class="lead">1stPaper takes you from idea to published article in a legitimate journal, step by step. Form a research group around your idea, or join someone else's, and learn by doing.</p>
      <div class="row">
        <a class="btn" href="#/guide">${done ? 'Continue the guide' : 'Start the guide'}</a>
        <a class="btn ghost" href="#/groups">Browse research groups</a>
      </div>
    </section>
    <section class="grid3">
      <div class="card feature"><span class="num">1</span><h3>Follow the guide</h3><p>Eleven practical steps, from finding a publishable idea to responding to reviewers. Tick off tasks and track your progress.</p></div>
      <div class="card feature"><span class="num">2</span><h3>Form or join a group</h3><p>Post your research idea and the skills you need. Others see it, ask to join, and mentors can offer support.</p></div>
      <div class="card feature"><span class="num">3</span><h3>Publish the right way</h3><p>Fair authorship, ethical research and legitimate journals only. A paper in a predatory journal can hurt an application.</p></div>
    </section>
    <section class="card family">
      <h2>Part of a family of free tools</h2>
      <div class="grid3">
        <a class="tool" href="${esc(LINKS.lara)}" target="_blank" rel="noopener"><strong>LARA</strong><span>Get the articles you need, and use Find a Journal to choose a legitimate journal.</span></a>
        <a class="tool" href="${esc(LINKS.citadel)}" target="_blank" rel="noopener"><strong>Citadel</strong><span>Learn academic writing, from research questions to IMRaD and citation.</span></a>
        <a class="tool" href="${esc(LINKS.laureate)}" target="_blank" rel="noopener"><strong>Laureate Lab</strong><span>Turn your publication into a stronger scholarship application.</span></a>
      </div>
    </section>`;
  };

  views.guide = async (idx) => {
    const p = getProgress();
    if (idx == null) {
      const total = C.STEPS.reduce((a, s) => a + s.actions.length, 0);
      const done = C.STEPS.reduce((a, s) => a + stepDone(p, s), 0);
      main.innerHTML = `
      <div class="pagehead"><h1>The first-paper guide</h1>
        <p class="lead">Eleven steps from idea to publication. Work through them alone or with your research group.${user ? '' : ' Your progress is saved in this browser. <a href="#/signin">Sign in</a> to keep it everywhere.'}</p>
        <div class="progress" role="progressbar" aria-valuenow="${done}" aria-valuemax="${total}"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
        <p class="muted small">${done} of ${total} tasks done</p></div>
      <ol class="steps">${C.STEPS.map((s, i) => {
        const d = stepDone(p, s), n = s.actions.length;
        return `<li><a href="#/guide/${i + 1}" class="step ${d === n ? 'done' : d ? 'part' : ''}">
          <span class="stepnum">${d === n ? '&#10003;' : i + 1}</span>
          <span class="steptext"><strong>${esc(s.title)}</strong><span class="muted small">${esc(s.why.split('. ')[0])}.</span></span>
          <span class="muted small nowrap">${d}/${n}</span></a></li>`;
      }).join('')}</ol>`;
      return;
    }
    const i = Math.min(Math.max(+idx, 1), C.STEPS.length) - 1, s = C.STEPS[i];
    const doneSet = new Set(p[s.key] || []);
    main.innerHTML = `
    <nav class="crumbs"><a href="#/guide">&larr; All steps</a><span class="muted">Step ${i + 1} of ${C.STEPS.length}</span></nav>
    <article class="card stepcard">
      <h1>${i + 1}. ${esc(s.title)}</h1>
      <p class="lead">${esc(s.why)}</p>
      <h2>Tasks</h2>
      <ul class="checklist">${s.actions.map((a, k) => `<li><label><input type="checkbox" data-k="${k}" ${doneSet.has(k) ? 'checked' : ''}><span>${esc(a)}</span></label></li>`).join('')}</ul>
      <div class="twocol">
        <div><h2>Tips</h2><ul class="bul">${s.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
        <div><h2>Avoid</h2><ul class="bul warn">${s.pitfalls.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      </div>
      ${s.links.length ? `<h2>Useful links</h2><div class="linkrow">${s.links.filter(l => l.url).map(l => `<a class="chip link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} &#8599;</a>`).join('')}</div>` : ''}
    </article>
    <nav class="pager">
      ${i > 0 ? `<a class="btn ghost" href="#/guide/${i}">&larr; ${esc(C.STEPS[i - 1].short)}</a>` : '<span></span>'}
      ${i < C.STEPS.length - 1 ? `<a class="btn" href="#/guide/${i + 2}">${esc(C.STEPS[i + 1].short)} &rarr;</a>` : `<a class="btn" href="#/groups">Find a research group &rarr;</a>`}
    </nav>`;
    main.querySelectorAll('.checklist input').forEach(cb => cb.addEventListener('change', () => {
      const cur = getProgress(); const set = new Set(cur[s.key] || []);
      cb.checked ? set.add(+cb.dataset.k) : set.delete(+cb.dataset.k);
      setProgress({ ...cur, [s.key]: [...set].sort((a, b) => a - b) });
    }));
  };

  function groupCard(g, score) {
    const role = myRole(g.id);
    return `<a class="card gcard" href="#/group/${esc(g.id)}">
      <div class="gtop"><span class="badge s-${g.status}">${STATUS[g.status]}</span>${role ? `<span class="badge mine">${role === 'founder' ? 'Your group' : role === 'mentor' ? 'Mentoring' : 'Member'}</span>` : ''}${score >= 3 ? '<span class="badge match">Good match</span>' : ''}</div>
      <h3>${esc(g.title)}</h3>
      <p class="muted">${esc(g.summary)}</p>
      <div class="meta"><span>${esc(g.field)}</span>${g.article_type ? `<span>${esc(g.article_type)}</span>` : ''}<span>${g.member_count}/${g.max_size} members</span></div>
      ${(g.skills_needed || []).length ? `<div class="chips"><span class="muted small">Needs:</span> ${chips(g.skills_needed)}</div>` : ''}
      <div class="stagebar" title="Stage: ${esc(stageName(g.stage))}"><span style="width:${(g.stage / 11) * 100}%"></span></div>
      <p class="small muted">Stage ${g.stage} of 11 · ${esc(stageName(g.stage))}</p>
    </a>`;
  }

  views.groups = async () => {
    main.innerHTML = `<div class="pagehead"><h1>Research groups</h1><p class="lead">Small teams of 2–8 people working towards one paper. Find a group that needs your skills, or post your own idea.</p></div><p class="muted">Loading…</p>`;
    const all = await api.listGroups();
    const f = store.get('fp_filters', { q: '', field: '', status: 'open', type: '', skill: '' });
    const visible = all.filter(g => ['open', 'full'].includes(g.status));
    const suggested = profileReady() ? visible.filter(g => g.status === 'open' && !myRole(g.id)).map(g => [g, matchScore(g, profile)]).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
    const opt = (arr, v, label) => `<option value="">${label}</option>` + arr.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    main.innerHTML = `
    <div class="pagehead row between"><div><h1>Research groups</h1><p class="lead">Small teams of 2–8 people working towards one paper. Find a group that needs your skills, or post your own idea.</p></div>
      <a class="btn" href="#/new">+ Post your idea</a></div>
    ${suggested.length ? `<section><h2>Suggested for you</h2><div class="ggrid">${suggested.map(([g, s]) => groupCard(g, s)).join('')}</div></section>` : (user && !profileReady() ? `<p class="notice">Add your field and skills to <a href="#/profile">your profile</a> to see groups that match you.</p>` : '')}
    <section>
      <h2>All groups</h2>
      <form class="filters" id="filters" onsubmit="return false">
        <input type="search" name="q" placeholder="Search titles and summaries" value="${esc(f.q)}" aria-label="Search">
        <select name="field" aria-label="Field">${opt(C.FIELDS, f.field, 'All fields')}</select>
        <select name="type" aria-label="Article type">${opt(C.ARTICLE_TYPES, f.type, 'All article types')}</select>
        <select name="skill" aria-label="Skill needed">${opt(C.SKILLS, f.skill, 'Any skill needed')}</select>
        <select name="status" aria-label="Status"><option value="open" ${f.status === 'open' ? 'selected' : ''}>Recruiting</option><option value="" ${!f.status ? 'selected' : ''}>Recruiting and full</option></select>
      </form>
      <div class="ggrid" id="list"></div>
    </section>`;
    const draw = () => {
      const fd = Object.fromEntries(new FormData(document.getElementById('filters'))); store.set('fp_filters', fd);
      const q = fd.q.trim().toLowerCase();
      const rows = visible.filter(g => (!fd.status || g.status === fd.status) && (!fd.field || g.field === fd.field) && (!fd.type || g.article_type === fd.type) &&
        (!fd.skill || (g.skills_needed || []).includes(fd.skill)) && (!q || (g.title + ' ' + g.summary).toLowerCase().includes(q)));
      document.getElementById('list').innerHTML = rows.length ? rows.map(g => groupCard(g, matchScore(g, profile))).join('')
        : `<div class="empty card"><p>No groups match these filters yet.</p><a class="btn" href="#/new">Post the first one</a></div>`;
    };
    document.getElementById('filters').addEventListener('input', draw); draw();
  };

  function needSignIn(msg) {
    main.innerHTML = `<div class="card narrow center"><h1>Sign in first</h1><p>${esc(msg)}</p><a class="btn" href="#/signin">Sign in</a></div>`;
  }
  function needProfile() {
    main.innerHTML = `<div class="card narrow center"><h1>Complete your profile</h1><p>Add your name, field and skills so group founders know who you are, and so we can match you with groups.</p><a class="btn" href="#/profile">Go to profile</a></div>`;
  }

  function groupForm(g, priv) {
    const skillSet = new Set((g && g.skills_needed) || []);
    return `<form id="gform" class="card form">
      <label>Working title<input name="title" required minlength="5" maxlength="160" value="${esc(g && g.title)}" placeholder="e.g. Post-harvest losses of maize in West Africa: a scoping review"></label>
      <label>Public summary <span class="muted small">(everyone can see this — 20 to 600 characters)</span>
        <textarea name="summary" required minlength="20" maxlength="600" rows="3" placeholder="What question will the paper answer, and how?">${esc(g && g.summary)}</textarea></label>
      <div class="twocol">
        <label>Field<select name="field" required><option value="">Choose…</option>${C.FIELDS.map(x => `<option ${g && g.field === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label>Article type<select name="article_type">${C.ARTICLE_TYPES.map(x => `<option ${g && g.article_type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      </div>
      <label>Methods you have in mind<input name="methods" maxlength="300" value="${esc(g && g.methods)}" placeholder="e.g. literature search in Scopus and AJOL, PRISMA screening"></label>
      <fieldset><legend>Skills you need</legend><div class="checkgrid">${C.SKILLS.map(s => `<label class="check"><input type="checkbox" name="skills_needed" value="${esc(s)}" ${skillSet.has(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></fieldset>
      <div class="twocol">
        <label>Group size (including you)<input type="number" name="max_size" min="2" max="8" value="${(g && g.max_size) || 4}"></label>
        <label>Target timeline<input name="timeline" maxlength="80" value="${esc(g && g.timeline)}" placeholder="e.g. Submit within 6 months"></label>
      </div>
      <label>Private details <span class="muted small">(only members see this — full plan, data sources, meeting times, shared folder link)</span>
        <textarea name="details" rows="4">${esc(priv && priv.details)}</textarea></label>
      <details><summary>Group agreement (members accept this when they join)</summary>
        <textarea name="agreement" rows="9">${esc((priv && priv.agreement) || C.AGREEMENT)}</textarea></details>
      <p class="muted small">New groups are checked by a curator before they appear on the board. We may suggest narrowing a topic that is too broad, or one that needs ethics approval the group cannot get.</p>
      <div class="row"><button class="btn" type="submit">${g ? 'Save changes' : 'Submit for review'}</button><a class="btn ghost" href="${g ? '#/group/' + esc(g.id) : '#/groups'}">Cancel</a></div>
    </form>`;
  }
  function readGroupForm(form) {
    const fd = new FormData(form);
    return [{
      title: fd.get('title').trim(), summary: fd.get('summary').trim(), field: fd.get('field'), article_type: fd.get('article_type'),
      methods: fd.get('methods').trim(), skills_needed: fd.getAll('skills_needed'), max_size: Math.min(8, Math.max(2, +fd.get('max_size') || 4)), timeline: fd.get('timeline').trim()
    }, { details: fd.get('details').trim(), agreement: fd.get('agreement').trim() }];
  }

  views.newGroup = async () => {
    if (!user) return needSignIn('You need an account to post a research idea.');
    if (!profileReady()) return needProfile();
    main.innerHTML = `<nav class="crumbs"><a href="#/groups">&larr; Research groups</a></nav><div class="pagehead"><h1>Post your research idea</h1><p class="lead">Describe the paper you want to write and the help you need. Keep it focused: one question, one paper.</p></div>${groupForm(null, null)}`;
    document.getElementById('gform').addEventListener('submit', e => {
      e.preventDefault(); const btn = e.submitter;
      guard(async () => {
        const [g, priv] = readGroupForm(e.target);
        const row = await api.createGroup(g, priv);
        memberships = await api.myMemberships();
        toast('Submitted for review'); go('#/group/' + row.id);
      }, btn);
    });
  };

  views.editGroup = async (id) => {
    const g = await api.getGroup(id);
    if (!g || !user || g.founder_id !== user.id) return go('#/group/' + id);
    const priv = await api.getPrivate(id);
    main.innerHTML = `<nav class="crumbs"><a href="#/group/${esc(id)}">&larr; Back to group</a></nav><div class="pagehead"><h1>Edit group</h1>${g.status === 'rejected' ? '<p class="notice">Saving will send your group back to the curator for review.</p>' : ''}</div>${groupForm(g, priv)}`;
    document.getElementById('gform').addEventListener('submit', e => {
      e.preventDefault();
      guard(async () => {
        const [patch, p] = readGroupForm(e.target);
        await api.updateGroup(id, patch); await api.updatePrivate(id, p);
        toast('Saved'); go('#/group/' + id);
      }, e.submitter);
    });
  };

  views.group = async (id) => {
    main.innerHTML = '<p class="muted">Loading…</p>';
    const g = await api.getGroup(id);
    if (!g) { main.innerHTML = `<div class="card narrow center"><h1>Group not found</h1><p>It may be awaiting review, or it was removed.</p><a class="btn" href="#/groups">Back to groups</a></div>`; return; }
    const role = myRole(id), isFounder = user && g.founder_id === user.id, isMem = !!role, isAdmin = profile && profile.is_admin;
    const [members, priv, reqs, contribs, myReqs] = await Promise.all([
      user ? api.members(id) : Promise.resolve([]),
      isMem || isAdmin ? api.getPrivate(id) : null,
      isFounder ? api.requestsFor(id) : [],
      isMem ? api.contributions(id) : [],
      user && !isMem ? api.myRequests() : []
    ]);
    const myReq = (myReqs || []).find(r => r.group_id === id);
    const me = members.find(m => user && m.user_id === user.id);
    const founder = members.find(m => m.role === 'founder');

    let joinBox = '';
    if (!user) joinBox = `<div class="card side"><h3>Interested?</h3><p>Sign in to ask to join this group.</p><a class="btn" href="#/signin">Sign in</a></div>`;
    else if (!isMem && myReq) joinBox = `<div class="card side"><h3>Your request</h3><p>Status: <strong>${esc(myReq.status)}</strong></p>${myReq.status === 'pending' ? '<button class="btn ghost" id="withdrawBtn">Withdraw request</button>' : ''}</div>`;
    else if (!isMem && g.status === 'open') joinBox = `<form class="card side" id="joinForm"><h3>Ask to join</h3>
      <label>Join as<select name="as_role"><option value="member">Member (co-author)</option><option value="mentor">Mentor (guide the group)</option></select></label>
      <label>Note to the founder<textarea name="note" rows="4" maxlength="800" required placeholder="Which skills can you bring? How much time can you give each week?"></textarea></label>
      <button class="btn" type="submit">Send request</button></form>`;
    else if (!isMem) joinBox = `<div class="card side"><h3>Not recruiting</h3><p>This group is ${esc(STATUS[g.status].toLowerCase())}.</p></div>`;

    main.innerHTML = `
    <nav class="crumbs"><a href="#/groups">&larr; Research groups</a></nav>
    ${g.status === 'pending' ? `<p class="notice">This group is waiting for a curator's review. Only you can see it for now.</p>` : ''}
    ${g.status === 'rejected' ? `<p class="notice err"><strong>The curator asked for changes:</strong> ${esc(g.review_note || 'Please narrow or clarify the idea.')} <a href="#/edit/${esc(id)}">Edit and resubmit</a></p>` : ''}
    <div class="layout">
      <div class="col">
        <header class="card">
          <div class="gtop"><span class="badge s-${g.status}">${STATUS[g.status]}</span>${role ? `<span class="badge mine">${role === 'founder' ? 'Your group' : role === 'mentor' ? 'Mentoring' : 'Member'}</span>` : ''}</div>
          <h1>${esc(g.title)}</h1>
          <p class="lead">${esc(g.summary)}</p>
          <div class="meta"><span>${esc(g.field)}</span>${g.article_type ? `<span>${esc(g.article_type)}</span>` : ''}<span>${g.member_count}/${g.max_size} members</span>${g.timeline ? `<span>${esc(g.timeline)}</span>` : ''}${founder ? `<span>Started by ${esc(founder.profile.full_name)}</span>` : ''}</div>
          ${g.methods ? `<p><strong>Methods:</strong> ${esc(g.methods)}</p>` : ''}
          ${(g.skills_needed || []).length ? `<div class="chips"><span class="muted small">Skills needed:</span> ${chips(g.skills_needed)}</div>` : ''}
          ${isFounder ? `<div class="row wrap mt"><a class="btn small ghost" href="#/edit/${esc(id)}">Edit</a>
             ${['open', 'full', 'closed'].includes(g.status) ? `<label class="inline">Status <select id="statusSel">${['open', 'full', 'closed'].map(s => `<option value="${s}" ${g.status === s ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></label>` : ''}
             <button class="btn small danger" id="delBtn">Delete group</button></div>` : ''}
        </header>

        <section class="card">
          <h2>Roadmap</h2>
          <p class="muted small">The group's progress through the 11 guide steps.${isFounder ? ' Update it as you go — progress shows on the public board.' : ''}</p>
          <ol class="roadmap">${C.STEPS.map((s, i) => `<li class="${g.stage > i ? 'done' : g.stage === i ? 'now' : ''}">
            ${isFounder ? `<button data-stage="${i + 1}" title="Mark done up to here">` : '<span>'}<span class="dot">${g.stage > i ? '&#10003;' : i + 1}</span><span>${esc(s.short)}</span>${isFounder ? '</button>' : '</span>'}
            </li>`).join('')}</ol>
          ${isFounder && g.stage > 0 ? '<button class="linkbtn small" data-stage="0">Reset roadmap</button>' : ''}
        </section>

        ${priv ? `<section class="card"><h2>Private details <span class="muted small">— members only</span></h2>
          <p class="pre">${esc(priv.details || 'No private details yet.')}</p></section>` : ''}

        ${isMem && priv ? `<section class="card"><h2>Group agreement</h2><p class="pre small">${esc(priv.agreement || C.AGREEMENT)}</p>
          ${me && me.agreed ? '<p class="ok">&#10003; You accepted this agreement.</p>' : '<button class="btn" id="agreeBtn">I accept the group agreement</button>'}</section>` : ''}

        ${user ? `<section class="card"><h2>Members</h2>
          <ul class="people">${members.map(m => `<li>
            <span class="avatar">${esc(initials(m.profile && m.profile.full_name))}</span>
            <div><strong>${esc(m.profile ? m.profile.full_name : 'Member')}</strong> <span class="badge r-${m.role}">${m.role}</span>${isMem && m.agreed ? ' <span class="small ok" title="Accepted the group agreement">&#10003; agreed</span>' : ''}
              <div class="muted small">${esc([m.profile && m.profile.field, m.profile && m.profile.institution, m.profile && m.profile.country].filter(Boolean).join(' · '))}</div>
              ${isMem && (m.credit_roles || []).length ? `<div class="chips">${chips(m.credit_roles, 'soft')}</div>` : ''}
            </div>
            ${isFounder && m.role !== 'founder' ? `<button class="linkbtn small" data-remove="${esc(m.user_id)}">Remove</button>` : ''}
          </li>`).join('')}</ul>
          ${me ? `<details class="mt"><summary>My contribution roles (CRediT)</summary><form id="creditForm"><div class="checkgrid">${C.CREDIT.map(c => `<label class="check"><input type="checkbox" name="credit" value="${esc(c)}" ${(me.credit_roles || []).includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div><button class="btn small" type="submit">Save roles</button></form></details>` : ''}
          ${me && me.role !== 'founder' ? '<button class="linkbtn small danger" id="leaveBtn">Leave group</button>' : ''}
        </section>` : ''}

        ${isMem ? `<section class="card"><h2>Contribution log</h2><p class="muted small">Record what you did. A clear log keeps authorship fair.</p>
          <form id="contribForm" class="row"><input name="note" required minlength="3" maxlength="600" placeholder="e.g. Screened 120 abstracts against the inclusion criteria" aria-label="Contribution"><button class="btn" type="submit">Add</button></form>
          <ul class="log">${contribs.map(c => `<li><span class="muted small">${fmtDate(c.created_at)}</span> <strong>${esc(c.profile ? c.profile.full_name : '')}</strong> — ${esc(c.note)}</li>`).join('') || '<li class="muted">Nothing logged yet.</li>'}</ul></section>` : ''}
      </div>

      <aside class="col side-col">
        ${joinBox}
        ${isFounder ? `<section class="card side"><h3>Join requests</h3>
          ${reqs.length ? reqs.map(r => `<div class="req"><strong>${esc(r.profile.full_name)}</strong> <span class="badge r-${r.as_role}">${r.as_role}</span>
              <div class="muted small">${esc([r.profile.field, r.profile.institution, r.profile.country].filter(Boolean).join(' · '))}</div>
              ${(r.profile.skills || []).length ? `<div class="chips">${chips(r.profile.skills, 'soft')}</div>` : ''}
              <p class="small">${esc(r.note)}</p>
              <div class="row"><button class="btn small" data-accept="${esc(r.id)}">Accept</button><button class="btn small ghost" data-decline="${esc(r.id)}">Decline</button></div></div>`).join('')
            : '<p class="muted small">No pending requests.</p>'}
          ${api.mode === 'demo' && g.status !== 'pending' ? '<button class="linkbtn small" id="simBtn">Demo: simulate a join request</button>' : ''}
        </section>
        <section class="card side" id="fitBox"><h3>People who might fit</h3><p class="muted small">Loading…</p></section>` : ''}
        <section class="card side"><h3>Next step in the guide</h3>
          <p>${g.stage >= 11 ? 'Published — congratulations!' : `<a href="#/guide/${g.stage + 1}">${g.stage + 1}. ${esc(C.STEPS[Math.min(g.stage, 10)].title)}</a>`}</p>
          <p class="small muted">Choosing a journal? Use <a href="${esc(LINKS.findJournal)}" target="_blank" rel="noopener">LARA's Find a Journal</a>.</p></section>
        <section class="card side"><h3>Share</h3><button class="btn small ghost" id="copyBtn">Copy link to this group</button></section>
      </aside>
    </div>`;

    const $ = s => main.querySelector(s);
    const reload = async () => { memberships = user ? await api.myMemberships() : []; views.group(id); };
    $('#copyBtn').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => toast('Link copied'), () => toast('Copy failed', 'err')); };
    const jf = $('#joinForm');
    if (jf) jf.onsubmit = e => {
      e.preventDefault(); if (!profileReady()) return needProfile();
      const fd = new FormData(jf);
      guard(async () => { await api.requestJoin(id, fd.get('as_role'), fd.get('note').trim()); toast('Request sent to the founder'); reload(); }, e.submitter);
    };
    const wb = $('#withdrawBtn'); if (wb) wb.onclick = () => guard(async () => { await api.withdraw(myReq.id); toast('Request withdrawn'); reload(); }, wb);
    const ab = $('#agreeBtn'); if (ab) ab.onclick = () => guard(async () => { await api.updateMyMembership(id, { agreed: true }); toast('Agreement accepted'); reload(); }, ab);
    const cf = $('#creditForm'); if (cf) cf.onsubmit = e => { e.preventDefault(); guard(async () => { await api.updateMyMembership(id, { credit_roles: new FormData(cf).getAll('credit') }); toast('Roles saved'); reload(); }, e.submitter); };
    const lb = $('#leaveBtn'); if (lb) lb.onclick = () => { if (confirm('Leave this group?')) guard(async () => { await api.removeMember(id, user.id); toast('You left the group'); memberships = await api.myMemberships(); go('#/my'); }, lb); };
    const cof = $('#contribForm'); if (cof) cof.onsubmit = e => { e.preventDefault(); guard(async () => { await api.addContribution(id, new FormData(cof).get('note').trim()); reload(); }, e.submitter); };
    main.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => guard(async () => {
      const n = +b.dataset.stage; await api.updateGroup(id, { stage: g.stage === n ? n - 1 : n }); reload();
    }, b));
    const ss = $('#statusSel'); if (ss) ss.onchange = () => guard(async () => { await api.updateGroup(id, { status: ss.value }); toast('Status updated'); reload(); });
    const db = $('#delBtn'); if (db) db.onclick = () => { if (confirm('Delete this group for everyone? This cannot be undone.')) guard(async () => { await api.deleteGroup(id); memberships = await api.myMemberships(); toast('Group deleted'); go('#/my'); }, db); };
    main.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => guard(async () => { await api.accept(b.dataset.accept); toast('Accepted'); reload(); }, b));
    main.querySelectorAll('[data-decline]').forEach(b => b.onclick = () => guard(async () => { await api.decline(b.dataset.decline); toast('Declined'); reload(); }, b));
    main.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { if (confirm('Remove this member from the group?')) guard(async () => { await api.removeMember(id, b.dataset.remove); reload(); }, b); });
    const sim = $('#simBtn'); if (sim) sim.onclick = () => { if (api.simulateRequest(id)) reload(); else toast('No more sample people to simulate'); };

    const fit = $('#fitBox');
    if (fit) {
      const people = await api.listProfiles().catch(() => []);
      const ids = new Set(members.map(m => m.user_id).concat(reqs.map(r => r.user_id)));
      const ranked = people.filter(p => !ids.has(p.id) && p.full_name).map(p => [p, personScore(p, g)]).filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
      fit.innerHTML = `<h3>People who might fit</h3>` + (ranked.length ? `<ul class="people compact">${ranked.map(([p]) => `<li><span class="avatar">${esc(initials(p.full_name))}</span><div><strong>${esc(p.full_name)}</strong> ${p.role === 'mentor' ? '<span class="badge r-mentor">mentor</span>' : ''}<div class="muted small">${esc([p.field, p.country].filter(Boolean).join(' · '))}</div><div class="chips">${chips((p.skills || []).filter(s => (g.skills_needed || []).includes(s)), 'soft')}</div></div></li>`).join('')}</ul><p class="muted small">Matching groups are shown to these people on their board. Share your group link to invite others.</p>`
        : '<p class="muted small">No strong matches yet. Share your group link to invite people.</p>');
    }
  };

  views.my = async () => {
    if (!user) return needSignIn('Sign in to see your groups and requests.');
    main.innerHTML = '<p class="muted">Loading…</p>';
    const [all, sent, incoming] = await Promise.all([api.listGroups(), api.myRequests(), api.incomingRequests()]);
    const mine = all.filter(g => myRole(g.id));
    main.innerHTML = `
    <div class="pagehead row between"><div><h1>My groups</h1></div><a class="btn" href="#/new">+ Post your idea</a></div>
    ${incoming.length ? `<section class="card"><h2>Requests waiting for you (${incoming.length})</h2><ul class="bul">${incoming.map(r => `<li><a href="#/group/${esc(r.group_id)}">${esc(r.group ? r.group.title : 'Your group')}</a> — 1 ${esc(r.as_role)} request</li>`).join('')}</ul></section>` : ''}
    <section><h2>Groups you're in</h2><div class="ggrid">${mine.map(g => groupCard(g, 0)).join('') || `<div class="empty card"><p>You're not in any groups yet.</p><a class="btn" href="#/groups">Browse groups</a></div>`}</div></section>
    <section class="card"><h2>Requests you've sent</h2>${sent.length ? `<ul class="bul">${sent.map(r => `<li>${r.group ? `<a href="#/group/${esc(r.group_id)}">${esc(r.group.title)}</a>` : 'A group that is no longer listed'} — <strong>${esc(r.status)}</strong> <span class="muted small">(${fmtDate(r.created_at)})</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}</section>`;
  };

  views.profile = async () => {
    if (!user) return needSignIn('Sign in to create your profile.');
    const p = profile || {}; const sk = new Set(p.skills || []);
    main.innerHTML = `
    <div class="pagehead"><h1>Your profile</h1><p class="lead">Group founders see this when you ask to join. Your field and skills are used to match you with groups.</p></div>
    <form id="pform" class="card form">
      <div class="twocol"><label>Full name<input name="full_name" required maxlength="100" value="${esc(p.full_name)}"></label>
        <label>I am joining as<select name="role"><option value="student" ${p.role !== 'mentor' ? 'selected' : ''}>Student / early-career researcher</option><option value="mentor" ${p.role === 'mentor' ? 'selected' : ''}>Mentor (I have published before)</option></select></label></div>
      <div class="twocol"><label>Country<input name="country" maxlength="60" value="${esc(p.country)}"></label>
        <label>Institution <span class="muted small">(optional)</span><input name="institution" maxlength="120" value="${esc(p.institution)}"></label></div>
      <label>Main field<select name="field" required><option value="">Choose…</option>${C.FIELDS.map(x => `<option ${p.field === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <fieldset><legend>Skills you can offer</legend><div class="checkgrid">${C.SKILLS.map(s => `<label class="check"><input type="checkbox" name="skills" value="${esc(s)}" ${sk.has(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></fieldset>
      <label>Research interests <span class="muted small">(comma separated, e.g. flooding, food security)</span><input name="interests" maxlength="300" value="${esc((p.interests || []).join(', '))}"></label>
      <label>Short bio <span class="muted small">(optional)</span><textarea name="bio" rows="3" maxlength="600">${esc(p.bio)}</textarea></label>
      <p class="muted small">Signed in as ${esc(user.email || '')}. Other signed-in members can see your name, field, country, institution and skills — never your email.</p>
      <button class="btn" type="submit">Save profile</button>
    </form>`;
    document.getElementById('pform').onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target);
      guard(async () => {
        profile = await api.saveProfile({
          full_name: fd.get('full_name').trim(), role: fd.get('role'), country: fd.get('country').trim(), institution: fd.get('institution').trim(), field: fd.get('field'),
          skills: fd.getAll('skills'), interests: fd.get('interests').split(',').map(s => s.trim()).filter(Boolean), bio: fd.get('bio').trim(),
          guide_progress: Object.keys(profile.guide_progress || {}).length ? profile.guide_progress : store.get('fp_progress', {})
        });
        renderNav(); toast('Profile saved'); go('#/groups');
      }, e.submitter);
    };
  };

  views.review = async () => {
    if (!profile || !profile.is_admin) return go('#/');
    const rows = await api.pendingGroups();
    main.innerHTML = `<div class="pagehead"><h1>Curator review</h1><p class="lead">Approve focused, ethical ideas. Ask for changes when a topic is too broad, needs ethics approval the group can't get, or looks like a paper-mill or paid-authorship scheme.</p></div>
    ${rows.length ? rows.map(g => `<article class="card review">
      <h2>${esc(g.title)}</h2><p>${esc(g.summary)}</p>
      <div class="meta"><span>${esc(g.field)}</span><span>${esc(g.article_type)}</span><span>Max ${g.max_size}</span><span>By ${esc(g.founder ? g.founder.full_name : '')}${g.founder && g.founder.country ? ', ' + esc(g.founder.country) : ''}</span><span>${fmtDate(g.created_at)}</span></div>
      ${g.methods ? `<p class="small"><strong>Methods:</strong> ${esc(g.methods)}</p>` : ''}
      <label>Note to founder<textarea rows="2" data-note="${esc(g.id)}" placeholder="Optional for approval; required when asking for changes"></textarea></label>
      <div class="row"><button class="btn" data-approve="${esc(g.id)}">Approve</button><button class="btn ghost" data-reject="${esc(g.id)}">Ask for changes</button><a class="linkbtn" href="#/group/${esc(g.id)}">Open</a></div>
    </article>`).join('') : '<div class="empty card"><p>No groups waiting for review.</p></div>'}`;
    const note = id => main.querySelector(`[data-note="${id}"]`).value.trim();
    main.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => guard(async () => { await api.review(b.dataset.approve, true, note(b.dataset.approve)); toast('Approved — now on the board'); views.review(); }, b));
    main.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => {
      const n = note(b.dataset.reject); if (!n) return toast('Add a note explaining what to change', 'err');
      guard(async () => { await api.review(b.dataset.reject, false, n); toast('Sent back to founder'); views.review(); }, b);
    });
  };

  views.signin = async () => {
    if (user) return go('#/my');
    main.innerHTML = `<div class="card narrow">
      <h1>Sign in or join</h1>
      ${cfg.google !== false ? `<button class="btn ghost full" id="googleBtn" type="button"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
      <p class="or"><span>or use any email</span></p>` : ''}
      <p>Personal emails are fine. We'll send you a sign-in link. No password needed.</p>
      <form id="sform" class="form"><label>Email<input type="email" name="email" required autocomplete="email"></label><button class="btn" type="submit">Email me a sign-in link</button></form>
      ${api.mode === 'demo' ? '<p class="notice">Demo mode: no email is sent. You will be signed in as a sample user straight away.</p>' : ''}
    </div>`;
    const gb = document.getElementById('googleBtn');
    if (gb) gb.onclick = () => guard(async () => { await api.signInGoogle(); if (api.mode === 'demo') { await loadMe(); go('#/profile'); } }, gb);
    document.getElementById('sform').onsubmit = e => {
      e.preventDefault(); const email = new FormData(e.target).get('email').trim();
      guard(async () => {
        await api.signIn(email);
        if (api.mode === 'demo') { await loadMe(); go('#/profile'); return; }
        main.innerHTML = `<div class="card narrow center"><h1>Check your email</h1><p>We sent a sign-in link to <strong>${esc(email)}</strong>. Open it in this browser to continue. It may take a minute, and check your spam folder.</p></div>`;
      }, e.submitter);
    };
  };

  // ---------------------------------------------------------------- router
  async function route() {
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    const [a, b] = parts;
    markActive();
    document.getElementById('navLinks').classList.remove('open');
    try {
      if (!a) await views.home();
      else if (a === 'guide') await views.guide(b ? +b : null);
      else if (a === 'groups') await views.groups();
      else if (a === 'new') await views.newGroup();
      else if (a === 'group' && b) await views.group(b);
      else if (a === 'edit' && b) await views.editGroup(b);
      else if (a === 'my') await views.my();
      else if (a === 'profile') await views.profile();
      else if (a === 'review') await views.review();
      else if (a === 'signin') await views.signin();
      else await views.home();
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="card narrow center"><h1>Something went wrong</h1><p>${esc(e.message)}</p><a class="btn" href="#/">Home</a></div>`;
    }
    const h1 = main.querySelector('h1');
    document.title = (h1 && a ? h1.textContent.trim() + ' · ' : '') + '1stPaper';
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  (async () => {
    if (api.mode === 'demo') {
      document.getElementById('demoBar').hidden = false;
      document.getElementById('resetDemo').onclick = () => { api.reset(); location.hash = '#/'; location.reload(); };
    }
    await api.init().catch(e => console.error(e));
    await loadMe();
    api.onAuth(async () => { await loadMe(); route(); });
    if (user && !profileReady() && !location.hash.startsWith('#/profile') && api.mode === 'live') go('#/profile');
    route();
  })();
})();
