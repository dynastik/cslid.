// Public values from your Supabase Dashboard (the anon key is designed for browsers; RLS protects data).
const SUPABASE_URL = "https://tudqrcmdncncoqctfdrj.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZHFyY21kbmNuY29xY3RmZHJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzc3ODYsImV4cCI6MjEwNTY1Mzc4Nn0.BPcwINWu203NrWqj17-5wwcPqk8all8uhOhwmDr4860";
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== "******" && !SUPABASE_ANON_KEY.includes("your-actual"));
window.SUPABASE_CONFIGURED = SUPABASE_CONFIGURED;
window.lastSupabaseError = '';
const SUPABASE_BASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "");

const supabaseClient = window.supabase.createClient(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage }
});

function recordError(label, error) {
    window.lastSupabaseError = error.message;
    console.error(`${label}:`, error.message);
}

async function saveToSupabase(table, row, onConflict) {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabaseClient.from(table)
        .upsert(row, onConflict ? { onConflict } : undefined).select().single();
    if (error) { recordError(`Supabase ${table} save failed`, error); return null; }
    return data;
}
async function sendMessageToSupabase(recipientId, content) {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabaseClient.rpc('send_connection_message', { p_recipient_id: recipientId, p_content: content });
    if (error) { recordError('Supabase message send failed', error); throw error; }
    return data;
}
// Returns null on error (not []), so callers keep their cache instead of wiping the UI.
async function fetchFromSupabase(table, opts = {}) {
    if (!SUPABASE_CONFIGURED) return [];
    let query = supabaseClient.from(table).select(opts.columns || '*');
    if (opts.order) query = query.order(opts.order, { ascending: !!opts.ascending });
    if (opts.limit) query = query.limit(opts.limit);
    const { data, error } = await query;
    if (error) { console.error(`Supabase ${table} load failed:`, error.message); return null; }
    return data || [];
}
async function callSupabaseFunction(name, parameters = {}) {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabaseClient.rpc(name, parameters);
    if (error) { recordError(`Supabase function ${name} failed`, error); return null; }
    return data;
}
function subscribeToSupabaseChanges(callback) {
    if (!SUPABASE_CONFIGURED) return () => {};
    const channel = supabaseClient.channel('cslid-live-updates');
    ['cslid_messages', 'cslid_connections', 'cslid_matches'].forEach(table =>
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, callback));
    channel.subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`Supabase realtime ${status.toLowerCase()}.`);
    });
    return () => supabaseClient.removeChannel(channel);
}
async function getSupabaseUser() {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) {
        if (error.message !== 'Auth session missing!') console.error('Supabase user lookup failed:', error.message);
        return null;
    }
    return data.user || null;
}
async function getSupabaseSession() {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) { console.error('Supabase session lookup failed:', error.message); return null; }
    return data.session || null;
}
function onSupabaseAuthStateChange(callback) {
    if (!SUPABASE_CONFIGURED) return () => {};
    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => callback(event, session ? session.user : null));
    return () => data.subscription.unsubscribe();
}
async function signUpWithPassword(email, password, name, role) {
    const { data, error } = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { name, role }, emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
    return data;
}
async function signInWithPassword(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}
async function resetPasswordForEmail(email, redirectTo) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
}
async function updatePassword(password) {
    const { data, error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    return data;
}
async function signOutUser() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
}

Object.assign(window, {
    saveToSupabase, sendMessageToSupabase, fetchFromSupabase, callSupabaseFunction,
    subscribeToSupabaseChanges, getSupabaseUser, getSupabaseSession, onSupabaseAuthStateChange,
    signUpWithPassword, signInWithPassword, resetPasswordForEmail, updatePassword, signOutUser
});