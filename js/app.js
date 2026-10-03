// ============================ helpers ============================
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[c]));
}
function getStore(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function setStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
const me = () => getStore('cslid_user', {});
function openModal(id) { const e = document.getElementById(id); if (e) { e.classList.remove('hidden'); e.classList.add('flex'); } }
function closeModal(id) { const e = document.getElementById(id); if (e) { e.classList.add('hidden'); e.classList.remove('flex'); } }
function formatWhen(v) {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}
let toastTimer = null;
function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3500);
}
function clearLocalAccountData() {
    Object.keys(localStorage).filter(k => k.startsWith('cslid_') && k !== 'cslid_theme').forEach(k => localStorage.removeItem(k));
}
function allowLocalAction(key, limit, windowMs) {
    const now = Date.now();
    const stamps = getStore(key, []).filter(v => now - v < windowMs);
    if (stamps.length >= limit) return false;
    stamps.push(now);
    setStore(key, stamps);
    return true;
}

// ============================ theme ============================
function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('cslid_theme', dark ? 'dark' : 'light');
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) toggle.innerHTML = `<i class="fa-solid fa-${dark ? 'sun' : 'moon'}"></i>`;
}
window.toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
applyTheme(localStorage.getItem('cslid_theme') || 'light');

// ============================ state ============================
let currentProfileIndex = 0, matchProfiles = [], swiping = false;
let activeMessageRecipientId = '', refreshInProgress = false, unsubscribeFromRealtime = null, hydrateTimer = null;
let directoryFilter = 'all', directoryStartups = [], currentUserIsModerator = false, authMode = 'signup';
const feedPosts = [];

function getRegisteredStartups() { return getStore('cslid_startups', []); }

// ============================ tabs ============================
function switchTab(tabId) {
    if (tabId === 'moderation' && !currentUserIsModerator) {
        showToast('Moderator access is required to review reports.');
        return;
    }
    if (tabId === 'match' && me().role === 'founder') {
        showToast('Match Deck is available to investor accounts.');
        tabId = 'connections';
    }
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.className = "nav-btn px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center space-x-2 text-gray-400 hover:text-white hover:bg-gray-800/50";
    });
    const active = document.getElementById(`nav-btn-${tabId}`);
    if (active) active.className = "nav-btn px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center space-x-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/30";
    if (tabId === 'connections') renderConnections();
    if (tabId === 'moderation') window.loadModerationQueue();
}
window.switchTab = switchTab;
window.openRoleHome = () => switchTab(me().role === 'founder' ? 'connections' : 'match');

// ============================ match deck ============================
function refreshMatchProfiles() {
    const user = me(), passed = getStore('cslid_passed', []);
    matchProfiles = getRegisteredStartups()
        .filter(s => s.isPublic !== false && s.userId && s.userId !== user.id && !passed.includes(s.userId) && !getConnectionBetween(user.id, s.userId))
        .map(s => ({
            id: s.userId, name: s.name, tagline: s.tagline, badge: "Startup",
            stage: s.stage || "Early Stage", location: s.location || "Location not provided",
            seeking: s.seeking || "Funding details available", traction: s.traction || "Early stage",
            bio: s.problem || "Startup profile", tags: s.sector ? [s.sector] : [], contactUrl: s.contactUrl
        }));
    if (currentProfileIndex >= matchProfiles.length) currentProfileIndex = 0;
    renderCard();
}

function renderCard() {
    const set = (id, text) => { document.getElementById(id).innerText = text; };
    if (!matchProfiles.length) {
        set('card-badge', "Waiting for startups"); set('card-stage', "LIVE");
        set('card-name', "No startup profiles yet");
        set('card-tagline', "Published startups will appear here automatically.");
        set('card-location', "—"); set('card-seeking', "—"); set('card-traction', "—");
        set('card-bio', "When founders publish a startup profile, it shows up here for you to swipe.");
        document.getElementById('card-tags').innerHTML = '';
        return;
    }
    const p = matchProfiles[currentProfileIndex];
    set('card-badge', p.badge); set('card-stage', p.stage); set('card-name', p.name); set('card-tagline', p.tagline);
    set('card-location', p.location); set('card-seeking', p.seeking); set('card-traction', p.traction); set('card-bio', p.bio);
    document.getElementById('card-tags').innerHTML = p.tags.map(t =>
        `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-800/80 border border-gray-700 text-indigo-300">#${escapeHtml(t)}</span>`).join('');
}

function handleSwipe(action) {
    if (me().role !== 'investor') return showToast('The match deck is for investor accounts.');
    if (!matchProfiles.length) return showToast('No registered startups are available yet.');
    if (swiping) return;
    swiping = true;
    const profile = matchProfiles[currentProfileIndex];
    const card = document.getElementById('active-card');
    card.style.transform = action === 'pass' ? 'translateX(-120%) rotate(-20deg)' : 'translateX(120%) rotate(20deg)';
    card.style.opacity = '0';
    setTimeout(async () => {
        try {
            card.style.transform = 'none';
            card.style.opacity = '1';
            if (action === 'pass') {
                const passed = getStore('cslid_passed', []);
                passed.push(profile.id);
                setStore('cslid_passed', passed);
            } else if (await connectPersistently(profile.id)) {
                openMatchModal(profile);
            }
            refreshMatchProfiles();
            if (matchProfiles.length > 1 && matchProfiles[currentProfileIndex]?.id === profile.id) {
                currentProfileIndex = (currentProfileIndex + 1) % matchProfiles.length;
                renderCard();
            }
        } finally { swiping = false; }
    }, 300);
}

function openMatchModal(profile) {
    document.getElementById('match-modal-text').innerText = profile
        ? `Your connection request to ${profile.name} was sent. You can message them after they accept.`
        : 'Connection request sent.';
    openModal('match-modal');
}
function closeMatchModal() { closeModal('match-modal'); }

// ============================ feed ============================
function renderFeed() {
    document.getElementById('posts-container').innerHTML = feedPosts.length ? feedPosts.map(post => `
        <div class="glass p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400" aria-label="Author"><i class="fa-solid fa-user"></i></div>
                <div>
                    <h4 class="text-sm font-bold text-white">${escapeHtml(post.author)}</h4>
                    <p class="text-[10px] text-indigo-400 font-semibold">${escapeHtml(post.role)} • ${escapeHtml(formatWhen(post.time))}</p>
                </div>
            </div>
            <p class="text-sm text-gray-300 leading-relaxed">${escapeHtml(post.content)}</p>
            <div class="flex flex-wrap gap-1.5">
                ${(post.tags || []).map(t => `<span class="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-400">#${escapeHtml(t)}</span>`).join('')}
            </div>
            ${me().id && post.userId !== me().id ? `<div class="border-t border-gray-800 pt-3 text-right"><button onclick="window.reportPost('${escapeHtml(post.id)}')" class="text-[10px] text-gray-500 hover:text-rose-400"><i class="fa-solid fa-flag mr-1"></i>Report post</button></div>` : ''}
        </div>`).join('')
        : '<div class="vl-empty">No updates yet. Founders can share progress with "Post Update".</div>';
}
function openPostModal() { openModal('post-modal'); }
function closePostModal() { closeModal('post-modal'); }
async function submitNewPost() {
    const content = document.getElementById('new-post-content').value;
    if (!content.trim()) return;
    const authUser = await getLiveUserForWrite();
    if (!authUser) return;
    const post = {user_id: authUser.id, content: content.trim(), tags: ["Update"]}; // author/role/counters are set by the database
    const saved = await saveToSupabase('cslid_posts', post);
    if (window.SUPABASE_CONFIGURED && !saved) return showToast(window.lastSupabaseError || 'Could not publish the update. Please try again.');
    feedPosts.unshift({id: saved?.id, userId: authUser.id, author: saved?.author || me().name || 'Member',
        role: saved?.role || me().role || '', time: saved?.created_at || new Date().toISOString(),
        content: post.content, tags: post.tags});
    setStore('cslid_posts', feedPosts);
    renderFeed();
    closePostModal();
    document.getElementById('new-post-content').value = '';
    switchTab('feed');
    showToast('Your update was published to the feed!');
}

// ============================ directory ============================
function filterDirectory(f) {
    if (f) directoryFilter = f;
    document.querySelectorAll('.dir-filter').forEach(btn => {
        const on = (btn.getAttribute('onclick') || '').includes(`'${directoryFilter}'`);
        btn.className = 'dir-filter px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ' +
            (on ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white');
    });
    const user = me();
    const rel = uid => {
        const r = getConnectionBetween(user.id, uid);
        if (r?.status === 'accepted') return 'Connected';
        if (r?.status === 'requested') return r.requester_id === user.id ? 'Pending' : 'View request';
        return 'Connect';
    };
    const sectorRe = s => new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const startups = directoryFilter === 'investors' ? [] : directoryStartups.filter(s =>
        s.isPublic && s.userId !== user.id && (directoryFilter === 'all' || sectorRe(directoryFilter).test(s.sector || '')));
    const investors = (directoryFilter === 'all' || directoryFilter === 'investors')
        ? getStore('cslid_public_profiles', []).filter(p => p.role === 'investor' && p.user_id !== user.id) : [];
    const actions = (uid, label) => `
        <div class="flex gap-2">
            ${label === 'Connected' ? `<button onclick="openConnectionMessage('${escapeHtml(uid)}')" class="px-3 py-1.5 rounded-xl bg-gray-800 text-gray-200 font-bold"><i class="fa-regular fa-message mr-1"></i>Message</button>` : ''}
            ${label === 'Connect' ? `<button onclick="connectPersistently('${escapeHtml(uid)}')" class="connection-action px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition">Connect</button>` : ''}
            ${label === 'View request' ? `<button onclick="switchTab('connections')" class="px-3 py-1.5 bg-gray-800 text-gray-200 rounded-xl font-bold">View request</button>` : ''}
            ${label === 'Pending' ? '<span class="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-xl font-bold">Pending</span>' : ''}
            ${me().id && uid !== me().id ? `<button onclick="window.reportUser('${escapeHtml(uid)}')" aria-label="Report profile" title="Report profile" class="px-2 py-1.5 rounded-xl bg-gray-800 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-flag"></i></button>` : ''}
        </div>`;
    const startupCard = s => `
        <div class="glass p-5 rounded-3xl border border-gray-800 space-y-4">
            <div class="h-24 rounded-2xl bg-gray-800 flex items-center justify-center text-gray-500"><i class="fa-solid fa-rocket text-2xl"></i></div>
            <div>
                <div class="flex items-center justify-between">
                    <h4 class="font-bold text-base text-white">${escapeHtml(s.name)}</h4>
                    <span class="text-[10px] font-bold px-2 py-1 rounded bg-indigo-500/20 text-indigo-400">${escapeHtml(s.sector)}</span>
                </div>
                <p class="text-xs text-gray-400 mt-1"><i class="fa-solid fa-location-dot mr-1"></i> ${escapeHtml(s.location)} • Stage: ${escapeHtml(s.stage)}</p>
            </div>
            <div class="flex items-center justify-between pt-3 border-t border-gray-800 text-xs">
                <span class="text-emerald-400 font-bold">Seeking ${escapeHtml(s.raise)}</span>${actions(s.userId, rel(s.userId))}
            </div>
        </div>`;
    const investorCard = p => `
        <div class="glass p-5 rounded-3xl border border-gray-800 space-y-4">
            <div class="h-24 rounded-2xl bg-gray-800 flex items-center justify-center text-gray-500"><i class="fa-solid fa-sack-dollar text-2xl"></i></div>
            <div>
                <div class="flex items-center justify-between">
                    <h4 class="font-bold text-base text-white">${escapeHtml(p.name || 'Investor')}</h4>
                    <span class="text-[10px] font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-400">Investor</span>
                </div>
                <p class="text-xs text-gray-400 mt-1">${escapeHtml(p.startup || p.company || p.headline || 'Investor on cslid.')}</p>
            </div>
            <div class="flex items-center justify-end pt-3 border-t border-gray-800 text-xs">${actions(p.user_id, rel(p.user_id))}</div>
        </div>`;
    document.getElementById('directory-grid').innerHTML = startups.map(startupCard).join('') + investors.map(investorCard).join('')
        || '<div class="vl-empty col-span-full">Nobody here yet. Invite people to join!</div>';
}
window.filterDirectory = filterDirectory;
window.goToDirectory = () => { closeLaunchCenter(); switchTab('directory'); };

// ============================ auth & account ============================
async function getLiveUserForWrite() {
    if (!window.SUPABASE_CONFIGURED) { showToast(window.lastSupabaseError || 'Supabase is not configured.'); return null; }
    const authUser = await window.getSupabaseUser();
    if (!authUser) { showToast('Your session has expired. Sign in again before saving.'); return null; }
    return authUser;
}
async function resolveAccountRole(authUser) {
    const accounts = await fetchFromSupabase('cslid_users', {columns: 'id,role'});
    if (accounts === null) return '';
    const role = (accounts || []).find(a => a.id === authUser.id)?.role;
    if (role === 'founder' || role === 'investor') return role;
    const metaRole = authUser.user_metadata?.role; // fallback only; the database is the source of truth
    return metaRole === 'founder' || metaRole === 'investor' ? metaRole : '';
}

function getPendingGoogleAccount() {
    const pending = getStore('cslid_google_oauth_pending', null);
    if (!pending || (pending.role && !['founder', 'investor'].includes(pending.role)) ||
        !Number.isFinite(pending.createdAt) || Date.now() - pending.createdAt > 30 * 60 * 1000) {
        localStorage.removeItem('cslid_google_oauth_pending');
        return null;
    }
    return pending;
}

async function ensureAccountRows(authUser, requestedRole, requestedName) {
    const [accounts, profiles] = await Promise.all([
        fetchFromSupabase('cslid_users', {columns: 'id,name,email,role'}),
        fetchFromSupabase('cslid_profiles', {columns: 'id,user_id,role,name'})
    ]);
    if (accounts === null || profiles === null) {
        throw new Error(window.lastSupabaseError || 'Could not verify your account. Please try again.');
    }

    const existingAccount = accounts.find(account => account.id === authUser.id);
    const existingProfile = profiles.find(profile => profile.user_id === authUser.id);
    const role = existingAccount?.role === 'founder' || existingAccount?.role === 'investor'
        ? existingAccount.role
        : (requestedRole || authUser.user_metadata?.role || '');
    if (role !== 'founder' && role !== 'investor') return null;

    const name = (existingAccount?.name || requestedName || authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name || authUser.email?.split('@')[0] || '').trim().slice(0, 120);
    if (!authUser.email) throw new Error('Your Google account did not provide an email address.');

    if (!existingAccount) {
        const savedAccount = await saveToSupabase('cslid_users', {
            id: authUser.id, name: name || 'Member', email: authUser.email, role
        });
        if (!savedAccount) throw new Error(window.lastSupabaseError || 'Could not create your account profile.');
    }
    if (!existingProfile) {
        const savedProfile = await saveToSupabase('cslid_profiles', {
            id: authUser.id, user_id: authUser.id, role, name: name || 'Member', is_public: true
        });
        if (!savedProfile) throw new Error(window.lastSupabaseError || 'Could not create your public profile.');
    }

    localStorage.removeItem('cslid_google_oauth_pending');
    return {role, name: name || 'Member'};
}

window.setAuthMode = function(mode) {
    const isSignIn = mode === 'signin', isReset = mode === 'reset';
    authMode = isReset ? 'reset' : (isSignIn ? 'signin' : 'signup');
    const link = (m, text) => `<button type="button" onclick="window.setAuthMode('${m}')" class="font-bold text-indigo-400 hover:text-indigo-300">${text}</button>`;
    document.getElementById('auth-title').innerText = isReset ? 'Set a new password' : (isSignIn ? 'Sign in to cslid.' : 'Create your cslid. account');
    document.getElementById('auth-description').innerText = isSignIn ? 'Use your email and password to continue.'
        : (isReset ? 'Choose a new password for your account.' : 'Create a testing account with your role and email.');
    document.getElementById('auth-signup-fields').classList.toggle('hidden', isSignIn || isReset);
    document.getElementById('auth-role').classList.toggle('hidden', isReset);
    document.getElementById('auth-role-label').classList.toggle('hidden', isReset);
    document.getElementById('auth-role-label').innerText = isSignIn ? 'Role (only used for new accounts)' : 'Choose your role';
    document.getElementById('auth-email').classList.toggle('hidden', isReset);
    document.getElementById('auth-google').classList.toggle('hidden', isReset);
    document.getElementById('auth-submit').innerText = isReset ? 'Update password' : (isSignIn ? 'Sign in' : 'Create account');
    document.getElementById('auth-submit').onclick = () => window.completeAuth(isReset ? 'reset' : (isSignIn ? 'signin' : 'signup'));
    document.getElementById('auth-forgot').classList.toggle('hidden', !isSignIn);
    document.getElementById('auth-switch').innerHTML = isReset ? `Return to ${link('signin', 'sign in')}`
        : (isSignIn ? `Need an account? ${link('signup', 'Create one')}` : `Already have an account? ${link('signin', 'Sign in')}`);
    document.getElementById('auth-note').innerText = isReset ? 'Use at least 8 characters.'
        : (isSignIn ? 'Google accounts can continue with Google. To use a password, request a reset email to set one first.'
            : 'Google accounts sign in with Google; you can set a password later using the reset email.');
    document.getElementById('auth-password').placeholder = isSignIn ? 'Password' : 'Password (at least 8 characters)';
};

window.resetPassword = async function() {
    const email = document.getElementById('auth-email')?.value.trim() || '';
    if (!email) return showToast('Enter your email first.');
    try {
        await window.resetPasswordForEmail(email, window.location.origin + window.location.pathname);
        showToast('Password reset email sent. Check your inbox.');
    } catch (error) { showToast(error.message || 'Could not send password reset email.'); }
};

window.signInWithGoogle = async function() {
    const role = document.getElementById('auth-role')?.value || '';
    if (authMode === 'signup' && role !== 'founder' && role !== 'investor') return showToast('Choose a role before creating your account with Google.');
    if (!window.SUPABASE_CONFIGURED) return showToast(window.lastSupabaseError || 'Supabase is not configured.');
    const name = document.getElementById('auth-name')?.value.trim() || '';
    try {
        setStore('cslid_google_oauth_pending', {role, name, createdAt: Date.now()});
        await window.signInWithGoogleProvider(window.location.origin + window.location.pathname);
    } catch (error) {
        localStorage.removeItem('cslid_google_oauth_pending');
        showToast(error.message || 'Could not continue with Google.');
    }
};

async function completeAuth(mode = 'signup') {
    const name = document.getElementById('auth-name')?.value.trim() || '';
    const role = document.getElementById('auth-role')?.value || '';
    const email = document.getElementById('auth-email')?.value.trim() || '';
    const password = document.getElementById('auth-password')?.value || '';
    if ((mode !== 'reset' && !email) || !password || (mode === 'signup' && (!name || !role))) {
        return showToast(mode === 'signup' ? 'Enter your name, role, email and password.' : 'Enter your email and password.');
    }
    if (password.length < 8) return showToast('Password must be at least 8 characters.');
    if (!window.SUPABASE_CONFIGURED) return showToast(window.lastSupabaseError || 'Supabase is not configured.');
    try {
        if (mode === 'reset') {
            await window.updatePassword(password);
            window.setAuthMode('signin');
            return showToast('Password updated. You can now sign in.');
        }
        showToast(mode === 'signup' ? 'Creating account...' : 'Signing in...');
        const result = mode === 'signup' ? await window.signUpWithPassword(email, password, name, role)
                                         : await window.signInWithPassword(email, password);
        if (!result.user || !result.session) return showToast('Check your email to confirm your account, then sign in.');
        const liveUser = await getLiveUserForWrite();
        if (!liveUser || liveUser.id !== result.user.id) return showToast('Your sign-in session changed. Please sign in again.');
        const pendingGoogle = getPendingGoogleAccount();
        const account = await ensureAccountRows(liveUser, pendingGoogle?.role || role, pendingGoogle?.name || name || email.split('@')[0]);
        if (!account) return showToast('Your account has no role yet. Choose a role and continue with Google.');
        setStore('cslid_user', {id: liveUser.id, name: account.name, email: liveUser.email, role: account.role});
        closeModal('auth-modal');
        updateUserUI();
        await hydrateFromSupabase();
        startRealtimeUpdates();
        window.openRoleHome();
        showToast(mode === 'signup' ? 'Account created.' : 'Signed in.');
    } catch (error) {
        console.error('Authentication failed:', error.message);
        showToast(error.message || 'Authentication failed.');
    }
}
window.completeAuth = completeAuth;

window.signOutCurrentUser = async function() {
    try {
        await window.signOutUser();
        currentUserIsModerator = false;
        clearLocalAccountData();
        feedPosts.length = 0; directoryStartups = []; matchProfiles = [];
        updateUserUI(); renderFeed(); filterDirectory(); refreshMatchProfiles(); renderConnections();
        openModal('auth-modal');
        showToast('You have been signed out.');
    } catch (error) { showToast(error.message || 'Sign-out failed. Please try again.'); }
};

function updateUserUI() {
    const user = getStore('cslid_user', null);
    const matchNav = document.getElementById('nav-btn-match');
    const launchButton = document.getElementById('launch-center-nav');
    const moderationNav = document.getElementById('nav-btn-moderation');
    if (moderationNav) {
        moderationNav.hidden = !currentUserIsModerator;
        moderationNav.style.display = currentUserIsModerator ? '' : 'none';
    }
    if (!user) {
        if (matchNav) matchNav.style.display = '';
        if (launchButton) launchButton.style.display = '';
        return;
    }
    const isFounder = user.role === 'founder';
    const label = document.querySelector('#nav-btn-profile span');
    if (label) label.innerText = user.name;
    const profile = getStore('cslid_profile', {});
    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    setText('profile-name', profile.name || user.name || 'Your profile');
    setText('profile-startup', profile.startup || (isFounder ? 'Add your startup profile' : 'Investor profile'));
    setText('profile-bio', profile.startup || (isFounder ? 'Add your startup focus and investment interests.' : 'Connect with founders and explore the startup directory.'));
    setVal('profile-name-input', profile.name || user.name || '');
    setVal('profile-startup-input', profile.startup || '');
    if (matchNav) { matchNav.hidden = isFounder; matchNav.style.display = isFounder ? 'none' : ''; }
    if (launchButton) { launchButton.hidden = !isFounder; launchButton.style.display = isFounder ? '' : 'none'; }
    document.getElementById('edit-startup-btn')?.classList.toggle('hidden', !isFounder);
}

async function saveProfile() {
    const inputs = document.querySelectorAll('#tab-profile input');
    const profile = {name: inputs[0]?.value || '', startup: inputs[1]?.value || ''};
    const authUser = await getLiveUserForWrite();
    if (!authUser) return;
    const accountRole = await resolveAccountRole(authUser);
    if (!accountRole) return showToast('Could not verify your account role. Please sign in again.');
    const saved = await saveToSupabase('cslid_profiles', {id: authUser.id, user_id: authUser.id, role: accountRole, name: profile.name, startup: profile.startup});
    if (window.SUPABASE_CONFIGURED && !saved) return showToast('Could not save your profile. Please try again.');
    setStore('cslid_profile', profile);
    updateUserUI();
    showToast('Profile saved!');
}

window.exportMyData = async function() {
    if (!me().id) return showToast('Sign in before exporting your data.');
    const data = await window.callSupabaseFunction('export_my_data');
    if (!data) return showToast('Could not export your data. Please try again.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cslid-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Your data export has been downloaded.');
};

window.deleteMyAccount = async function() {
    if (!me().id) return showToast('Sign in before deleting your account.');
    if (!window.confirm('Delete your account and all cslid. data permanently? This cannot be undone.')) return;
    if (await window.callSupabaseFunction('delete_my_account') === null) return showToast('Could not delete your account. Please try again.');
    currentUserIsModerator = false;
    clearLocalAccountData();
    try { await window.signOutUser(); } catch (e) { /* session already gone */ }
    window.location.reload();
};

// ============================ startup profile ============================
function openStartupModal() {
    if (me().role !== 'founder') return showToast('Startup profiles are available to founder accounts.');
    const s = getStore('cslid_startup', null);
    if (s) {
        const set = (id, v) => { document.getElementById(id).value = v; };
        set('startup-name', s.name || ''); set('startup-tagline', s.tagline || ''); set('startup-stage', s.stage || 'Idea');
        set('startup-sector', s.sector || ''); set('startup-problem', s.problem || ''); set('startup-location', s.location || '');
        set('startup-seeking', s.seeking || ''); set('startup-traction', s.traction || ''); set('startup-contact', s.contactUrl || '');
        document.getElementById('startup-public').checked = s.isPublic !== false;
    }
    openModal('startup-modal');
}
function closeStartupModal() { closeModal('startup-modal'); }
window.openStartupModal = openStartupModal;
window.closeStartupModal = closeStartupModal;

async function saveStartup() {
    if (me().role !== 'founder') return showToast('Only founder accounts can publish startup profiles.');
    const authUser = await getLiveUserForWrite();
    if (!authUser) return;
    const val = id => document.getElementById(id).value.trim();
    const startup = {
        id: authUser.id, userId: authUser.id, name: val('startup-name'), tagline: val('startup-tagline'),
        stage: document.getElementById('startup-stage').value, sector: val('startup-sector'), problem: val('startup-problem'),
        location: val('startup-location'), seeking: val('startup-seeking'), traction: val('startup-traction'),
        contactUrl: val('startup-contact'), isPublic: document.getElementById('startup-public').checked
    };
    if (!startup.name || !startup.tagline) return showToast('Add a startup name and one-line description before saving.');
    if (startup.contactUrl && !startup.contactUrl.startsWith('https://')) return showToast('The contact page URL must start with https://');
    if (startup.isPublic && !startup.contactUrl) return showToast('Add a real contact page URL before publishing.');
    const saved = await saveToSupabase('cslid_startups', {
        id: startup.id, user_id: authUser.id, name: startup.name, tagline: startup.tagline, stage: startup.stage,
        sector: startup.sector, problem: startup.problem, location: startup.location, seeking: startup.seeking,
        traction: startup.traction, contact_url: startup.contactUrl || null, is_public: startup.isPublic
    });
    if (window.SUPABASE_CONFIGURED && !saved) return showToast(window.lastSupabaseError || 'Could not save the startup profile. Please try again.');
    const list = getRegisteredStartups(), idx = list.findIndex(x => x.id === startup.id);
    if (idx >= 0) list[idx] = startup; else list.push(startup);
    setStore('cslid_startups', list);
    setStore('cslid_startup', startup);
    closeStartupModal();
    refreshMatchProfiles();
    showToast(startup.isPublic ? 'Startup is now live in the investor swipe deck!' : 'Startup saved as a private draft.');
}
window.saveStartup = saveStartup;

// ============================ connections ============================
function getConnectionRows() { return getStore('cslid_connections', []); }
function getConnectionBetween(a, b) {
    return getConnectionRows().find(i => (i.requester_id === a && i.recipient_id === b) || (i.requester_id === b && i.recipient_id === a));
}
const otherUser = (c, id) => c.requester_id === id ? c.recipient_id : c.requester_id;
function labelFor(id) {
    const p = getStore('cslid_public_profiles', []).find(i => i.user_id === id || i.id === id);
    const s = getRegisteredStartups().find(i => i.userId === id || i.id === id);
    return p?.name || s?.name || `User ${String(id || '').slice(0, 8)}`;
}
function roleFor(id) {
    return getStore('cslid_public_profiles', []).find(i => i.user_id === id || i.id === id)?.role || 'Member';
}

async function connectPersistently(recipientId) {
    const authUser = await getLiveUserForWrite();
    if (!authUser) return false;
    const requesterId = authUser.id;
    if (!recipientId || recipientId === requesterId) { showToast('You cannot connect with your own account.'); return false; }
    const rel = getConnectionBetween(requesterId, recipientId);
    if (rel?.status === 'accepted') { showToast('You are already connected.'); return false; }
    if (rel?.status === 'requested') {
        showToast(rel.requester_id === requesterId ? 'Your connection request is pending.' : 'This person has already requested to connect. Check Connections.');
        return false;
    }
    if (!allowLocalAction('cslid_connection_attempts', 20, 24 * 60 * 60 * 1000)) { showToast('Daily connection request limit reached. Try again tomorrow.'); return false; }
    const saved = rel?.status === 'rejected' && rel.requester_id === requesterId
        ? await window.callSupabaseFunction('retry_connection_request', {p_connection_id: rel.id})
        : await saveToSupabase('cslid_connections', {requester_id: requesterId, recipient_id: recipientId, status: 'requested'});
    if (window.SUPABASE_CONFIGURED && !saved) { showToast(window.lastSupabaseError || 'Could not send the connection request.'); return false; }
    const rows = getConnectionRows().filter(r => !saved?.id || r.id !== saved.id);
    rows.push(saved || {requester_id: requesterId, recipient_id: recipientId, status: 'requested'});
    setStore('cslid_connections', rows);
    filterDirectory();
    showToast('Connection request sent!');
    return true;
}

async function respondToConnection(connectionId, action) {
    if (!me().id) return showToast('Sign in before managing connection requests.');
    if (!connectionId) return showToast('This connection request is missing its id.');
    const result = await window.callSupabaseFunction(action === 'accept' ? 'accept_connection' : 'reject_connection', {p_connection_id: connectionId});
    if (!result) return showToast(window.lastSupabaseError || `Could not ${action} the connection request.`);
    await hydrateFromSupabase();
    renderLaunchCenter();
    showToast(action === 'accept' ? 'Connection accepted. You can now message each other.' : 'Connection request rejected.');
}
window.respondToConnection = respondToConnection;

window.renderConnections = function() {
    const container = document.getElementById('connections-content');
    if (!container) return;
    const current = me();
    if (!current.id) {
        container.innerHTML = '<div class="glass p-6 rounded-3xl border border-gray-800"><p class="text-sm font-bold">Sign in to view your connections.</p></div>';
        return;
    }
    const rows = getConnectionRows().filter(i => i.requester_id === current.id || i.recipient_id === current.id);
    const incoming = rows.filter(i => i.recipient_id === current.id && i.status === 'requested');
    const outgoing = rows.filter(i => i.requester_id === current.id && i.status === 'requested');
    const accepted = rows.filter(i => i.status === 'accepted');
    const messages = getStore('cslid_messages', {}), readState = getStore('cslid_message_read', {});
    const section = (title, items, body, empty) => `
        <section class="glass p-5 rounded-3xl border border-gray-800 space-y-3">
            <div class="flex items-center justify-between"><h2 class="text-sm font-bold">${title}</h2><span class="vl-pill">${items.length}</span></div>
            ${items.length ? items.map(body).join('') : `<p class="text-xs text-gray-500 py-3">${empty}</p>`}
        </section>`;
    const person = (item, actions) => `
        <div class="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-950/40 p-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center"><i class="fa-solid fa-user text-indigo-400"></i></div>
            <div class="grow"><p class="text-sm font-bold">${escapeHtml(labelFor(otherUser(item, current.id)))}</p><p class="text-[10px] text-gray-500">${escapeHtml(roleFor(otherUser(item, current.id)))}</p></div>
            <div class="flex gap-2">${actions(item)}</div>
        </div>`;
    container.innerHTML =
        section('Incoming requests', incoming, i => person(i, r => `
            <button onclick="respondToConnection('${r.id}','accept')" class="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-bold">Accept</button>
            <button onclick="respondToConnection('${r.id}','reject')" class="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-[10px] font-bold">Reject</button>`), 'No incoming requests right now.') +
        section('Sent requests', outgoing, i => person(i, () => '<span class="px-3 py-2 rounded-lg bg-gray-800 text-gray-400 text-[10px] font-bold">Pending</span>'), 'Requests you send will appear here.') +
        section('Accepted connections', accepted, i => person(i, c => {
            const other = otherUser(c, current.id), thread = messages[other] || [], last = thread[thread.length - 1];
            const unread = thread.filter(m => !m.me && new Date(m.time || 0).getTime() > (readState[other] || 0)).length;
            return `<button onclick="openConnectionMessage('${other}')" class="px-3 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-bold"><i class="fa-regular fa-message mr-1"></i>Message</button>
                ${last ? `<span class="hidden sm:inline text-[10px] text-gray-500 max-w-32 truncate">${escapeHtml(last.text)}</span>` : ''}
                ${unread ? `<span class="min-w-5 h-5 px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold inline-flex items-center justify-center">${unread}</span>` : ''}`;
        }), 'Accepted connections will appear here.');
};

window.refreshAppData = async function() {
    if (!me().id) return showToast('Sign in to refresh your data.');
    if (!window.SUPABASE_CONFIGURED) return showToast(window.lastSupabaseError || 'Supabase is not configured.');
    const button = document.getElementById('refresh-data-button'), label = button?.querySelector('span');
    if (button) button.disabled = true;
    if (label) label.textContent = 'Refreshing';
    try {
        const refreshed = await hydrateFromSupabase();
        if (refreshed && currentUserIsModerator && !document.getElementById('tab-moderation').classList.contains('hidden')) {
            await window.loadModerationQueue();
        }
        showToast(refreshed ? 'All app data refreshed.' : (window.lastSupabaseError || 'Data could not be refreshed. Try again.'));
    } finally {
        if (button) button.disabled = false;
        if (label) label.textContent = 'Refresh';
    }
};

// ============================ messages ============================
window.openConnectionMessage = function(recipientId) { openMessageModal(labelFor(recipientId) || 'Connection', recipientId); };
window.openMessageModal = function(name, recipientId) {
    const rel = getConnectionBetween(me().id, recipientId);
    if (!rel || rel.status !== 'accepted') return showToast('Messaging is available after the connection is accepted.');
    const modal = document.getElementById('message-modal');
    document.getElementById('message-title').textContent = `Message ${name}`;
    modal.dataset.person = name;
    modal.dataset.recipientId = recipientId || '';
    activeMessageRecipientId = recipientId || '';
    const readState = getStore('cslid_message_read', {});
    readState[recipientId] = Date.now();
    setStore('cslid_message_read', readState);
    renderMessages(recipientId);
    renderConnections();
    openModal('message-modal');
};
window.closeMessageModal = function() { closeModal('message-modal'); activeMessageRecipientId = ''; };

function renderMessages(threadKey) {
    const arr = getStore('cslid_messages', {})[threadKey] || [];
    const thread = document.getElementById('message-thread');
    thread.innerHTML = arr.length ? arr.map(m => `<div class="${m.me ? 'text-right' : ''}"><span class="inline-block max-w-[85%] rounded-xl px-3 py-2 text-xs ${m.me ? 'bg-indigo-600' : 'bg-gray-900 text-gray-300'}">${escapeHtml(m.text)}</span></div>`).join('')
        : '<div class="text-center text-gray-600 text-xs py-16">No messages yet. Start the conversation.</div>';
    thread.scrollTop = thread.scrollHeight;
}
window.sendMessage = async function() {
    const input = document.getElementById('message-input'), text = input.value.trim();
    if (!text) return;
    const authUser = await getLiveUserForWrite();
    if (!authUser) return;
    const recipientId = document.getElementById('message-modal').dataset.recipientId;
    if (!recipientId || recipientId === authUser.id) return showToast('This entry cannot receive messages.');
    const rel = getConnectionBetween(authUser.id, recipientId);
    if (!rel || rel.status !== 'accepted') return showToast('Messaging is available after the connection is accepted.');
    if (!allowLocalAction('cslid_message_attempts', 100, 60 * 60 * 1000)) return showToast('Hourly message limit reached. Please try again later.');
    let saved;
    try { saved = await window.sendMessageToSupabase(recipientId, text); }
    catch (error) { return showToast(`Could not send message: ${error.message || 'Please try again.'}`); }
    if (window.SUPABASE_CONFIGURED && !saved) return showToast(window.lastSupabaseError || 'Could not send the message. Please try again.');
    const all = getStore('cslid_messages', {});
    all[recipientId] = all[recipientId] || [];
    all[recipientId].push({text, me: true, time: saved?.created_at || Date.now()});
    setStore('cslid_messages', all);
    input.value = '';
    renderMessages(recipientId);
    renderConnections();
};
window.blockCurrentUser = async function() {
    const recipientId = document.getElementById('message-modal')?.dataset.recipientId;
    if (!recipientId) return showToast('This user cannot be blocked.');
    if (!window.confirm('Block this user? They will no longer be able to connect or message you.')) return;
    if (await window.callSupabaseFunction('block_user', {p_blocked_id: recipientId}) === null) return showToast('Could not block this user. Please try again.');
    closeMessageModal();
    await hydrateFromSupabase();
    renderConnections();
    showToast('User blocked.');
};
window.reportUser = async function(reportedId) {
    if (!me().id) return showToast('Sign in before submitting a report.');
    if (!reportedId || reportedId === me().id) return showToast('This profile cannot be reported.');
    const reason = window.prompt('Why are you reporting this profile?');
    if (!reason?.trim()) return;
    if (reason.trim().length > 1000) return showToast('Keep the report reason under 1000 characters.');
    if (await window.callSupabaseFunction('report_user', {p_reported_id: reportedId, p_reason: reason.trim()}) === null) return showToast(window.lastSupabaseError || 'Could not submit the report. Please try again.');
    showToast('Report submitted. Thank you.');
};
window.reportCurrentUser = async function() {
    const recipientId = document.getElementById('message-modal')?.dataset.recipientId;
    return window.reportUser(recipientId);
};
window.reportPost = async function(postId) {
    if (!me().id) return showToast('Sign in before submitting a report.');
    if (!postId) return showToast('This post cannot be reported.');
    const reason = window.prompt('Why are you reporting this post?');
    if (!reason?.trim()) return;
    if (reason.trim().length > 1000) return showToast('Keep the report reason under 1000 characters.');
    if (await window.callSupabaseFunction('report_post', {p_post_id: postId, p_reason: reason.trim()}) === null) {
        return showToast(window.lastSupabaseError || 'Could not submit the report. Please try again.');
    }
    showToast('Post report submitted. Thank you.');
};

async function refreshModeratorAccess() {
    currentUserIsModerator = false;
    if (me().id && window.SUPABASE_CONFIGURED) {
        const result = await window.callSupabaseFunction('is_cslid_moderator');
        currentUserIsModerator = result === true;
    }
    updateUserUI();
    return currentUserIsModerator;
}

window.loadModerationQueue = async function() {
    const container = document.getElementById('moderation-queue');
    if (!container) return;
    if (!currentUserIsModerator) {
        container.innerHTML = '<div class="vl-empty">Moderator access is required to view reports.</div>';
        return;
    }
    container.innerHTML = '<div class="vl-empty">Loading reports…</div>';
    const includeClosed = document.getElementById('moderation-include-closed')?.checked || false;
    const reports = await window.callSupabaseFunction('moderation_queue', {p_include_closed: includeClosed});
    if (!Array.isArray(reports)) {
        container.innerHTML = '<div class="vl-empty">Could not load reports. Refresh and try again.</div>';
        return;
    }
    if (!reports.length) {
        container.innerHTML = '<div class="vl-empty">No reports to review.</div>';
        return;
    }
    container.innerHTML = reports.map(report => `
        <article class="glass p-5 rounded-3xl border border-gray-800 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div><p class="text-sm font-bold">${escapeHtml(report.reported_post_id ? 'Post report' : 'Profile report')}</p>
                    <p class="text-[10px] text-gray-500">Reported ${escapeHtml(report.reported_name || String(report.reported_id).slice(0, 8))} · ${escapeHtml(formatWhen(report.created_at))}</p></div>
                <span class="vl-pill">${escapeHtml(report.status)}</span>
            </div>
            <p class="text-sm text-gray-300"><strong>Reason:</strong> ${escapeHtml(report.reason)}</p>
            ${report.post_content ? `<blockquote class="border-l-2 border-indigo-500 pl-3 text-xs text-gray-400">${escapeHtml(report.post_content)}</blockquote>` : ''}
            ${report.resolution_note ? `<p class="text-xs text-gray-500"><strong>Review note:</strong> ${escapeHtml(report.resolution_note)}</p>` : ''}
            ${report.status === 'open' ? `<div class="flex flex-wrap gap-2 pt-2">
                <button onclick="window.reviewReport('${escapeHtml(report.id)}','reviewed')" class="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold">Mark reviewed</button>
                <button onclick="window.reviewReport('${escapeHtml(report.id)}','dismissed')" class="px-3 py-2 rounded-lg bg-gray-800 text-gray-200 text-xs font-bold">Dismiss</button>
            </div>` : ''}
        </article>`).join('');
};
window.reviewReport = async function(reportId, status) {
    if (!currentUserIsModerator || !reportId || !['reviewed', 'dismissed'].includes(status)) {
        return showToast('Moderator access is required to update reports.');
    }
    const note = window.prompt('Optional moderation note (max 1000 characters):');
    if (note === null) return;
    if (note.length > 1000) return showToast('Keep the moderation note under 1000 characters.');
    const saved = await window.callSupabaseFunction('review_report', {
        p_report_id: reportId, p_status: status, p_note: note.trim() || null
    });
    if (saved !== true) return showToast(window.lastSupabaseError || 'Could not update this report.');
    await window.loadModerationQueue();
    showToast(status === 'reviewed' ? 'Report marked reviewed.' : 'Report dismissed.');
};

// ============================ launch center ============================
window.openLaunchCenter = function() {
    if (me().role !== 'founder') return showToast('Launch Center is available to founder accounts.');
    renderLaunchCenter();
    openModal('launch-center');
};
window.closeLaunchCenter = () => closeModal('launch-center');

function renderLaunchCenter() {
    const s = getStore('cslid_startup', null), u = getStore('cslid_user', null);
    const posts = getStore('cslid_posts', []).filter(p => p.userId === u?.id);
    const rows = getConnectionRows();
    const incoming = rows.filter(i => i.recipient_id === u?.id && i.status === 'requested');
    const accepted = rows.filter(i => i.status === 'accepted');
    const checks = [
        ['Account created', !!u, 'Create your founder account', 'account'],
        ['Startup created', !!s, 'Add your startup details', 'startup'],
        ['Startup description', !!s?.tagline, 'Add a clear one-line pitch', 'description'],
        ['Problem defined', !!s?.problem, 'Explain the problem', 'problem'],
        ['First post', posts.length > 0, 'Publish your first journey update', 'post'],
        ['First connection', accepted.length > 0, 'Connect with someone in the directory', 'connection'],
        ['Pitch ready', getStore('cslid_pitch_ready', false), 'Complete your pitch deck', 'pitch'],
        ['Launch page', !!s, 'Preview your public startup page', 'launch']
    ];
    const pct = Math.round(checks.filter(c => c[1]).length / checks.length * 100);
    document.getElementById('launch-kpis').innerHTML = [['Progress', pct + '%'], ['Posts', posts.length], ['Connections', accepted.length], ['Stage', s?.stage || '—']]
        .map(x => `<div class="vl-kpi"><strong>${escapeHtml(x[1])}</strong><span>${escapeHtml(x[0])}</span></div>`).join('');
    document.getElementById('launch-checklist').innerHTML = checks.map(c => `
        <div class="vl-row">
            <div class="w-8 h-8 rounded-lg ${c[1] ? 'bg-emerald-500/15' : 'bg-gray-900'} flex items-center justify-center"><i class="fa-solid ${c[1] ? 'fa-check text-emerald-400' : 'fa-arrow-right text-gray-500'} text-xs"></i></div>
            <div class="grow"><p class="text-xs font-bold">${c[0]}</p><p class="vl-muted">${c[1] ? 'Completed' : c[2]}</p></div>
            ${!c[1] ? `<button onclick="launchChecklistAction('${c[3]}')" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold">Do it</button>` : ''}
        </div>`).join('');
    const requests = document.getElementById('launch-connections');
    if (!requests) return;
    requests.innerHTML = incoming.length ? `
        <div class="flex items-center justify-between"><h4 class="text-sm font-bold">Incoming connection requests</h4><span class="vl-pill">${incoming.length}</span></div>
        ${incoming.map(i => `<div class="vl-row">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center"><i class="fa-solid fa-user text-indigo-400 text-xs"></i></div>
            <div class="grow"><p class="text-xs font-bold">${escapeHtml(labelFor(i.requester_id))}</p><p class="vl-muted">Would like to connect with you</p></div>
            <div class="flex gap-2">
                <button onclick="respondToConnection('${i.id}','accept')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold">Accept</button>
                <button onclick="respondToConnection('${i.id}','reject')" class="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-[10px] font-bold">Reject</button>
            </div></div>`).join('')}`
        : '<div class="rounded-2xl border border-gray-800 bg-gray-950/40 p-4"><p class="text-xs font-bold">Connection requests</p><p class="text-[10px] text-gray-500 mt-1">Incoming requests will appear here when someone wants to connect.</p></div>';
}
window.renderLaunchCenter = renderLaunchCenter;

window.launchChecklistAction = function(action) {
    closeLaunchCenter();
    if (action === 'account') openModal('auth-modal');
    else if (['startup', 'description', 'problem'].includes(action)) openStartupModal();
    else if (action === 'post') { switchTab('feed'); setTimeout(openPostModal, 80); }
    else if (action === 'connection') switchTab('directory');
    else if (action === 'pitch') openPitchModal();
    else if (action === 'launch') openPublicStartup();
};

window.openPublicStartup = function() {
    const s = getStore('cslid_startup', null), c = document.getElementById('public-startup-content');
    c.innerHTML = !s ? '<div class="vl-empty">Create your startup first.</div>' : `
        <div class="text-center py-5">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-pink-500 to-amber-400 mx-auto flex items-center justify-center"><i class="fa-solid fa-rocket text-white text-xl"></i></div>
            <p class="text-[10px] uppercase tracking-widest text-gray-500 mt-4">${escapeHtml(s.stage)} · ${escapeHtml(s.sector || 'Startup')}</p>
            <h2 class="text-3xl font-extrabold mt-2">${escapeHtml(s.name)}</h2>
            <p class="text-gray-400 mt-2">${escapeHtml(s.tagline)}</p>
            <div class="mt-6 text-left p-4 rounded-2xl bg-gray-950 border border-gray-800"><p class="text-[10px] uppercase tracking-widest text-gray-500">Problem</p><p class="text-sm text-gray-300 mt-2">${escapeHtml(s.problem || 'Not added yet.')}</p></div>
        </div>`;
    openModal('public-startup-modal');
};
window.closePublicStartup = () => closeModal('public-startup-modal');

// ============================ pitch builder ============================
window.openPitchModal = function() {
    const s = getStore('cslid_startup', null) || {};
    const name = document.getElementById('pitch-name'), concept = document.getElementById('pitch-concept');
    if (name) name.value = s.name || 'Your startup';
    if (concept) concept.value = s.problem || 'AI workflow automation for fast-moving teams';
    generatePitch();
    openModal('pitch-modal');
};
window.closePitchModal = () => closeModal('pitch-modal');
window.generatePitch = function() {
    const name = (document.getElementById('pitch-name')?.value || '').trim() || 'Your startup';
    const concept = (document.getElementById('pitch-concept')?.value || '').trim() || 'AI workflow automation for fast-moving teams';
    const out = document.getElementById('pitch-output');
    if (!out) return;
    out.innerHTML = `
        <div class="space-y-3">
            <div class="flex items-center justify-between"><span class="text-[10px] uppercase tracking-widest text-indigo-400 font-bold">Investor pitch (draft template)</span></div>
            <p class="text-sm leading-relaxed text-gray-200">"Hi, I'm the founder of <strong class="text-white">${escapeHtml(name)}</strong>. We are building <strong class="text-white">${escapeHtml(concept)}</strong>. We are looking to speak with investors and partners who are interested in this problem space and can help us validate the opportunity."</p>
        </div>`;
};
window.copyPitchText = function() {
    const text = document.getElementById('pitch-output')?.innerText || '';
    if (!text) return showToast('Generate a pitch first.');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('Pitch copied to clipboard!')).catch(() => showToast('Pitch ready to copy.'));
    else showToast('Pitch ready to copy.');
};
window.markPitchReady = async function() {
    const authUser = await getLiveUserForWrite();
    if (!authUser) return;
    const saved = await saveToSupabase('cslid_tasks', {user_id: authUser.id, task_key: 'pitch_ready', complete: true}, 'user_id,task_key');
    if (!saved) return showToast(window.lastSupabaseError || 'Could not save. Please try again.');
    setStore('cslid_pitch_ready', true);
    showToast('Pitch marked ready!');
    renderLaunchCenter();
};

// ============================ data sync ============================
async function hydrateFromSupabase() {
    if (!window.SUPABASE_CONFIGURED || refreshInProgress) return false;
    const userId = me().id;
    if (!userId) return false;
    refreshInProgress = true;
    try {
        const [posts, startups, connections, matches, messages, tasks, profiles] = await Promise.all([
            fetchFromSupabase('cslid_posts', {order: 'created_at', limit: 100}),
            fetchFromSupabase('cslid_startups'),
            fetchFromSupabase('cslid_connections'),
            fetchFromSupabase('cslid_matches'),
            fetchFromSupabase('cslid_messages', {order: 'created_at', ascending: false, limit: 1000}),
            fetchFromSupabase('cslid_tasks'),
            fetchFromSupabase('cslid_profiles')
        ]);
        if ([posts, startups, connections, matches, messages, tasks, profiles].some(x => x === null)) return false; // keep cache on errors

        setStore('cslid_public_profiles', profiles);
        const ownProfile = profiles.find(i => i.user_id === userId);
        if (ownProfile) setStore('cslid_profile', {name: ownProfile.name || '', startup: ownProfile.startup || ''});

        feedPosts.length = 0;
        posts.forEach(p => feedPosts.push({id: p.id, userId: p.user_id, author: p.author || 'Member', role: p.role || '',
            time: p.created_at || '', content: p.content, tags: p.tags || []}));
        setStore('cslid_posts', feedPosts);

        directoryStartups = startups.map(s => ({id: s.id, userId: s.user_id, name: s.name, sector: s.sector || 'Startup',
            stage: s.stage || 'Early Stage', location: s.location || 'Location not provided', raise: s.seeking || 'Not specified',
            isPublic: s.is_public !== false}));
        const toLocal = s => ({id: s.id, userId: s.user_id, name: s.name, tagline: s.tagline, stage: s.stage, sector: s.sector,
            problem: s.problem, location: s.location, seeking: s.seeking, traction: s.traction, contactUrl: s.contact_url, isPublic: s.is_public !== false});
        setStore('cslid_startups', startups.map(toLocal));
        const own = startups.find(s => s.user_id === userId);
        if (own) setStore('cslid_startup', toLocal(own));

        setStore('cslid_connections', connections.filter(i => i.requester_id === userId || i.recipient_id === userId));
        setStore('cslid_matches', matches.filter(i => i.user_id === userId || i.matched_user_id === userId).map(i => ({
            id: i.id, userId: i.user_id === userId ? i.matched_user_id : i.user_id, matchedAt: i.matched_at})));
        const threads = {};
        messages.reverse().forEach(m => {
            const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
            (threads[other] = threads[other] || []).push({text: m.content, me: m.sender_id === userId, time: m.created_at});
        });
        setStore('cslid_messages', threads);
        const pitch = tasks.find(t => t.user_id === userId && t.task_key === 'pitch_ready');
        setStore('cslid_pitch_ready', Boolean(pitch?.complete));

        renderFeed(); filterDirectory(); refreshMatchProfiles();
        if (!document.getElementById('tab-connections').classList.contains('hidden')) renderConnections();
        if (activeMessageRecipientId && !document.getElementById('message-modal').classList.contains('hidden')) renderMessages(activeMessageRecipientId);
        return true;
    } finally { refreshInProgress = false; }
}

function startRealtimeUpdates() {
    if (unsubscribeFromRealtime) unsubscribeFromRealtime();
    unsubscribeFromRealtime = window.subscribeToSupabaseChanges(() => {
        clearTimeout(hydrateTimer);
        hydrateTimer = setTimeout(async () => {
            await hydrateFromSupabase();
            if (currentUserIsModerator && !document.getElementById('tab-moderation').classList.contains('hidden')) {
                await window.loadModerationQueue();
            }
        }, 500);
    });
}

// ============================ init ============================
window.onload = async function() {
    window.setAuthMode('signup');
    window.onSupabaseAuthStateChange((event, authUser) => {
        // Never call Supabase directly inside this callback (can deadlock); defer.
        setTimeout(async () => {
            if (event === 'PASSWORD_RECOVERY') { window.setAuthMode('reset'); openModal('auth-modal'); return; }
            if (authUser && ['SIGNED_IN', 'USER_UPDATED'].includes(event)) {
                const previous = me();
                try {
                    const pending = getPendingGoogleAccount();
                    const account = await ensureAccountRows(authUser, pending?.role, pending?.name);
                    if (!account) {
                        localStorage.removeItem('cslid_user');
                        window.setAuthMode('signup');
                        openModal('auth-modal');
                        showToast('Choose a role and continue with Google to finish creating your account.');
                        return;
                    }
                    setStore('cslid_user', {id: authUser.id, name: account.name, email: authUser.email, role: account.role});
                    updateUserUI();
                    await refreshModeratorAccess();
                    closeModal('auth-modal');
                    await hydrateFromSupabase();
                    startRealtimeUpdates();
                    if (previous.id !== authUser.id) window.openRoleHome();
                } catch (error) {
                    console.error('Could not finish signing in:', error.message);
                    window.setAuthMode('signup');
                    openModal('auth-modal');
                    showToast(error.message || 'Could not finish signing in. Please try again.');
                }
            } else if (event === 'SIGNED_OUT') {
                if (unsubscribeFromRealtime) { unsubscribeFromRealtime(); unsubscribeFromRealtime = null; }
                currentUserIsModerator = false;
                clearLocalAccountData();
                updateUserUI();
                openModal('auth-modal');
            }
        }, 0);
    });

    if (window.SUPABASE_CONFIGURED) {
        const authUser = (await window.getSupabaseSession())?.user || null;
        if (authUser) {
            try {
                const pending = getPendingGoogleAccount();
                const account = await ensureAccountRows(authUser, pending?.role, pending?.name);
                if (account) {
                    setStore('cslid_user', {id: authUser.id, name: account.name, email: authUser.email, role: account.role});
                    await refreshModeratorAccess();
                } else {
                    localStorage.removeItem('cslid_user');
                    showToast('Choose a role and continue with Google to finish creating your account.');
                }
            } catch (error) {
                localStorage.removeItem('cslid_user');
                console.error('Could not restore your account:', error.message);
                showToast(error.message || 'Could not restore your account. Please try again.');
            }
        } else clearLocalAccountData();
    }
    await hydrateFromSupabase();
    if (getStore('cslid_user', null)) await refreshModeratorAccess();
    if (getStore('cslid_user', null)) startRealtimeUpdates();
    refreshMatchProfiles(); renderFeed(); filterDirectory(); updateUserUI();
    if (getStore('cslid_user', null)) window.openRoleHome();
    else setTimeout(() => {
        openModal('auth-modal');
        if (!window.SUPABASE_CONFIGURED) showToast(window.lastSupabaseError || 'Supabase is not configured.');
    }, 250);

    document.getElementById('message-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); window.sendMessage(); }
    });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('[id$="-modal"]:not(.hidden), #launch-center:not(.hidden)').forEach(m => { if (m.id !== 'auth-modal') closeModal(m.id); });
    });
    window.setInterval(() => {
        if (!document.hidden && getStore('cslid_user', null)) hydrateFromSupabase();
    }, 60000);
};