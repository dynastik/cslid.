// Paste the public values from your Supabase Dashboard here.
        const SUPABASE_URL = "https://tudqrcmdncncoqctfdrj.supabase.co/rest/v1/";
        const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZHFyY21kbmNuY29xY3RmZHJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzc3ODYsImV4cCI6MjEwNTY1Mzc4Nn0.BPcwINWu203NrWqj17-5wwcPqk8all8uhOhwmDr4860";
        const SUPABASE_CONFIGURED = Boolean(
            SUPABASE_URL &&
            SUPABASE_ANON_KEY &&
            SUPABASE_ANON_KEY !== "******" &&
            !SUPABASE_ANON_KEY.includes("your-actual")
        );
        window.SUPABASE_CONFIGURED = SUPABASE_CONFIGURED;
        window.SUPABASE_CONFIGURATION_ERROR = SUPABASE_CONFIGURED
            ? ''
            : 'Supabase is not configured. Add the anon public key in js/supabase.js.';
        const SUPABASE_BASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "");

        // The anon key is designed for browser use; protect your database with RLS policies.
        const supabaseClient = window.supabase.createClient(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: window.localStorage
            }
        });
        async function loadData() {
            if (!SUPABASE_CONFIGURED) {
                console.info("Supabase is ready for configuration. Add your project URL and anon key.");
                return;
            }
            console.info("Supabase client initialized. Run supabase-schema.sql to create the cslid tables.");
        }

        async function saveToSupabase(table, row) {
            if (!SUPABASE_CONFIGURED) return null;
            const { data, error } = await supabaseClient.from(table).upsert(row).select().single();
            if (error) {
                console.error(`Supabase ${table} save failed:`, error.message);
                return null;
            }
            return data;
        }
        async function sendMessageToSupabase(recipientId, content) {
            if (!SUPABASE_CONFIGURED) return null;
            const { data, error } = await supabaseClient.rpc('send_connection_message', {
                p_recipient_id: recipientId,
                p_content: content
            });
            if (error) {
                console.error('Supabase message send failed:', error.message);
                throw error;
            }
            return data;
        }
        async function fetchFromSupabase(table) {
            if (!SUPABASE_CONFIGURED) return [];
            const { data, error } = await supabaseClient.from(table).select('*');
            if (error) {
                console.error(`Supabase ${table} load failed:`, error.message);
                return [];
            }
            return data || [];
        }
        async function updateSupabase(table, filters, changes) {
            if (!SUPABASE_CONFIGURED) return null;
            let query = supabaseClient.from(table).update(changes).select().single();
            Object.entries(filters || {}).forEach(([column, value]) => {
                query = query.eq(column, value);
            });
            const { data, error } = await query;
            if (error) {
                console.error(`Supabase ${table} update failed:`, error.message);
                return null;
            }
            return data;
        }
        async function callSupabaseFunction(name, parameters = {}) {
            if (!SUPABASE_CONFIGURED) return null;
            const { data, error } = await supabaseClient.rpc(name, parameters);
            if (error) {
                console.error(`Supabase function ${name} failed:`, error.message);
                return null;
            }
            return data;
        }
        function subscribeToSupabaseChanges(callback) {
            if (!SUPABASE_CONFIGURED) return () => {};
            const channel = supabaseClient
                .channel('cslid-live-updates')
                .on('postgres_changes', {event: '*', schema: 'public', table: 'cslid_messages'}, callback)
                .on('postgres_changes', {event: '*', schema: 'public', table: 'cslid_connections'}, callback)
                .on('postgres_changes', {event: '*', schema: 'public', table: 'cslid_matches'}, callback)
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error(`Supabase realtime subscription ${status.toLowerCase()}.`);
                    }
                });
            return () => supabaseClient.removeChannel(channel);
        }
        async function getSupabaseUser() {
            if (!SUPABASE_CONFIGURED) return null;
            const { data, error } = await supabaseClient.auth.getUser();
            if (error) {
                if (error.message !== 'Auth session missing!') {
                    console.error('Supabase user lookup failed:', error.message);
                }
                return null;
            }
            return data.user || null;
        }
        async function getSupabaseSession() {
            if (!SUPABASE_CONFIGURED) return null;
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) {
                console.error('Supabase session lookup failed:', error.message);
                return null;
            }
            return data.session || null;
        }
        async function requireSupabaseUser() {
            const user = await getSupabaseUser();
            if (!user) throw new Error('You must be signed in to perform this action.');
            return user;
        }
        function onSupabaseAuthStateChange(callback) {
            if (!SUPABASE_CONFIGURED) return () => {};
            const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
                callback(event, session ? session.user : null);
            });
            return () => data.subscription.unsubscribe();
        }
        async function signUpWithPassword(email, password, name, role) {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { name, role },emailRedirectTo: window.location.href }
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
        window.saveToSupabase = saveToSupabase;
        window.sendMessageToSupabase = sendMessageToSupabase;
        window.fetchFromSupabase = fetchFromSupabase;
        window.updateSupabase = updateSupabase;
        window.callSupabaseFunction = callSupabaseFunction;
        window.subscribeToSupabaseChanges = subscribeToSupabaseChanges;
        window.getSupabaseUser = getSupabaseUser;
        window.getSupabaseSession = getSupabaseSession;
        window.requireSupabaseUser = requireSupabaseUser;
        window.onSupabaseAuthStateChange = onSupabaseAuthStateChange;
        window.signUpWithPassword = signUpWithPassword;
        window.signInWithPassword = signInWithPassword;
        window.resetPasswordForEmail = resetPasswordForEmail;
        window.updatePassword = updatePassword;
        window.signOutUser = signOutUser;

        loadData();
