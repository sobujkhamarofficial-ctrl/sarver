(() => {
  'use strict';

  const SERVER_AUTH_GATE_MODE = true; // All dashboard access must pass the server-side password + six-digit code gate.
  const OWNER_EMAIL = 'sobujkhamar.official@gmail.com';
  let secureGateChallengeToken = '';
  const AUTH_REDIRECT_URL = 'https://sobujkhamarofficial-ctrl.github.io/sarver/';
  const SUPABASE_URL = 'https://gkmfjvlptyvsmlgpfpuz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nY1J3hCTMCz4tZ996nSo8g_ee1OdYno';
  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const state = {
    user: null,
    previewMode: false,
    previewEmail: '',
    mathAnswer: null,
    isDemoData: false,
    view: 'overview',
    authMode: 'signin',
    campaigns: [],
    metrics: [],
    tasks: [],
    signals: [],
    experiments: [],
    links: [],
    history: [],
    targets: [],
    googleAdsAccountIds: [],
    agentTokens: [],
    loading: false,
    taskFilter: 'open',
    range: 14
  };

  const viewTitles = {
    overview: 'Overview',
    campaigns: 'Campaigns',
    diagnostics: 'Diagnostics',
    tasks: 'Optimization queue',
    experiments: 'Experiments',
    tracking: 'Tracking toolkit',
    integrations: 'Integrations',
    history: 'Optimization memory'
  };

  const platformLabels = {
    facebook: 'Meta Ads',
    google: 'Google Ads',
    tiktok: 'TikTok Ads',
    youtube: 'YouTube Ads',
    instagram: 'Instagram Ads',
    linkedin: 'LinkedIn Ads',
    other: 'Other'
  };

  const signalLabels = {
    targets_not_configured: 'Campaign targets are missing',
    no_recent_metrics: 'No recent metrics received',
    ctr_drop: 'CTR has dropped',
    cpc_increase: 'CPC has increased',
    cpa_increase: 'CPA has increased',
    roas_drop: 'ROAS has declined',
    spend_rising_without_conversion_lift: 'Spend is rising without conversion lift',
    daily_spend_limit_exceeded: 'Daily spend limit exceeded'
  };

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setMessage(element, message, type) {
    if (!element) return;
    element.textContent = message || '';
    element.className = 'inline-message' + (type ? ' ' + type : '');
  }

  function toast(message, type) {
    const region = $('#toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'toast ' + (type || 'info');
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 4600);
  }

  function errorMessage(error) {
    if (!error) return 'Something went wrong. Please try again.';
    const message = String(error.message || error);
    if (/Invalid login credentials/i.test(message)) return 'Password may be incorrect. Use “Forgot password?” to set a new one.';
    if (/Email not confirmed/i.test(message)) return 'Your email is not confirmed yet. Check your inbox for the confirmation link before signing in, or resend the confirmation email.';
    if (/User already registered/i.test(message)) return 'An account with this email already exists. Try signing in.';
    if (/Password should be at least/i.test(message)) return 'Choose a stronger password with at least 8 characters.';
    if (/row-level security|permission denied|not allowed/i.test(message)) return 'The request was blocked by database permissions. Confirm you are signed in and try again.';
    if (/Failed to fetch|NetworkError/i.test(message)) return 'Could not reach Supabase. Check your connection and try again.';
    return message;
  }

  function money(value, compact) {
    const n = Number(value || 0);
    if (compact && Math.abs(n) >= 1000000) return '৳' + (n / 1000000).toFixed(1) + 'm';
    if (compact && Math.abs(n) >= 1000) return '৳' + (n / 1000).toFixed(1) + 'k';
    return '৳' + new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(n);
  }

  function number(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function decimal(value, places) {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: places === undefined ? 2 : places });
  }

  function ratio(value) {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value).toFixed(2) + '×';
  }

  function dateOnly(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function dateAgo(days) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return dateOnly(d);
  }

  function displayDate(value) {
    if (!value) return 'No date';
    const d = new Date(value + (String(value).length === 10 ? 'T12:00:00' : ''));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function relativeDate(value) {
    if (!value) return 'No date';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return displayDate(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  function initials(value) {
    const clean = String(value || 'Marketer').trim();
    return clean.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'M';
  }

  function escapeAttr(value) { return esc(value); }

  function activeRangeMetrics() {
    const start = dateAgo(state.range - 1);
    const end = dateOnly(new Date());
    return state.metrics.filter(m => m.metric_date >= start && m.metric_date <= end);
  }

  function metricTotals(rows) {
    return rows.reduce((acc, row) => {
      acc.spend += Number(row.spend || 0);
      acc.impressions += Number(row.impressions || 0);
      acc.clicks += Number(row.clicks || 0);
      acc.conversions += Number(row.conversions || 0);
      acc.revenue += Number(row.revenue || 0);
      return acc;
    }, { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
  }

  function derived(rows) {
    const t = metricTotals(rows);
    return {
      spend: t.spend,
      impressions: t.impressions,
      clicks: t.clicks,
      conversions: t.conversions,
      revenue: t.revenue,
      ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
      cpc: t.clicks ? t.spend / t.clicks : null,
      cpa: t.conversions ? t.spend / t.conversions : null,
      roas: t.spend ? t.revenue / t.spend : null
    };
  }

  function campaignMetrics(campaignId, rows) {
    return derived((rows || activeRangeMetrics()).filter(row => row.campaign_id === campaignId));
  }

  function statusPill(status) {
    const clean = String(status || 'unknown').toLowerCase();
    return '<span class="status-pill ' + esc(clean) + '">' + esc(clean.replace('_', ' ')) + '</span>';
  }

  function platformPill(platform) {
    const label = platformLabels[platform] || platform || 'Unknown';
    return '<span class="platform-pill"><i class="platform-dot"></i>' + esc(label) + '</span>';
  }

  function priorityPill(priority) {
    const clean = String(priority || 'medium').toLowerCase();
    return '<span class="priority-pill ' + esc(clean) + '">' + esc(clean) + '</span>';
  }

  function nextPreviewMathChallenge() {
    const first = 1 + Math.floor(Math.random() * 10);
    const second = 1 + Math.floor(Math.random() * 10);
    state.mathAnswer = first + second;
    $('#math-question').textContent = first + ' + ' + second + ' = ?';
    $('#auth-math').value = '';
  }


  function configureSecureGateLogin() {
    state.previewMode = false;
    state.user = null;
    secureGateChallengeToken = '';
    $('#auth-screen').classList.remove('hidden');
    $('#app-shell').classList.add('hidden');
    $('#name-field').classList.add('hidden');
    $('#name-field').querySelector('input').required = false;
    $('#password-field').classList.remove('hidden');
    $('#auth-password').required = true;
    $('#auth-password').autocomplete = 'current-password';
    $('#auth-password').value = '';
    $('#math-field').classList.add('hidden');
    $('#auth-math').required = false;
    $('#auth-math').value = '';
    $('#auth-email').value = OWNER_EMAIL;
    $('#auth-email').readOnly = true;
    $('.auth-tools').forEach(item => item.classList.add('hidden'));
    $('#resend-confirmation').classList.add('hidden');
    $('#auth-eyebrow').textContent = 'OWNER ACCESS ONLY';
    $('#auth-title').textContent = 'Private workspace access.';
    $('#auth-subtitle').textContent = 'Enter your access password. The owner email is fixed.';
    $('#auth-submit').innerHTML = 'Verify password <span aria-hidden="true">↗</span>';
    $('#email-field').querySelector('small').textContent = 'Fixed owner email — cannot be changed.';
    $('.auth-trust span:last-child').textContent = 'Password and confirmation code are checked on the server. Email verification is not used.';
    $('#signout-button').classList.add('hidden');
    setMessage($('#auth-message'), '', '');
  }

  async function handleSecureGateLogin(event) {
    event.preventDefault();
    if (!sb) {
      setMessage($('#auth-message'), 'The secure sign-in service is unavailable. Refresh and try again.', 'error');
      return;
    }
    const email = OWNER_EMAIL;
    const password = $('#auth-password').value;
    const code = $('#auth-math').value.trim();
    const stage = secureGateChallengeToken ? 'confirm_code' : 'password';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage($('#auth-message'), 'Enter the authorized owner email.', 'error');
      return;
    }
    if (stage === 'password' && !password) {
      setMessage($('#auth-message'), 'Enter the access password.', 'error');
      return;
    }
    if (stage === 'confirm_code' && !/^[0-9]{6}$/.test(code)) {
      setMessage($('#auth-message'), 'Enter the six-digit confirmation code.', 'error');
      return;
    }

    const button = $('#auth-submit');
    button.disabled = true;
    button.textContent = stage === 'password' ? 'Verifying password…' : 'Confirming access…';
    setMessage($('#auth-message'), '', '');
    try {
      const requestBody = { stage, email };
      if (stage === 'password') requestBody.password = password;
      else {
        requestBody.challenge_token = secureGateChallengeToken;
        requestBody.code = code;
      }
      const response = await fetch(SUPABASE_URL + '/functions/v1/auth-gate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY
        },
        cache: 'no-store',
        body: JSON.stringify(requestBody)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = response.status === 429
          ? 'Too many failed attempts. Try again in about 15 minutes.'
          : response.status === 503
            ? 'Secure login is not configured yet. The server owner must finish the one-time setup.'
            : stage === 'password'
              ? 'The owner email or access password is incorrect.'
              : 'The confirmation code is incorrect or has expired.';
        const failure = new Error(message);
        failure.status = response.status;
        throw failure;
      }

      if (stage === 'password') {
        if (payload.step !== 'confirm_code' || !payload.challenge_token) {
          throw new Error('The secure sign-in service returned an incomplete challenge. Try again.');
        }
        secureGateChallengeToken = payload.challenge_token;
        $('#password-field').classList.add('hidden');
        $('#auth-password').required = false;
        $('#auth-password').value = '';
        $('#math-field').classList.remove('hidden');
        $('#auth-math').required = true;
        $('#auth-email').readOnly = true;
        $('#auth-eyebrow').textContent = 'SECOND CHECK';
        $('#auth-title').textContent = 'Confirm your access.';
        $('#auth-subtitle').textContent = 'Password accepted. Enter the fixed six-digit confirmation code to continue.';
        button.textContent = 'Confirm code & open dashboard';
        $('#auth-math').focus();
        setMessage($('#auth-message'), 'First check passed. Complete the six-digit confirmation step.', 'info');
        return;
      }

      if (!payload.access_token || !payload.refresh_token) {
        throw new Error('The secure sign-in service returned an incomplete session. Try again.');
      }
      secureGateChallengeToken = '';
      const result = await sb.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token
      });
      if (result.error) throw new Error('Could not establish a secure session. Please try again.');
      $('#auth-password').value = '';
      $('#auth-math').value = '';
      await setSession(result.data.session);
      toast('Both access checks passed. Welcome to your workspace.', 'success');
    } catch (error) {
      if (error && (error.status === 429 || (stage === 'confirm_code' && error.status === 503))) configureSecureGateLogin();
      setMessage($('#auth-message'), error && error.message ? error.message : 'Secure sign-in failed. Try again.', 'error');
    } finally {
      button.disabled = false;
      if (button.isConnected) {
        button.innerHTML = secureGateChallengeToken
          ? 'Confirm code & open dashboard <span aria-hidden="true">↗</span>'
          : 'Verify password <span aria-hidden="true">↗</span>';
      }
    }
  }

  function configurePreviewLogin() {
    resetPreviewWorkspace();
    $('#auth-screen').classList.remove('hidden');
    $('#app-shell').classList.add('hidden');
    $('#name-field').classList.add('hidden');
    $('#name-field').querySelector('input').required = false;
    $('#password-field').classList.add('hidden');
    $('#auth-password').required = false;
    $('#math-field').classList.remove('hidden');
    $('#auth-math').required = true;
    $('.auth-tools').forEach(item => item.classList.add('hidden'));
    $('#auth-eyebrow').textContent = 'QUICK ACCESS';
    $('#auth-title').textContent = 'Open your dashboard.';
    $('#auth-subtitle').textContent = 'Enter your email address and solve the simple addition question. No password needed.';
    $('#auth-submit').innerHTML = 'Open dashboard <span aria-hidden="true">↗</span>';
    $('#email-field').querySelector('small').textContent = 'Used only to label this preview session';
    $('.auth-trust span:last-child').textContent = 'Preview only — private data and saving stay disabled.';
    $('#signout-button').classList.add('hidden');
    $('#auth-email').value = state.previewEmail || '';
    setMessage($('#auth-message'), '', '');
    nextPreviewMathChallenge();
  }

  function handlePreviewLogin(event) {
    event.preventDefault();
    const email = $('#auth-email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage($('#auth-message'), 'Enter a valid email address.', 'error');
      return;
    }
    const answerText = $('#auth-math').value.trim();
    if (!answerText || Number(answerText) !== state.mathAnswer) {
      setMessage($('#auth-message'), 'That answer is not correct. Try the new addition question.', 'error');
      nextPreviewMathChallenge();
      return;
    }

    state.previewEmail = email;
    state.user = null;
    $('#auth-screen').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    const displayName = (email.split('@')[0] || 'Preview User').replace(/[._-]+/g, ' ').split(' ').map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '').join(' ');
    $('#profile-name').textContent = displayName;
    $('#profile-email').textContent = email;
    $('#profile-avatar').textContent = initials(displayName);
    $('#topbar-avatar').textContent = initials(displayName);
    $('#data-status-text').textContent = 'Preview session · saving and private data paused';
    $('#data-status-text').parentElement.style.opacity = '1';
    $('#signout-button').classList.remove('hidden');
    renderAll();
    toast('Preview opened. The email is only a label; private data and saving remain disabled.', 'info');
  }

  function showAuthMode(mode) {
    state.authMode = ['signup','reset','update_password'].includes(mode) ? mode : 'signin';
    const signup = state.authMode === 'signup';
    const reset = state.authMode === 'reset';
    const updatePassword = state.authMode === 'update_password';
    $('#name-field').classList.toggle('hidden', !signup);
    $('#name-field').querySelector('input').required = signup;
    $('#password-field').classList.toggle('hidden', reset);
    $('#auth-title').textContent = signup ? 'Create your account.' : reset ? 'Reset your password.' : updatePassword ? 'Choose a new password.' : 'Welcome back.';
    $('#auth-eyebrow').textContent = signup ? 'GET STARTED' : reset ? 'ACCOUNT RECOVERY' : updatePassword ? 'SECURE YOUR ACCOUNT' : 'YOUR WORKSPACE';
    $('#auth-subtitle').textContent = signup
      ? 'Create an account with your email address and password to open your own workspace.'
      : reset ? 'We will send a password reset link to your email address.'
      : updatePassword ? 'Choose a new password for your account.'
      : 'Sign in to continue to your performance workspace.';
    $('#auth-submit').innerHTML = (signup ? 'Create account' : reset ? 'Send reset link' : updatePassword ? 'Update password' : 'Sign in') + ' <span aria-hidden="true">↗</span>';
    $('#auth-toggle').classList.toggle('hidden', reset || updatePassword);
    $('#auth-toggle').textContent = signup ? 'Already have an account?' : 'Create an account';
    $('#forgot-password').classList.toggle('hidden', signup || reset || updatePassword);
    $('#resend-confirmation').classList.toggle('hidden', reset || updatePassword);
    $('#auth-password').required = !reset;
    $('#auth-password').autocomplete = signup || updatePassword ? 'new-password' : 'current-password';
    $('#auth-password').placeholder = signup || updatePassword ? 'At least 8 characters' : 'Your password';
    $('#math-field').classList.add('hidden');
    $('#auth-math').required = false;
    $('.auth-tools').forEach(item => item.classList.remove('hidden'));
    $('.auth-trust span:last-child').textContent = 'Your data is private to your signed-in account.';
    setMessage($('#auth-message'), '', '');
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!sb) return setMessage($('#auth-message'), 'Supabase client did not load. Refresh the page and try again.', 'error');
    const email = $('#auth-email').value.trim().toLowerCase();
    const password = $('#auth-password').value;
    const name = $('#auth-name').value.trim();
    if (!email) { setMessage($('#auth-message'), 'Enter your email address.', 'error'); return; }
    if (state.authMode !== 'reset' && password.length < 8) { setMessage($('#auth-message'), 'Use a password with at least 8 characters.', 'error'); return; }
    if (state.authMode === 'signup' && !name) { setMessage($('#auth-message'), 'Enter your name to create an account.', 'error'); return; }

    const button = $('#auth-submit');
    const prior = button.innerHTML;
    button.disabled = true;
    button.textContent = state.authMode === 'signup' ? 'Creating account…' : state.authMode === 'reset' ? 'Sending email…' : state.authMode === 'update_password' ? 'Updating…' : 'Signing in…';
    setMessage($('#auth-message'), '', '');
    try {
      let result;
      if (state.authMode === 'signin') {
        result = await sb.auth.signInWithPassword({ email, password });
      } else if (state.authMode === 'signup') {
        result = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: AUTH_REDIRECT_URL } });
        if (result.error) throw result.error;
        if (result.data && result.data.session) {
          await setSession(result.data.session);
          return;
        }
        $('#resend-confirmation').classList.remove('hidden');
        setMessage($('#auth-message'), 'Account created. Check your email and open the confirmation link before signing in. If it does not arrive, use “Resend confirmation email”.', 'info');
        return;
      } else if (state.authMode === 'reset') {
        result = await sb.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URL });
        if (!result.error) { setMessage($('#auth-message'), 'If this email belongs to an account, a password-reset link has been sent.', 'info'); return; }
      } else if (state.authMode === 'update_password') {
        result = await sb.auth.updateUser({ password });
        if (!result.error) { showAuthMode('signin'); setMessage($('#auth-message'), 'Password updated successfully. Sign in with your new password.', 'info'); return; }
      } else {
        throw new Error('Unsupported authentication action.');
      }
      if (result && result.error) throw result.error;
      if (result && result.data && result.data.session) await setSession(result.data.session);
    } catch (error) {
      if (/Email not confirmed/i.test(String(error && error.message || error))) $('#resend-confirmation').classList.remove('hidden');
      setMessage($('#auth-message'), errorMessage(error), 'error');
    } finally {
      button.disabled = false;
      if (button.isConnected) button.innerHTML = prior;
    }
  }

  async function setSession(session) {
    const nextUser = session && session.user ? session.user : null;
    const nextId = nextUser ? nextUser.id : null;
    const currentId = state.user ? state.user.id : null;
    if (nextId === currentId && ((nextId && !$('#app-shell').classList.contains('hidden')) || (!nextId && !$('#auth-screen').classList.contains('hidden')))) return;

    state.user = nextUser;
    if (!nextUser) {
      $('#app-shell').classList.add('hidden');
      $('#auth-screen').classList.remove('hidden');
      closeSidebar();
      if (SERVER_AUTH_GATE_MODE) configureSecureGateLogin();
      return;
    }
    if (state.authMode === 'update_password') {
      $('#app-shell').classList.add('hidden');
      $('#auth-screen').classList.remove('hidden');
      return;
    }
    $('#auth-screen').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    const metadata = nextUser.user_metadata || {};
    const displayName = metadata.full_name || nextUser.email.split('@')[0] || 'Marketer';
    $('#profile-name').textContent = displayName;
    $('#profile-email').textContent = nextUser.email || 'Signed in';
    $('#profile-avatar').textContent = initials(displayName);
    $('#topbar-avatar').textContent = initials(displayName);
    await loadData();
    if (new URLSearchParams(window.location.search).has('google_ads')) handleGoogleAdsCallback();
  }

  async function queryRows(table, configure) {
    let query = sb.from(table).select('*');
    if (typeof configure === 'function') query = configure(query);
    const result = await query;
    return result;
  }

  async function loadData() {
    if (state.previewMode) {
      $('#data-status-text').textContent = state.isDemoData ? 'DEMO DATA · local preview only' : 'Dashboard preview · saving and private data paused';
      return;
    }
    if (!sb || !state.user || state.loading) return;
    state.loading = true;
    $('#data-status-text').textContent = 'Syncing workspace…';
    $('#data-status-text').parentElement.style.opacity = '.65';
    try {
      const results = await Promise.all([
        queryRows('campaign_summary', q => q.order('name', { ascending: true })),
        queryRows('daily_metrics', q => q.gte('metric_date', dateAgo(45)).lte('metric_date', dateOnly(new Date())).order('metric_date', { ascending: true })),
        queryRows('optimization_tasks', q => q.order('created_at', { ascending: false }).limit(100)),
        queryRows('campaign_diagnostic_signals', q => q.order('severity', { ascending: true })),
        queryRows('experiments', q => q.order('created_at', { ascending: false }).limit(100)),
        queryRows('tracking_links', q => q.order('created_at', { ascending: false }).limit(50)),
        queryRows('optimization_history', q => q.order('action_at', { ascending: false }).limit(100)),
        queryRows('campaign_targets', q => q.select('*'))
      ]);
      const names = ['campaigns', 'metrics', 'tasks', 'signals', 'experiments', 'links', 'history', 'targets'];
      let failed = 0;
      results.forEach((result, index) => {
        if (result.error) {
          failed++;
          console.error('AdPulse load error (' + names[index] + '):', result.error.message);
          state[names[index]] = [];
        } else {
          state[names[index]] = result.data || [];
        }
      });
      $('#data-status-text').textContent = failed ? 'Some data could not load' : 'Live workspace data';
      $('#data-status-text').parentElement.style.opacity = '1';
      if (failed) toast('Some workspace data could not be loaded. Check table permissions and try refresh.', 'error');
      renderAll();
    } catch (error) {
      console.error(error);
      $('#data-status-text').textContent = 'Sync issue';
      toast(errorMessage(error), 'error');
    } finally {
      state.loading = false;
      $('#data-status-text').parentElement.style.opacity = '1';
    }
  }

  function renderGettingStarted() {
    const host = $('#setup-steps');
    if (!host) return;
    const campaignCount = state.campaigns.length;
    const metricCount = state.metrics.length;
    const targeted = new Set(state.targets.map(t => t.campaign_id));
    const targetsComplete = campaignCount > 0 && state.campaigns.every(c => targeted.has(c.campaign_id));
    const complete = [campaignCount > 0, metricCount > 0, targetsComplete].filter(Boolean).length;

    $('#setup-progress').textContent = complete + ' of 3 complete';
    $('#setup-description').textContent = campaignCount === 0
      ? 'Start by recording a campaign, then add real results so the dashboard can calculate meaningful metrics.'
      : metricCount === 0
        ? 'Your campaigns are set up. Add daily results to unlock trends and evidence-based diagnostics.'
        : targetsComplete
          ? 'Your workspace has the basics. Review diagnostics, prioritize the next action, and keep logging results.'
          : 'Add daily data and campaign goals. The app will calculate KPIs and surface checks when enough data is available.';

    const steps = [
      {
        done: campaignCount > 0,
        title: campaignCount > 0 ? campaignCount + ' campaign' + (campaignCount === 1 ? '' : 's') + ' set up' : 'Create your first campaign',
        detail: campaignCount > 0 ? 'You can keep campaigns separated by platform and objective.' : 'Choose a name, platform, budget and start date.',
        action: 'new-campaign',
        label: campaignCount > 0 ? '＋ Add another' : 'Create campaign'
      },
      {
        done: metricCount > 0,
        title: metricCount > 0 ? 'Performance data recorded' : 'Add real performance data',
        detail: metricCount > 0 ? metricCount + ' daily metric record' + (metricCount === 1 ? '' : 's') + ' are available in the recent 45-day workspace view.' : 'Enter metrics manually or upload the CSV template with reports you already have.',
        action: campaignCount > 0 ? 'import-metrics' : 'new-campaign',
        label: campaignCount > 0 ? (metricCount > 0 ? 'Import more data' : 'Import CSV') : 'Create campaign first'
      },
      {
        done: targetsComplete,
        title: targetsComplete ? 'Campaign goals configured' : 'Set targets and review signals',
        detail: targetsComplete ? 'Review diagnostics and turn verified issues into an optimization task.' : 'Set a realistic CTR, CPC, CPA, ROAS or daily spend target for each campaign.',
        action: targetsComplete ? 'view-diagnostics' : (campaignCount > 0 ? 'view-campaigns' : 'new-campaign'),
        label: targetsComplete ? 'Review diagnostics' : (campaignCount > 0 ? 'Set targets' : 'Start with a campaign'),
        view: targetsComplete ? 'diagnostics' : (campaignCount > 0 ? 'campaigns' : null)
      }
    ];

    host.innerHTML = steps.map((step, index) =>
      '<article class="setup-step ' + (step.done ? 'is-complete' : '') + '">' +
        '<span class="setup-number">' + (step.done ? '✓' : String(index + 1)) + '</span>' +
        '<div class="setup-copy"><b>' + esc(step.title) + '</b><p>' + esc(step.detail) + '</p></div>' +
        (step.view ? '<button class="small-action" data-view="' + esc(step.view) + '">' + esc(step.label) + '</button>' :
          '<button class="small-action" data-action="' + esc(step.action) + '">' + esc(step.label) + '</button>') +
      '</article>'
    ).join('');
  }

  function parseCsvRows(source) {
    const textValue = String(source || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < textValue.length; i++) {
      const ch = textValue[i];
      if (quoted) {
        if (ch === '"') {
          if (textValue[i + 1] === '"') { value += '"'; i++; }
          else quoted = false;
        } else {
          value += ch;
        }
      } else if (ch === '"' && value.length === 0) {
        quoted = true;
      } else if (ch === ',') {
        row.push(value); value = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && textValue[i + 1] === '\n') i++;
        row.push(value);
        if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
        row = []; value = '';
      } else {
        value += ch;
      }
    }
    if (quoted) throw new Error('CSV contains an opening quote without a matching closing quote.');
    row.push(value);
    if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
    return rows;
  }

  function normalizeCsvHeader(value) {
    return String(value || '').toLowerCase().trim().replace(/^\uFEFF/, '').replace(/[^a-z0-9]/g, '');
  }

  function csvCell(value) {
    let textValue = String(value === null || value === undefined ? '' : value);
    // Prevent spreadsheet formula injection when campaign names are user-controlled.
    if (/^[\t\r ]*[=+\-@]/.test(textValue)) textValue = "'" + textValue;
    return '"' + textValue.replace(/"/g, '""') + '"';
  }

  function downloadCsv(filename, rows) {
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadMetricsTemplate() {
    const today = dateOnly(new Date());
    downloadCsv('adpulse-metrics-template.csv', [
      ['campaign_name','metric_date','spend','impressions','clicks','conversions','revenue'],
      ['Example Campaign (replace with exact existing name)',today,'1000','10000','200','5','4500']
    ]);
    toast('CSV template downloaded. Replace the example row with your campaign name and real figures, or delete that row.', 'info');
  }

  async function exportMetricsCsv() {
    if (state.previewMode) { toast('Dashboard preview: sign-in must be restored before exporting account data.', 'info'); return; }
    if (!sb || !state.user) { toast('Sign in before exporting campaign metrics.', 'error'); return; }
    try {
      const result = await sb.from('daily_metrics')
        .select('campaign_id,metric_date,spend,impressions,clicks,conversions,revenue')
        .order('metric_date', { ascending: true });
      if (result.error) throw result.error;
      const campaignNames = new Map(state.campaigns.map(c => [c.campaign_id, c.name]));
      const rows = [['campaign_name','metric_date','spend','impressions','clicks','conversions','revenue']];
      (result.data || []).forEach(metric => rows.push([
        campaignNames.get(metric.campaign_id) || metric.campaign_id,
        metric.metric_date,
        metric.spend,
        metric.impressions,
        metric.clicks,
        metric.conversions,
        metric.revenue
      ]));
      downloadCsv('adpulse-metrics-' + dateOnly(new Date()) + '.csv', rows);
      toast('Exported ' + (result.data || []).length + ' daily metric record(s).', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function handleMetricsCsvFileChange(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (state.previewMode) { toast('Dashboard preview: sign-in must be restored before importing account data.', 'info'); return; }
    if (!state.user || !sb) { toast('Sign in before importing campaign metrics.', 'error'); return; }
    if (!state.campaigns.length) { toast('Create at least one campaign before importing metrics.', 'info'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('CSV files must be 5 MB or smaller.', 'error'); return; }

    let rows;
    try { rows = parseCsvRows(await file.text()); }
    catch (error) { toast(errorMessage(error), 'error'); return; }
    if (rows.length < 2) { toast('The CSV needs a header row and at least one data row.', 'error'); return; }
    if (rows.length > 5001) { toast('This import is limited to 5,000 data rows per file.', 'error'); return; }

    const header = rows.shift().map(normalizeCsvHeader);
    const aliases = {
      campaign_name: ['campaignname','campaign'],
      metric_date: ['metricdate','date','day','reportdate','reportingdate'],
      spend: ['spend','cost','amountspent'],
      impressions: ['impressions','impression'],
      clicks: ['clicks','click','linkclicks','outboundclicks'],
      conversions: ['conversions','conversion','results','purchases','leads'],
      revenue: ['revenue','conversionvalue','purchaseconversionvalue','websitepurchaseconversionvalue']
    };
    const columnIndex = {};
    Object.keys(aliases).forEach(key => {
      columnIndex[key] = header.findIndex(name => aliases[key].includes(name));
    });
    const missing = Object.keys(aliases).filter(key => columnIndex[key] < 0);
    if (missing.length) {
      toast('Missing CSV columns: ' + missing.join(', ') + '. Download the AdPulse CSV template for the required format.', 'error');
      return;
    }

    const nameMap = new Map();
    state.campaigns.forEach(c => {
      const key = String(c.name || '').trim().toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key).push(c);
    });
    const parsedRecords = [];
    const errors = [];
    const seen = new Set();
    const today = dateOnly(new Date());

    rows.forEach((cells, index) => {
      const line = index + 2;
      if (!cells.some(cell => String(cell).trim() !== '')) return;
      const get = key => String(cells[columnIndex[key]] === undefined ? '' : cells[columnIndex[key]]).trim();
      const campaignName = get('campaign_name');
      const matches = nameMap.get(campaignName.toLowerCase()) || [];
      if (!campaignName || matches.length !== 1) {
        errors.push({ line, message: matches.length > 1 ? 'Campaign name is not unique: ' + campaignName : 'Campaign not found. Create it first and use its exact name: ' + (campaignName || '(blank)') });
        return;
      }
      const date = get('metric_date');
      const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0,10) === date && date <= today;
      if (!dateIsValid) {
        errors.push({ line, message: 'Date must be a valid YYYY-MM-DD date and cannot be in the future.' });
        return;
      }
      const values = {};
      let numericError = '';
      ['spend','impressions','clicks','conversions','revenue'].forEach(key => {
        const raw = get(key).replace(/[,$€£৳\s]/g, '');
        const n = raw === '' ? NaN : Number(raw);
        if (!Number.isFinite(n) || n < 0) numericError = key + ' must be a zero-or-positive number.';
        values[key] = n;
      });
      if (numericError) { errors.push({ line, message: numericError }); return; }
      for (const key of ['impressions','clicks','conversions']) {
        if (!Number.isInteger(values[key])) {
          errors.push({ line, message: key + ' must be a whole number.' });
          return;
        }
      }
      if (values.clicks > values.impressions) {
        errors.push({ line, message: 'Clicks cannot exceed impressions. Check both values.' });
        return;
      }
      const campaign = matches[0];
      const identity = campaign.campaign_id + '|' + date;
      if (seen.has(identity)) {
        errors.push({ line, message: 'Duplicate campaign/date in this file. Keep one row per campaign per date.' });
        return;
      }
      seen.add(identity);
      parsedRecords.push({
        user_id: state.user.id,
        campaign_id: campaign.campaign_id,
        metric_date: date,
        spend: values.spend,
        impressions: values.impressions,
        clicks: values.clicks,
        conversions: values.conversions,
        revenue: values.revenue
      });
    });

    const errorPreview = errors.slice(0, 8).map(item => '<li>Row ' + item.line + ': ' + esc(item.message) + '</li>').join('');
    const canImport = errors.length === 0 && parsedRecords.length > 0;
    const content = '<form class="dialog-form"><p class="dialog-note">File: ' + esc(file.name) + '. One row represents one campaign for one day. Existing matching dates will be updated, not duplicated. Imported values are recorded as supplied and do not sync back to an ad platform.</p>' +
      '<div class="csv-import-summary"><div><span>VALID ROWS</span><b>' + parsedRecords.length + '</b></div><div><span>ISSUES</span><b>' + errors.length + '</b></div></div>' +
      (errors.length ? '<div class="csv-import-errors"><b>Fix these rows and upload again</b><ul>' + errorPreview + (errors.length > 8 ? '<li>…and ' + (errors.length - 8) + ' more issue(s).</li>' : '') + '</ul></div>' : '<p class="dialog-note">The file passed validation. Importing will upsert metrics using the unique campaign/date key.</p>') +
      '<div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary" ' + (canImport ? '' : 'disabled') + '>Import ' + parsedRecords.length + ' row(s) ↗</button></div></form>';
    showDialog('Import campaign metrics', content, async () => {
      let completed = 0;
      for (let i = 0; i < parsedRecords.length; i += 250) {
        const batch = parsedRecords.slice(i, i + 250);
        const result = await sb.from('daily_metrics').upsert(batch, { onConflict: 'campaign_id,metric_date' });
        if (result.error) throw new Error('Import stopped after ' + completed + ' row(s): ' + errorMessage(result.error) + '. You can upload the same file again safely because matching dates are updated.');
        completed += batch.length;
      }
      toast('Imported ' + completed + ' daily metric record(s).', 'success');
      await loadData();
    }, 'DATA IMPORT');
  }

  function resetPreviewWorkspace() {
    ['campaigns', 'metrics', 'tasks', 'signals', 'experiments', 'links', 'history', 'targets'].forEach(key => { state[key] = []; });
    state.isDemoData = false;
    const banner = $('#demo-data-banner');
    if (banner) banner.classList.add('hidden');
    const button = $('#demo-load-button');
    if (button) button.classList.remove('hidden');
  }

  function loadDemoWorkspace() {
    if (!state.previewMode) {
      toast('The sample workspace is available in preview mode only.', 'info');
      return;
    }
    const ids = { meta: 'demo-meta-prospecting', google: 'demo-google-search', tiktok: 'demo-tiktok-creative' };
    state.campaigns = [
      { campaign_id: ids.meta, name: 'Demo · Meta Prospecting', platform: 'facebook', budget: 35000, status: 'active', start_date: dateAgo(29) },
      { campaign_id: ids.google, name: 'Demo · Google Search', platform: 'google', budget: 28000, status: 'active', start_date: dateAgo(29) },
      { campaign_id: ids.tiktok, name: 'Demo · TikTok Creative Test', platform: 'tiktok', budget: 18000, status: 'active', start_date: dateAgo(29) }
    ];
    state.metrics = [];
    for (let age = 29; age >= 0; age--) {
      const metricDate = dateAgo(age);
      const day = 29 - age;
      const metaImpressions = 8200 + (day % 5) * 360;
      const metaClicks = Math.round(metaImpressions * (0.010 + (day % 3) * 0.0006));
      const metaSpend = 520 + (day % 5) * 34;
      const metaConversions = 2 + (day % 4 === 0 ? 1 : 0);
      state.metrics.push({ campaign_id: ids.meta, metric_date: metricDate, spend: metaSpend, impressions: metaImpressions, clicks: metaClicks, conversions: metaConversions, revenue: metaConversions * 620 });

      const googleImpressions = 3100 + (day % 4) * 230;
      const googleClicks = Math.round(googleImpressions * (0.028 + (day % 3) * 0.003));
      const googleSpend = 520 + (day % 4) * 38;
      const googleConversions = 5 + (day % 4);
      state.metrics.push({ campaign_id: ids.google, metric_date: metricDate, spend: googleSpend, impressions: googleImpressions, clicks: googleClicks, conversions: googleConversions, revenue: googleConversions * 540 });

      const tiktokImpressions = 9800 + (day % 4) * 620;
      const tiktokCtr = age >= 7 ? 0.009 : 0.0055;
      const tiktokClicks = Math.round(tiktokImpressions * tiktokCtr);
      const tiktokSpend = 430 + (day % 4) * 32;
      const tiktokConversions = age >= 7 ? (age % 3 === 0 ? 3 : 2) : (age % 4 === 0 ? 1 : 0);
      state.metrics.push({ campaign_id: ids.tiktok, metric_date: metricDate, spend: tiktokSpend, impressions: tiktokImpressions, clicks: tiktokClicks, conversions: tiktokConversions, revenue: tiktokConversions * 450 });
    }
    state.targets = [
      { campaign_id: ids.meta, target_ctr_percent: 0.8, target_cpc: 15, target_cpa: 250, target_roas: 2.5, daily_spend_limit: 1500, min_clicks_for_alert: 50, min_conversions_for_decision: 5, notes: 'Illustrative target for demo only.' },
      { campaign_id: ids.google, target_ctr_percent: 2.5, target_cpc: 16, target_cpa: 150, target_roas: 3.5, daily_spend_limit: 1300, min_clicks_for_alert: 50, min_conversions_for_decision: 5, notes: 'Illustrative target for demo only.' },
      { campaign_id: ids.tiktok, target_ctr_percent: 0.9, target_cpc: 12, target_cpa: 350, target_roas: 1.8, daily_spend_limit: 1000, min_clicks_for_alert: 50, min_conversions_for_decision: 5, notes: 'Illustrative target for demo only.' }
    ];
    const nowIso = offset => new Date(dateAgo(offset) + 'T10:00:00').toISOString();
    state.tasks = [
      { id: 'demo-task-creative', campaign_id: ids.tiktok, title: 'Test a stronger opening hook', issue_type: 'ctr_drop', priority: 'high', status: 'open', recommended_action: 'Compare two distinct first-second hooks while keeping audience and budget stable. Use a consistent testing window.', evidence: { demo: true, ctr: 0.55 }, created_at: nowIso(1), due_date: dateAgo(-2) },
      { id: 'demo-task-tracking', campaign_id: ids.tiktok, title: 'Verify the conversion path', issue_type: 'conversion_review', priority: 'medium', status: 'in_progress', recommended_action: 'Check the purchase event, landing page load, offer clarity and attribution settings before interpreting low recorded revenue.', evidence: { demo: true }, created_at: nowIso(3), due_date: dateAgo(-1) },
      { id: 'demo-task-scale', campaign_id: ids.google, title: 'Protect the search campaign baseline', issue_type: 'efficiency_review', priority: 'low', status: 'open', recommended_action: 'Validate search terms, conversion quality and contribution margin before moving budget.', evidence: { demo: true }, created_at: nowIso(2), due_date: dateAgo(-4) }
    ];
    state.signals = [
      { id: 'demo-signal-ctr', campaign_id: ids.tiktok, campaign_name: 'Demo · TikTok Creative Test', platform: 'tiktok', signal_type: 'ctr_drop', severity: 'high', current_value: 0.55, previous_value: 0.9, change_percent: -38.9, window_start: dateAgo(6), window_end: dateAgo(0), explanation: 'Demo signal: click-through rate is lower in the most recent seven-day window than in the previous illustrative window.', recommended_action: 'Review the opening hook, creative-to-audience match and placement breakdown. Change one major variable at a time.' },
      { id: 'demo-signal-roas', campaign_id: ids.tiktok, campaign_name: 'Demo · TikTok Creative Test', platform: 'tiktok', signal_type: 'roas_drop', severity: 'medium', current_value: 0.27, previous_value: 2.18, change_percent: -87.6, window_start: dateAgo(6), window_end: dateAgo(0), explanation: 'Demo signal: attributed revenue is low relative to recorded spend in the sample data. This is not a profit calculation.', recommended_action: 'Check event tracking, conversion lag, offer economics and margin before changing budget.' }
    ];
    state.experiments = [
      { id: 'demo-experiment-hook', experiment_type: 'creative', status: 'running', name: 'Demo: first-second hook test', primary_metric: 'ctr', hypothesis: 'A clearer product benefit in the first second may earn more qualified clicks.', baseline_value: 0.55, variant_value: 0.9, control_label: 'Current hook', variant_label: 'Benefit-led hook', learning: '', result_summary: '', start_date: dateAgo(5), end_date: null, campaign_id: ids.tiktok },
      { id: 'demo-experiment-search', experiment_type: 'landing_page', status: 'planned', name: 'Demo: landing-page clarity test', primary_metric: 'conversion_rate', hypothesis: 'A more direct offer and visible trust details may improve post-click conversion.', baseline_value: null, variant_value: null, control_label: 'Current page', variant_label: 'Simplified page', learning: '', result_summary: '', start_date: dateAgo(-1), end_date: null, campaign_id: ids.google }
    ];
    state.links = [
      { id: 'demo-link-1', destination_url: 'https://example.com/offer', utm_source: 'tiktok', utm_medium: 'paid_social', utm_campaign: 'demo_creative_test', utm_term: '', utm_content: 'benefit_hook', campaign_id: ids.tiktok, created_at: nowIso(2) },
      { id: 'demo-link-2', destination_url: 'https://example.com/search-offer', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'demo_search_campaign', utm_term: 'sample_keyword', utm_content: '', campaign_id: ids.google, created_at: nowIso(4) }
    ];
    state.history = [
      { id: 'demo-history-1', campaign_id: ids.tiktok, description: 'Demo: flagged creative fatigue for review', action_type: 'creative_test', outcome: 'in_progress', rationale: 'CTR is below the illustrative target in the latest window.', outcome_notes: 'Example record only. No advertising platform has been changed.', before_metrics: { ctr: 0.9 }, after_metrics: { ctr: 0.55 }, action_at: nowIso(1), task_id: 'demo-task-creative' },
      { id: 'demo-history-2', campaign_id: ids.google, description: 'Demo: preserve search performance baseline', action_type: 'budget_review', outcome: 'planned', rationale: 'Review margin and conversion quality before budget decisions.', outcome_notes: 'Example record only.', before_metrics: { roas: 4.7 }, after_metrics: {}, action_at: nowIso(2), task_id: 'demo-task-scale' }
    ];
    state.isDemoData = true;
    $('#demo-data-banner').classList.remove('hidden');
    $('#demo-load-button').classList.add('hidden');
    $('#data-status-text').textContent = 'DEMO DATA · local preview only';
    renderAll();
    toast('Sample workspace loaded locally. Nothing was saved to Supabase or sent to an ad platform.', 'success');
  }

  function clearDemoWorkspace() {
    if (!state.isDemoData) return toast('There is no sample workspace to clear.', 'info');
    resetPreviewWorkspace();
    $('#data-status-text').textContent = 'Dashboard preview · saving and private data paused';
    renderAll();
    toast('Sample data cleared from this browser session.', 'success');
  }

  function renderAll() {
    renderOverview();
    renderGettingStarted();
    renderCampaigns();
    renderDiagnostics();
    renderTasks();
    renderExperiments();
    renderTrackingLinks();
    renderHistory();
    updateCounts();
    populateCampaignSelects();
  }

  function updateCounts() {
    const openCount = state.tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length;
    const signalCount = state.signals.length;
    $('#task-count').textContent = openCount;
    $('#task-count').classList.toggle('hidden', !openCount);
    $('#signal-count').textContent = signalCount;
    $('#signal-count').classList.toggle('hidden', !signalCount);
  }

  function renderOverview() {
    const rows = activeRangeMetrics();
    const totals = metricTotals(rows);
    const roas = totals.spend ? totals.revenue / totals.spend : null;
    $('#kpi-campaigns').textContent = state.campaigns.filter(c => c.status === 'active').length;
    $('#kpi-spend').textContent = money(totals.spend, true);
    $('#kpi-conversions').textContent = number(totals.conversions);
    $('#kpi-roas').textContent = roas === null ? '—' : ratio(roas);
    $('#kpi-spend-note').textContent = 'Last ' + state.range + ' days';
    $('#kpi-conversions-note').textContent = number(totals.clicks) + ' clicks recorded';
    $('#kpi-roas-note').textContent = totals.spend ? money(totals.revenue) + ' attributed revenue' : 'Revenue ÷ spend';

    renderSpendChart(rows);
    renderQueuePreview();
    renderCampaignPreview();
    renderSignalPreview();
    renderSmartInsights();
  }

  function renderSmartInsights() {
    const host = $('#smart-insights');
    if (!host) return;
    const rows = activeRangeMetrics();
    const totals = derived(rows);
    const ideas = [];
    const add = (level, category, title, detail, actionLabel, action, view) => ideas.push({ level, category, title, detail, actionLabel, action, view, order: ({ critical: 4, high: 3, medium: 2, low: 1, info: 0 })[level] || 0 });
    const demo = state.isDemoData;
    $('#smart-insight-status').textContent = demo ? 'DEMO DATA · ' + rows.length + ' records' : rows.length ? rows.length + ' records reviewed' : 'Waiting for data';

    if (!state.campaigns.length) {
      add('info', 'Setup', 'No campaign data to analyze yet', 'The dashboard gets useful when campaign spend, impressions, clicks and results are recorded. Explore a labeled sample workspace to see the calculations and diagnostics in action.', 'Explore demo', 'load-demo-workspace', '');
    } else if (!rows.length) {
      add('medium', 'Data coverage', 'Campaigns are set up, but this period has no metrics', 'Add daily results or review the date range. Empty metrics are not evidence of poor campaign performance.', 'Open campaigns', '', 'campaigns');
    } else {
      const uniqueDates = new Set(rows.map(row => row.metric_date));
      if (totals.impressions < 5000 || totals.clicks < 100 || uniqueDates.size < Math.min(7, state.range)) {
        add('low', 'Confidence', 'Treat the current result as an early signal', 'The selected period has ' + number(totals.impressions) + ' impressions, ' + number(totals.clicks) + ' clicks across ' + uniqueDates.size + ' reporting day(s). Collect a larger and more consistent sample before making large changes.', 'Review diagnostics', '', 'diagnostics');
      }
      const newest = rows.map(row => row.metric_date).sort().slice(-1)[0];
      if (newest) {
        const age = Math.floor((new Date(dateAgo(0) + 'T12:00:00').getTime() - new Date(newest + 'T12:00:00').getTime()) / 86400000);
        if (age > 2) add('medium', 'Data freshness', 'Your latest metrics may be stale', 'The newest recorded metric is from ' + displayDate(newest) + '. Check that the report was imported for the latest completed days before acting on this trend.', 'Review campaigns', '', 'campaigns');
      }

      const perCampaign = state.campaigns.map(campaign => ({ campaign, metrics: campaignMetrics(campaign.campaign_id, rows), target: state.targets.find(t => t.campaign_id === campaign.campaign_id) })).filter(item => item.metrics.spend > 0 || item.metrics.impressions > 0);
      perCampaign.forEach(({ campaign, metrics: m, target }) => {
        if (target && target.target_ctr_percent !== null && target.target_ctr_percent !== undefined && m.ctr !== null && m.impressions >= 1000 && m.ctr < Number(target.target_ctr_percent)) {
          add('high', 'Creative', campaign.name + ' is below its CTR target', 'Recorded CTR is ' + decimal(m.ctr, 2) + '% versus the target of ' + decimal(target.target_ctr_percent, 2) + '%. Review the audience-to-message match, opening hook and creative before changing spend.', 'Review campaign', '', 'campaigns');
        } else if (m.impressions >= 3000 && m.ctr !== null && m.ctr < 0.7) {
          add('medium', 'Creative', campaign.name + ' may need a creative review', 'CTR is ' + decimal(m.ctr, 2) + '% across ' + number(m.impressions) + ' impressions. Compare creative, audience and placement performance; 0.7% is a review trigger here, not a universal benchmark.', 'Review campaign', '', 'campaigns');
        }
        if (m.clicks >= 50 && m.conversions === 0) add('high', 'Conversion path', 'Check tracking and the post-click journey for ' + campaign.name, 'There are ' + number(m.clicks) + ' clicks but no recorded conversions in this range. Verify the conversion event, landing page, offer and attribution window before concluding that the campaign failed.', 'Review diagnostics', '', 'diagnostics');
        if (m.spend >= 500 && m.roas !== null && m.roas < 1) add('high', 'Efficiency', campaign.name + ' has less recorded revenue than spend', 'Recorded ROAS is ' + ratio(m.roas) + ' for ' + money(m.spend) + ' spend. Reconcile attribution and margins before scaling down or up; revenue divided by spend is not the same as profit.', 'Review campaign', '', 'campaigns');
        if (target && target.target_cpa && m.cpa !== null && m.conversions >= 5 && m.cpa > Number(target.target_cpa)) add('medium', 'Acquisition cost', campaign.name + ' is above its CPA target', 'Recorded CPA is ' + money(m.cpa) + ' against a target of ' + money(target.target_cpa) + '. Compare conversion quality and attribution before making a decision.', 'Review diagnostics', '', 'diagnostics');
        if (target && target.target_roas && m.roas !== null && m.spend > 500 && m.roas < Number(target.target_roas)) add('medium', 'Return', campaign.name + ' is below its ROAS target', 'Recorded ROAS is ' + ratio(m.roas) + ' against a target of ' + ratio(target.target_roas) + '. Review product mix, conversion value and attribution.', 'Review diagnostics', '', 'diagnostics');
      });
      if (!ideas.length) {
        const strongest = perCampaign.filter(item => item.metrics.roas !== null).sort((a, b) => b.metrics.roas - a.metrics.roas)[0];
        if (strongest) add('info', 'Protect what works', 'Review the strongest tracked return before scaling', strongest.campaign.name + ' currently has the highest tracked ROAS in this date range at ' + ratio(strongest.metrics.roas) + '. Confirm margin, conversion quality and tracking consistency before increasing budget.', 'Review campaigns', '', 'campaigns');
        else add('info', 'Next step', 'Keep improving data coverage', 'Record spend, impressions, clicks, conversions and attributed revenue consistently so the dashboard can move beyond surface-level metrics.', 'Review campaigns', '', 'campaigns');
      }
    }

    ideas.sort((a, b) => b.order - a.order);
    const visible = ideas.slice(0, 3);
    host.innerHTML = visible.map(item => '<article class="smart-insight-card ' + esc(item.level) + '"><div class="smart-insight-top"><span class="insight-priority">' + esc(item.level.toUpperCase()) + '</span><span class="insight-theme">' + esc(item.category) + '</span></div><h3>' + esc(item.title) + '</h3><p>' + esc(item.detail) + '</p><div class="smart-insight-foot"><span>RULE-BASED REVIEW</span>' + (item.action ? '<button class="small-action" data-action="' + escapeAttr(item.action) + '">' + esc(item.actionLabel) + ' ↗</button>' : item.view ? '<button class="small-action" data-view="' + escapeAttr(item.view) + '">' + esc(item.actionLabel) + ' ↗</button>' : '') + '</div></article>').join('');
  }

  function renderSpendChart(rows) {
    const chart = $('#spend-chart');
    const labels = $('#spend-chart-labels');
    const totalsByDay = {};
    for (let i = state.range - 1; i >= 0; i--) totalsByDay[dateAgo(i)] = 0;
    rows.forEach(row => { if (Object.prototype.hasOwnProperty.call(totalsByDay, row.metric_date)) totalsByDay[row.metric_date] += Number(row.spend || 0); });
    const days = Object.keys(totalsByDay);
    const values = days.map(day => totalsByDay[day]);
    const max = Math.max(...values, 0);
    if (!rows.length || !max) {
      chart.innerHTML = '<div class="chart-empty">Add daily metrics to bring your chart to life.</div>';
      labels.innerHTML = '';
      return;
    }
    chart.innerHTML = days.map((day, index) => {
      const height = max ? Math.max(values[index] / max * 100, values[index] ? 4 : 1) : 1;
      return '<div class="chart-bar-group" title="' + esc(displayDate(day)) + ': ' + esc(money(values[index])) + '"><div class="chart-bar" style="height:' + height + '%"></div><span class="chart-bar-label">' + esc(index % Math.ceil(days.length / 7) === 0 || index === days.length - 1 ? number(values[index]) : '') + '</span></div>';
    }).join('');
    const first = days[0], middle = days[Math.floor(days.length / 2)], last = days[days.length - 1];
    labels.innerHTML = '<span>' + esc(relativeDate(first)) + '</span><span>' + esc(relativeDate(middle)) + '</span><span>' + esc(relativeDate(last)) + '</span>';
  }

  function renderQueuePreview() {
    const container = $('#queue-preview-list');
    const tasks = state.tasks.filter(t => t.status === 'open' || t.status === 'in_progress')
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
      .slice(0, 4);
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state compact"><span class="empty-symbol">☷</span><b>Your queue starts here</b><p>Turn a campaign signal into a focused action.</p></div>';
      return;
    }
    container.innerHTML = tasks.map(task => {
      const campaign = state.campaigns.find(c => c.campaign_id === task.campaign_id);
      return '<div class="queue-item"><span class="priority-marker ' + esc(task.priority) + '"></span><div class="queue-item-copy"><b>' + esc(task.title) + '</b><small>' + esc(campaign ? campaign.name : 'Campaign') + ' · ' + esc(task.issue_type.replace(/_/g, ' ')) + '</small></div><span class="queue-status">' + esc(task.status.replace('_', ' ')) + '</span></div>';
    }).join('');
  }

  function renderCampaignPreview() {
    const tbody = $('#campaigns-preview-body');
    if (!state.campaigns.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No campaigns yet. Add your first campaign to begin.</td></tr>';
      return;
    }
    tbody.innerHTML = state.campaigns.slice(0, 5).map(campaign => {
      const m = campaignMetrics(campaign.campaign_id);
      return '<tr><td><div class="campaign-name-cell"><b>' + esc(campaign.name) + '</b><small>' + esc(campaign.platform || 'other') + '</small></div></td><td>' + platformPill(campaign.platform) + '</td><td class="metric-value">' + money(m.spend) + '</td><td class="metric-value">' + ratio(m.roas) + '</td><td>' + statusPill(campaign.status) + '</td></tr>';
    }).join('');
  }

  function renderSignalPreview() {
    const container = $('#signal-preview-list');
    const signals = state.signals.slice(0, 3);
    if (!signals.length) {
      container.innerHTML = '<div class="empty-state compact"><span class="empty-symbol">⌁</span><b>No signals yet</b><p>Signals appear when campaign data meets a diagnostic rule.</p></div>';
      return;
    }
    container.innerHTML = signals.map(signal => {
      return '<div class="signal-mini"><span class="signal-tag ' + esc(signal.severity) + '">' + esc(signal.severity) + '</span><div><b>' + esc(signalLabels[signal.signal_type] || signal.signal_type) + '</b><small>' + esc(signal.campaign_name) + ' · ' + esc(signal.explanation) + '</small></div></div>';
    }).join('');
  }

  function renderCampaigns() {
    const tbody = $('#campaigns-table-body');
    if (!tbody) return;
    const search = ($('#campaign-search') ? $('#campaign-search').value : '').trim().toLowerCase();
    const status = $('#campaign-status-filter') ? $('#campaign-status-filter').value : 'all';
    const campaigns = state.campaigns.filter(c => (status === 'all' || c.status === status) && (!search || (c.name + ' ' + c.platform).toLowerCase().includes(search)));
    $('#campaign-record-count').textContent = campaigns.length + ' campaign' + (campaigns.length === 1 ? '' : 's');
    if (!campaigns.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">' + (state.campaigns.length ? 'No campaigns match these filters.' : 'Your workspace is clear. Create a campaign to start tracking performance.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = campaigns.map(c => {
      const m = campaignMetrics(c.campaign_id);
      const target = state.targets.find(t => t.campaign_id === c.campaign_id);
      return '<tr><td><div class="campaign-name-cell"><b>' + esc(c.name) + '</b><small>' + (c.start_date ? 'Started ' + esc(displayDate(c.start_date)) : 'Created campaign') + '</small></div></td>' +
        '<td>' + platformPill(c.platform) + '</td>' +
        '<td class="metric-value">' + money(c.budget) + '</td>' +
        '<td class="metric-value">' + money(m.spend) + '</td>' +
        '<td class="metric-value">' + (m.ctr === null ? '—' : decimal(m.ctr, 2) + '%') + '</td>' +
        '<td class="metric-value">' + (m.cpc === null ? '—' : money(m.cpc)) + '</td>' +
        '<td class="metric-value">' + (m.cpa === null ? '—' : money(m.cpa)) + '</td>' +
        '<td class="metric-value">' + ratio(m.roas) + '</td>' +
        '<td>' + statusPill(c.status) + '</td>' +
        '<td><div class="row-actions"><button class="small-action" data-action="new-metric" data-id="' + esc(c.campaign_id) + '">＋ Metrics</button><button class="small-action" data-action="targets" data-id="' + esc(c.campaign_id) + '">' + (target ? 'Targets' : '＋ Targets') + '</button></div></td></tr>';
    }).join('');
  }

  function renderDiagnostics() {
    const container = $('#diagnostics-list');
    if (!container) return;
    const counts = {
      high: state.signals.filter(s => s.severity === 'high' || s.severity === 'critical').length,
      medium: state.signals.filter(s => s.severity === 'medium').length,
      low: state.signals.filter(s => s.severity === 'low').length
    };
    $('#signal-summary').innerHTML =
      '<div class="signal-summary-card"><span>TOTAL SIGNALS</span><b>' + state.signals.length + '</b></div>' +
      '<div class="signal-summary-card"><span>HIGH PRIORITY</span><b>' + counts.high + '</b></div>' +
      '<div class="signal-summary-card"><span>MEDIUM</span><b>' + counts.medium + '</b></div>' +
      '<div class="signal-summary-card"><span>LOW / SETUP</span><b>' + counts.low + '</b></div>';
    if (!state.signals.length) {
      container.innerHTML = '<div class="panel"><div class="empty-state"><span class="empty-symbol">⌁</span><h3>No diagnostic signals yet</h3><p>Add campaign data for recent complete 7-day windows and set realistic targets to unlock useful checks. Your account is not being judged on empty data.</p><button class="btn btn-primary" data-view="campaigns">Go to campaigns ↗</button></div></div>';
      return;
    }
    const severitySort = { critical: 4, high: 3, medium: 2, low: 1 };
    const signals = state.signals.slice().sort((a, b) => (severitySort[b.severity] || 0) - (severitySort[a.severity] || 0));
    container.innerHTML = signals.map(s => {
      const valueText = s.change_percent !== null && s.change_percent !== undefined ? decimal(s.change_percent, 1) + '%' : '—';
      const currentText = s.current_value === null || s.current_value === undefined ? '—' : (s.signal_type.includes('roas') ? ratio(s.current_value) : s.signal_type.includes('cpc') || s.signal_type.includes('cpa') ? money(s.current_value) : decimal(s.current_value, 2));
      const previousText = s.previous_value === null || s.previous_value === undefined ? '—' : (s.signal_type.includes('roas') ? ratio(s.previous_value) : s.signal_type.includes('cpc') || s.signal_type.includes('cpa') ? money(s.previous_value) : decimal(s.previous_value, 2));
      return '<article class="diagnostic-card"><div class="diagnostic-main"><div class="diagnostic-title-row"><h3>' + esc(signalLabels[s.signal_type] || s.signal_type) + '</h3><span class="severity ' + esc(s.severity) + '">' + esc(s.severity) + '</span><span class="task-campaign">' + esc(platformLabels[s.platform] || s.platform) + '</span></div>' +
        '<div class="signal-metrics"><div class="signal-metric"><span>CURRENT</span><b>' + esc(currentText) + '</b></div><div class="signal-metric"><span>PREVIOUS</span><b>' + esc(previousText) + '</b></div><div class="signal-metric"><span>CHANGE</span><b>' + esc(valueText) + '</b></div><div class="signal-metric"><span>WINDOW</span><b>' + esc(displayDate(s.window_start)) + ' – ' + esc(displayDate(s.window_end)) + '</b></div></div>' +
        '<div class="diagnostic-explanation">' + esc(s.explanation) + '</div><div class="recommended-action"><b>Suggested next step:</b> ' + esc(s.recommended_action) + '</div><div class="diagnostic-meta">CAMPAIGN: ' + esc(s.campaign_name) + ' · SIGNAL: ' + esc(s.signal_type.replace(/_/g, ' ')) + '</div></div>' +
        '<div class="diagnostic-actions"><button class="btn btn-primary" data-action="task-from-signal" data-id="' + esc(s.campaign_id) + '" data-signal="' + esc(s.signal_type) + '" data-title="' + escapeAttr(signalLabels[s.signal_type] || s.signal_type) + '" data-recommendation="' + escapeAttr(s.recommended_action || '') + '">Create task ↗</button><button class="btn btn-secondary" data-action="new-history" data-id="' + esc(s.campaign_id) + '" data-title="' + escapeAttr(signalLabels[s.signal_type] || s.signal_type) + '">Log review</button></div></article>';
    }).join('');
  }

  function priorityRank(priority) {
    return ({ critical: 4, high: 3, medium: 2, low: 1 })[priority] || 0;
  }

  function renderTasks() {
    const container = $('#tasks-list');
    if (!container) return;
    let tasks = state.tasks.slice();
    if (state.taskFilter !== 'all') tasks = tasks.filter(t => t.status === state.taskFilter);
    tasks.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || new Date(b.created_at) - new Date(a.created_at));
    $('#task-record-count').textContent = tasks.length + ' task' + (tasks.length === 1 ? '' : 's');
    if (!tasks.length) {
      container.innerHTML = '<div class="panel"><div class="empty-state"><span class="empty-symbol">☷</span><h3>No ' + esc(state.taskFilter === 'all' ? '' : state.taskFilter.replace('_', ' ') + ' ') + 'tasks here</h3><p>Create a manual optimization task or turn a diagnostic signal into a focused next action.</p><button class="btn btn-primary" data-action="new-task">＋ Add optimization task</button></div></div>';
      return;
    }
    container.innerHTML = tasks.map(t => {
      const campaign = state.campaigns.find(c => c.campaign_id === t.campaign_id);
      return '<article class="task-card"><span class="task-edge ' + esc(t.priority) + '"></span><div class="task-content"><div class="task-meta">' + priorityPill(t.priority) + statusPill(t.status) + '<span class="task-campaign">' + esc(campaign ? campaign.name : 'Campaign') + '</span></div><h3>' + esc(t.title) + '</h3><p>' + esc(t.recommended_action || t.outcome_notes || 'No action notes added yet.') + '</p>' +
        (t.evidence && Object.keys(t.evidence).length ? '<div class="task-evidence">Evidence attached · ' + esc(t.issue_type.replace(/_/g, ' ')) + '</div>' : '') + '<div class="task-evidence">Created ' + esc(displayDate(t.created_at)) + (t.due_date ? ' · Due ' + esc(displayDate(t.due_date)) : '') + '</div></div>' +
        '<div class="task-actions"><select aria-label="Task status" data-task-status="' + esc(t.id) + '"><option value="open" ' + (t.status === 'open' ? 'selected' : '') + '>Open</option><option value="in_progress" ' + (t.status === 'in_progress' ? 'selected' : '') + '>In progress</option><option value="done" ' + (t.status === 'done' ? 'selected' : '') + '>Completed</option><option value="dismissed" ' + (t.status === 'dismissed' ? 'selected' : '') + '>Dismissed</option></select><button class="small-action" data-action="new-history" data-id="' + esc(t.campaign_id) + '" data-task-id="' + esc(t.id) + '" data-title="' + escapeAttr(t.title) + '">Log outcome</button></div></article>';
    }).join('');
  }

  function renderExperiments() {
    const container = $('#experiments-list');
    if (!container) return;
    const count = state.experiments.length;
    $('#experiment-stats').innerHTML = '<div class="experiment-stat"><span>TOTAL EXPERIMENTS</span><b>' + count + '</b></div><div class="experiment-stat"><span>RUNNING</span><b>' + state.experiments.filter(e => e.status === 'running').length + '</b></div><div class="experiment-stat"><span>COMPLETED</span><b>' + state.experiments.filter(e => e.status === 'completed').length + '</b></div>';
    if (!count) {
      container.innerHTML = '<div class="panel" style="grid-column:1/-1"><div class="empty-state"><span class="empty-symbol">⧖</span><h3>Your testing memory starts here</h3><p>Log a hypothesis before testing. Capture the baseline, variant and what the result teaches you.</p><button class="btn btn-primary" data-action="new-experiment">＋ Log an experiment</button></div></div>';
      return;
    }
    container.innerHTML = state.experiments.map(e => {
      const campaign = state.campaigns.find(c => c.campaign_id === e.campaign_id);
      return '<article class="experiment-card"><div class="experiment-card-head"><span class="experiment-type">' + esc(e.experiment_type.replace(/_/g, ' ')) + '</span>' + statusPill(e.status) + '</div><h3>' + esc(e.name) + '</h3><p>' + esc(campaign ? campaign.name : 'Campaign') + ' · Primary metric: ' + esc(e.primary_metric.toUpperCase().replace(/_/g, ' ')) + '</p><div class="experiment-hypothesis"><span>HYPOTHESIS</span><p>' + esc(e.hypothesis) + '</p></div>' +
        '<div class="experiment-values"><div class="experiment-value"><span>CONTROL / BASELINE</span><b>' + esc(e.baseline_value === null ? (e.control_label || 'Not recorded') : e.baseline_value) + '</b></div><div class="experiment-value"><span>VARIANT</span><b>' + esc(e.variant_value === null ? (e.variant_label || 'Not recorded') : e.variant_value) + '</b></div></div>' +
        ((e.learning || e.result_summary) ? '<div class="experiment-hypothesis"><span>LEARNING</span><p>' + esc(e.learning || e.result_summary) + '</p></div>' : '') +
        '<div class="experiment-foot"><small>' + esc(e.start_date ? displayDate(e.start_date) : 'No start date') + (e.end_date ? ' – ' + esc(displayDate(e.end_date)) : '') + '</small><button class="small-action" data-action="advance-experiment" data-id="' + esc(e.id) + '" data-status="' + esc(e.status) + '">' + (e.status === 'planned' ? 'Start test →' : e.status === 'running' ? 'Mark complete →' : 'Review status') + '</button></div></article>';
    }).join('');
  }

  function buildUtmUrl(link) {
    try {
      const url = new URL(link.destination_url);
      url.searchParams.set('utm_source', link.utm_source);
      url.searchParams.set('utm_medium', link.utm_medium);
      url.searchParams.set('utm_campaign', link.utm_campaign);
      if (link.utm_term) url.searchParams.set('utm_term', link.utm_term); else url.searchParams.delete('utm_term');
      if (link.utm_content) url.searchParams.set('utm_content', link.utm_content); else url.searchParams.delete('utm_content');
      return url.toString();
    } catch (error) { return link.destination_url || ''; }
  }

  function currentUtmValues() {
    return {
      destination_url: $('#utm-url').value.trim(),
      utm_source: $('#utm-source').value.trim(),
      utm_medium: $('#utm-medium').value.trim(),
      utm_campaign: $('#utm-campaign').value.trim(),
      utm_term: $('#utm-term').value.trim(),
      utm_content: $('#utm-content').value.trim(),
      campaign_id: $('#utm-campaign-id').value || null
    };
  }

  function makePreviewUrl() {
    const values = currentUtmValues();
    if (!values.destination_url) {
      $('#utm-output').textContent = 'Your UTM link will appear here.';
      return '';
    }
    try {
      const url = new URL(values.destination_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP or HTTPS URLs are supported.');
      if (values.utm_source) url.searchParams.set('utm_source', values.utm_source);
      if (values.utm_medium) url.searchParams.set('utm_medium', values.utm_medium);
      if (values.utm_campaign) url.searchParams.set('utm_campaign', values.utm_campaign);
      if (values.utm_term) url.searchParams.set('utm_term', values.utm_term); else url.searchParams.delete('utm_term');
      if (values.utm_content) url.searchParams.set('utm_content', values.utm_content); else url.searchParams.delete('utm_content');
      $('#utm-output').textContent = url.toString();
      return url.toString();
    } catch (error) {
      $('#utm-output').textContent = 'Enter a valid landing-page URL beginning with https://';
      return '';
    }
  }

  function renderTrackingLinks() {
    const container = $('#saved-links-list');
    if (!container) return;
    if (!state.links.length) {
      container.innerHTML = '<div class="empty-state compact"><span class="empty-symbol">↗</span><b>No saved links yet</b><p>Your generated tracking links will appear here.</p></div>';
      return;
    }
    container.innerHTML = state.links.map(link => {
      const built = buildUtmUrl(link);
      const campaign = state.campaigns.find(c => c.campaign_id === link.campaign_id);
      return '<article class="saved-link"><div class="saved-link-top"><b>' + esc(link.utm_campaign) + '</b><button class="small-action" data-action="copy-link" data-url="' + escapeAttr(built) + '">Copy</button></div><div class="saved-link-url">' + esc(built) + '</div><div class="saved-link-meta"><span class="utm-chip">' + esc(link.utm_source) + '</span><span class="utm-chip">' + esc(link.utm_medium) + '</span>' + (campaign ? '<span class="utm-chip">' + esc(campaign.name) + '</span>' : '') + '</div></article>';
    }).join('');
  }

  function renderHistory() {
    const container = $('#history-list');
    if (!container) return;
    if (!state.history.length) {
      container.innerHTML = '<div class="panel"><div class="empty-state"><span class="empty-symbol">◷</span><h3>No optimization history yet</h3><p>Keep the context of each meaningful change, then return to record what happened afterwards.</p><button class="btn btn-primary" data-action="new-history">＋ Log a change</button></div></div>';
      return;
    }
    container.innerHTML = state.history.map(item => {
      const campaign = state.campaigns.find(c => c.campaign_id === item.campaign_id);
      const metricTags = [];
      if (item.before_metrics && Object.keys(item.before_metrics).length) metricTags.push('Before ' + JSON.stringify(item.before_metrics));
      if (item.after_metrics && Object.keys(item.after_metrics).length) metricTags.push('After ' + JSON.stringify(item.after_metrics));
      return '<article class="history-card"><span class="history-icon">◷</span><div class="history-main"><h3>' + esc(item.description) + '</h3><p>' + esc(campaign ? campaign.name : 'Campaign') + ' · ' + esc(item.action_type.replace(/_/g, ' ')) + ' · ' + esc(item.outcome) + '</p>' +
        (item.rationale ? '<div class="history-rationale">' + esc(item.rationale) + '</div>' : '') +
        (item.outcome_notes ? '<p style="margin-top:9px">' + esc(item.outcome_notes) + '</p>' : '') +
        (metricTags.length ? '<div class="history-metrics">' + metricTags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') + '</div><div class="history-side">' + statusPill(item.outcome) + '<time>' + esc(displayDate(item.action_at)) + '</time></div></article>';
    }).join('');
  }

  function populateCampaignSelects() {
    ['#utm-campaign-id'].forEach(selector => {
      const select = $(selector);
      if (!select) return;
      const value = select.value;
      select.innerHTML = '<option value="">No campaign selected</option>' + state.campaigns.map(c => '<option value="' + esc(c.campaign_id) + '">' + esc(c.name) + ' · ' + esc(platformLabels[c.platform] || c.platform) + '</option>').join('');
      if (state.campaigns.some(c => c.campaign_id === value)) select.value = value;
    });
  }

  function navigate(view) {
    if (!viewTitles[view]) return;
    state.view = view;
    $$('.view').forEach(section => section.classList.toggle('active', section.id === 'view-' + view));
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('#breadcrumb-current').textContent = viewTitles[view];
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'integrations' && state.user && !state.previewMode) {
      refreshGoogleAdsStatus();
      refreshAgentTokens();
    }
  }

  function closeSidebar() { $('#sidebar').classList.remove('open'); }

  function showDialog(title, content, onSubmit, eyebrow) {
    const dialog = $('#app-dialog');
    $('#dialog-title').textContent = title;
    $('#dialog-eyebrow').textContent = eyebrow || 'WORKSPACE ACTION';
    $('#dialog-content').innerHTML = content;
    dialog.showModal();
    const form = $('#dialog-content form');
    if (form && onSubmit) {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submitButton = form.querySelector('[type="submit"]');
        const prior = submitButton ? submitButton.textContent : '';
        if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Saving…'; }
        const feedback = $('.dialog-error', form);
        if (feedback) feedback.textContent = '';
        try {
          await onSubmit(new FormData(form), form);
          dialog.close();
        } catch (error) {
          console.error(error);
          if (feedback) feedback.textContent = errorMessage(error);
          else toast(errorMessage(error), 'error');
        } finally {
          if (submitButton && submitButton.isConnected) { submitButton.disabled = false; submitButton.textContent = prior; }
        }
      });
    }
    const close = $('.dialog-close', dialog);
    if (close) close.onclick = () => dialog.close();
    const cancel = $('[data-dialog-cancel]', dialog);
    if (cancel) cancel.onclick = () => dialog.close();
  }

  function campaignOptions(selected) {
    if (!state.campaigns.length) return '<option value="">No campaigns available</option>';
    return state.campaigns.map(c => '<option value="' + esc(c.campaign_id) + '" ' + (selected === c.campaign_id ? 'selected' : '') + '>' + esc(c.name) + ' — ' + esc(platformLabels[c.platform] || c.platform) + '</option>').join('');
  }

  function openCampaignModal() {
    const content = '<form class="dialog-form"><p class="dialog-note">A campaign is a tracking workspace record. Ad-platform account sync will be added separately; this does not create or change a live campaign in Meta or Google.</p>' +
      '<label class="field">Campaign name<input name="name" required maxlength="180" placeholder="e.g. Q4 Lead Generation"></label>' +
      '<div class="form-two-col"><label class="field">Platform<select name="platform" required><option value="facebook">Meta / Facebook Ads</option><option value="google">Google Ads</option><option value="tiktok">TikTok Ads</option><option value="youtube">YouTube Ads</option><option value="instagram">Instagram Ads</option><option value="linkedin">LinkedIn Ads</option><option value="other">Other</option></select></label><label class="field">Status<select name="status"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label></div>' +
      '<div class="form-two-col"><label class="field">Planned budget (BDT)<input name="budget" type="number" min="0" step="0.01" value="0"></label><label class="field">Start date<input name="start_date" type="date" value="' + dateOnly(new Date()) + '"></label></div>' +
      '<label class="field">End date <small>Optional</small><input name="end_date" type="date"></label><div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary">Create campaign ↗</button></div></form>';
    showDialog('Create a campaign', content, async form => {
      const payload = {
        user_id: state.user.id,
        name: String(form.get('name') || '').trim(),
        platform: form.get('platform'),
        status: form.get('status'),
        budget: Number(form.get('budget') || 0),
        start_date: form.get('start_date') || null,
        end_date: form.get('end_date') || null
      };
      if (!payload.name) throw new Error('Enter a campaign name.');
      if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) throw new Error('End date must be on or after the start date.');
      const result = await sb.from('campaigns').insert(payload);
      if (result.error) throw result.error;
      toast('Campaign added to your workspace.', 'success');
      await loadData();
    }, 'CAMPAIGN MANAGEMENT');
  }

  function openMetricModal(selectedCampaign) {
    if (!state.campaigns.length) { toast('Create a campaign before adding daily metrics.', 'info'); return; }
    const content = '<form class="dialog-form"><p class="dialog-note">Use the campaign&#39;s reported daily figures. If the same campaign/date already exists, the record will be updated.</p>' +
      '<label class="field">Campaign<select name="campaign_id" required>' + campaignOptions(selectedCampaign) + '</select></label>' +
      '<div class="form-two-col"><label class="field">Metric date<input name="metric_date" type="date" value="' + dateOnly(new Date()) + '" required></label><label class="field">Spend (BDT)<input name="spend" type="number" min="0" step="0.01" value="0" required></label></div>' +
      '<div class="form-two-col"><label class="field">Impressions<input name="impressions" type="number" min="0" step="1" value="0" required></label><label class="field">Clicks<input name="clicks" type="number" min="0" step="1" value="0" required></label></div>' +
      '<div class="form-two-col"><label class="field">Conversions<input name="conversions" type="number" min="0" step="1" value="0" required></label><label class="field">Attributed revenue (BDT)<input name="revenue" type="number" min="0" step="0.01" value="0" required></label></div>' +
      '<div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save daily metrics ↗</button></div></form>';
    showDialog('Add daily performance', content, async form => {
      const spend = Number(form.get('spend'));
      const impressions = Number(form.get('impressions'));
      const clicks = Number(form.get('clicks'));
      const conversions = Number(form.get('conversions'));
      const revenue = Number(form.get('revenue'));
      if ([spend, impressions, clicks, conversions, revenue].some(v => !Number.isFinite(v) || v < 0)) throw new Error('Metrics must be zero or positive numbers.');
      if (clicks > impressions && impressions > 0) throw new Error('Clicks cannot exceed impressions. Check the values before saving.');
      const payload = {
        user_id: state.user.id,
        campaign_id: form.get('campaign_id'),
        metric_date: form.get('metric_date'),
        spend, impressions: Math.round(impressions), clicks: Math.round(clicks),
        conversions: Math.round(conversions), revenue
      };
      const result = await sb.from('daily_metrics').upsert(payload, { onConflict: 'campaign_id,metric_date' });
      if (result.error) throw result.error;
      toast('Daily metrics saved.', 'success');
      await loadData();
    }, 'PERFORMANCE DATA');
  }

  function openTargetsModal(campaignId) {
    const campaign = state.campaigns.find(c => c.campaign_id === campaignId);
    if (!campaign) return;
    const existing = state.targets.find(t => t.campaign_id === campaignId) || {};
    const content = '<form class="dialog-form"><p class="dialog-note">Targets power the diagnostics and should reflect the real campaign objective. Leave a field blank if it is not relevant.</p>' +
      '<label class="field">Campaign<input value="' + escapeAttr(campaign.name) + '" disabled><input type="hidden" name="campaign_id" value="' + esc(campaignId) + '"></label>' +
      '<div class="form-two-col"><label class="field">Target CTR (%)<input name="target_ctr_percent" type="number" min="0" step="0.01" value="' + esc(existing.target_ctr_percent ?? '') + '" placeholder="e.g. 1.5"></label><label class="field">Target CPC (BDT)<input name="target_cpc" type="number" min="0" step="0.01" value="' + esc(existing.target_cpc ?? '') + '" placeholder="e.g. 18"></label></div>' +
      '<div class="form-two-col"><label class="field">Target CPA (BDT)<input name="target_cpa" type="number" min="0" step="0.01" value="' + esc(existing.target_cpa ?? '') + '" placeholder="e.g. 250"></label><label class="field">Target ROAS<input name="target_roas" type="number" min="0" step="0.01" value="' + esc(existing.target_roas ?? '') + '" placeholder="e.g. 2.5"></label></div>' +
      '<div class="form-two-col"><label class="field">Daily spend limit (BDT)<input name="daily_spend_limit" type="number" min="0" step="0.01" value="' + esc(existing.daily_spend_limit ?? '') + '" placeholder="Optional"></label><label class="field">Minimum clicks for alerts<input name="min_clicks_for_alert" type="number" min="1" step="1" value="' + esc(existing.min_clicks_for_alert ?? 50) + '" required></label></div>' +
      '<label class="field">Minimum prior conversions for CPA decisions<input name="min_conversions_for_decision" type="number" min="0" step="1" value="' + esc(existing.min_conversions_for_decision ?? 5) + '" required></label>' +
      '<label class="field">Notes <small>Optional context</small><textarea name="notes" rows="2" placeholder="Goal, attribution notes, guardrails…">' + esc(existing.notes || '') + '</textarea></label>' +
      '<div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save targets ↗</button></div></form>';
    showDialog('Campaign diagnostic targets', content, async form => {
      const optionalNumber = name => String(form.get(name) || '').trim() === '' ? null : Number(form.get(name));
      const payload = {
        user_id: state.user.id,
        campaign_id: campaignId,
        target_ctr_percent: optionalNumber('target_ctr_percent'),
        target_cpc: optionalNumber('target_cpc'),
        target_cpa: optionalNumber('target_cpa'),
        target_roas: optionalNumber('target_roas'),
        daily_spend_limit: optionalNumber('daily_spend_limit'),
        min_clicks_for_alert: Number(form.get('min_clicks_for_alert')),
        min_conversions_for_decision: Number(form.get('min_conversions_for_decision')),
        notes: String(form.get('notes') || '').trim() || null
      };
      const result = await sb.from('campaign_targets').upsert(payload, { onConflict: 'campaign_id' });
      if (result.error) throw result.error;
      toast('Campaign targets saved.', 'success');
      await loadData();
    }, 'DIAGNOSTIC GUARDRAILS');
  }

  function openTaskModal(options) {
    const opts = options || {};
    if (!state.campaigns.length) { toast('Create a campaign before adding optimization tasks.', 'info'); return; }
    const selectedId = opts.campaignId || state.campaigns[0].campaign_id;
    const signalType = opts.signalType || 'manual';
    const allowedTypes = ['spend_spike','ctr_drop','cpc_increase','cpa_increase','roas_drop','budget_pacing','tracking_issue','creative_fatigue','conversion_drop','manual','other'];
    const selectedType = allowedTypes.includes(signalType) ? signalType : 'other';
    const content = '<form class="dialog-form"><p class="dialog-note">Keep the action specific. Add the evidence or next step so you can learn from the outcome.</p>' +
      '<label class="field">Campaign<select name="campaign_id" required>' + campaignOptions(selectedId) + '</select></label>' +
      '<label class="field">Task title<input name="title" required maxlength="180" value="' + escapeAttr(opts.title || '') + '" placeholder="e.g. Review falling conversion rate"></label>' +
      '<div class="form-two-col"><label class="field">Issue type<select name="issue_type">' + ['manual','spend_spike','ctr_drop','cpc_increase','cpa_increase','roas_drop','budget_pacing','tracking_issue','creative_fatigue','conversion_drop','other'].map(x => '<option value="' + x + '" ' + (x === selectedType ? 'selected' : '') + '>' + x.replace(/_/g, ' ') + '</option>').join('') + '</select></label><label class="field">Priority<select name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div>' +
      '<label class="field">Recommended action<textarea name="recommended_action" rows="3" maxlength="3000" placeholder="What should be checked or tested next?">' + esc(opts.recommendation || '') + '</textarea></label>' +
      '<div class="form-two-col"><label class="field">Due date<input name="due_date" type="date"></label><label class="field">Evidence note <small>Optional</small><input name="evidence_note" placeholder="e.g. CPA +34% week over week"></label></div>' +
      '<div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary">Add to queue ↗</button></div></form>';
    showDialog('Create optimization task', content, async form => {
      const evidenceNote = String(form.get('evidence_note') || '').trim();
      const payload = {
        user_id: state.user.id,
        campaign_id: form.get('campaign_id'),
        title: String(form.get('title') || '').trim(),
        issue_type: form.get('issue_type'),
        priority: form.get('priority'),
        status: 'open',
        recommended_action: String(form.get('recommended_action') || '').trim() || null,
        due_date: form.get('due_date') || null,
        evidence: evidenceNote ? { note: evidenceNote, created_from_signal: opts.signalType || null } : (opts.signalType ? { signal_type: opts.signalType } : {})
      };
      if (payload.title.length < 3) throw new Error('Task title must be at least 3 characters.');
      const result = await sb.from('optimization_tasks').insert(payload);
      if (result.error) throw result.error;
      toast('Added to your optimization queue.', 'success');
      await loadData();
    }, 'DAILY DECISION SYSTEM');
  }

  function openExperimentModal() {
    if (!state.campaigns.length) { toast('Create a campaign before logging an experiment.', 'info'); return; }
    const content = '<form class="dialog-form"><p class="dialog-note">Write a hypothesis before testing and select one primary metric. A recorded variant is not a winner until the evidence supports it.</p>' +
      '<label class="field">Campaign<select name="campaign_id" required>' + campaignOptions(state.campaigns[0].campaign_id) + '</select></label>' +
      '<label class="field">Experiment name<input name="name" required maxlength="180" placeholder="e.g. Short hook vs. product-first hook"></label>' +
      '<label class="field">Hypothesis<textarea name="hypothesis" required rows="3" maxlength="2000" placeholder="I expect variant B to improve… because…"></textarea></label>' +
      '<div class="form-two-col"><label class="field">Test type<select name="experiment_type"><option value="creative">Creative</option><option value="audience">Audience</option><option value="offer">Offer</option><option value="landing_page">Landing page</option><option value="bidding">Bidding</option><option value="budget">Budget</option><option value="placement">Placement</option><option value="other">Other</option></select></label><label class="field">Primary metric<select name="primary_metric"><option value="cpa">CPA</option><option value="roas">ROAS</option><option value="ctr">CTR</option><option value="cpc">CPC</option><option value="conversion_rate">Conversion rate</option><option value="cpm">CPM</option><option value="conversions">Conversions</option><option value="other">Other</option></select></label></div>' +
      '<div class="form-two-col"><label class="field">Control / baseline label<input name="control_label" placeholder="Current creative"></label><label class="field">Variant label<input name="variant_label" placeholder="New creative"></label></div>' +
      '<div class="form-two-col"><label class="field">Start date<input name="start_date" type="date"></label><label class="field">End date<input name="end_date" type="date"></label></div>' +
      '<div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save experiment ↗</button></div></form>';
    showDialog('Log an experiment', content, async form => {
      const payload = {
        user_id: state.user.id,
        campaign_id: form.get('campaign_id'),
        name: String(form.get('name') || '').trim(),
        hypothesis: String(form.get('hypothesis') || '').trim(),
        experiment_type: form.get('experiment_type'),
        primary_metric: form.get('primary_metric'),
        control_label: String(form.get('control_label') || '').trim() || null,
        variant_label: String(form.get('variant_label') || '').trim() || null,
        start_date: form.get('start_date') || null,
        end_date: form.get('end_date') || null,
        status: 'planned'
      };
      if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) throw new Error('End date must be on or after the start date.');
      const result = await sb.from('experiments').insert(payload);
      if (result.error) throw result.error;
      toast('Experiment added to your learning log.', 'success');
      await loadData();
    }, 'CREATIVE LEARNING ENGINE');
  }

  function openHistoryModal(options) {
    const opts = options || {};
    if (!state.campaigns.length) { toast('Create a campaign before logging an optimization change.', 'info'); return; }
    const content = '<form class="dialog-form"><p class="dialog-note">Record what changed and the reason. Outcome comparisons help with learning, but do not prove that one change caused the result.</p>' +
      '<label class="field">Campaign<select name="campaign_id" required>' + campaignOptions(opts.campaignId || state.campaigns[0].campaign_id) + '</select></label>' +
      (opts.taskId ? '<input type="hidden" name="task_id" value="' + esc(opts.taskId) + '">' : '') +
      '<label class="field">What changed?<input name="description" required maxlength="2000" value="' + escapeAttr(opts.title || '') + '" placeholder="e.g. Replaced the opening hook in variant B"></label>' +
      '<div class="form-two-col"><label class="field">Change type<select name="action_type"><option value="other">Other</option><option value="budget_change">Budget change</option><option value="bid_change">Bid change</option><option value="targeting_change">Targeting change</option><option value="creative_change">Creative change</option><option value="tracking_fix">Tracking fix</option><option value="landing_page_change">Landing page change</option><option value="experiment">Experiment</option></select></label><label class="field">Outcome<select name="outcome"><option value="pending">Pending review</option><option value="improved">Improved</option><option value="declined">Declined</option><option value="neutral">Neutral</option><option value="inconclusive">Inconclusive</option></select></label></div>' +
      '<label class="field">Why was this change made?<textarea name="rationale" rows="2" placeholder="Evidence, reason, or hypothesis…"></textarea></label>' +
      '<div class="form-two-col"><label class="field">Before metrics <small>Optional, such as CPA or ROAS</small><input name="before_metrics" placeholder="CPA: 450, ROAS: 1.8"></label><label class="field">After metrics <small>Fill in when measured</small><input name="after_metrics" placeholder="CPA: 370, ROAS: 2.1"></label></div>' +
      '<label class="field">Outcome notes<textarea name="outcome_notes" rows="2" placeholder="What changed after review?"></textarea></label>' +
      '<div class="dialog-error"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save to memory ↗</button></div></form>';
    showDialog('Record an optimization change', content, async form => {
      function parseMetrics(value) {
        const object = {};
        String(value || '').split(',').forEach(part => {
          const pieces = part.split(':');
          if (pieces.length >= 2 && pieces[0].trim()) {
            const key = pieces[0].trim();
            const val = pieces.slice(1).join(':').trim();
            object[key] = val;
          }
        });
        return object;
      }
      const payload = {
        user_id: state.user.id,
        campaign_id: form.get('campaign_id'),
        task_id: form.get('task_id') || null,
        action_type: form.get('action_type'),
        description: String(form.get('description') || '').trim(),
        rationale: String(form.get('rationale') || '').trim() || null,
        before_metrics: parseMetrics(form.get('before_metrics')),
        after_metrics: parseMetrics(form.get('after_metrics')),
        outcome: form.get('outcome'),
        outcome_notes: String(form.get('outcome_notes') || '').trim() || null,
        reviewed_at: form.get('outcome') !== 'pending' ? new Date().toISOString() : null
      };
      if (payload.description.length < 3) throw new Error('Add a short description of the change.');
      const result = await sb.from('optimization_history').insert(payload);
      if (result.error) throw result.error;
      toast('Optimization history saved.', 'success');
      await loadData();
    }, 'OPTIMIZATION MEMORY');
  }

  async function submitUtm(event) {
    event.preventDefault();
    if (state.previewMode) { toast('Dashboard preview: saving tracking links is paused until sign-in is restored.', 'info'); return; }
    const values = currentUtmValues();
    if (!values.destination_url || !values.utm_source || !values.utm_medium || !values.utm_campaign) {
      toast('Fill in the URL, source, medium and campaign name first.', 'error');
      return;
    }
    if (!makePreviewUrl()) { toast('Enter a valid destination URL.', 'error'); return; }
    const payload = {
      user_id: state.user.id,
      campaign_id: values.campaign_id,
      destination_url: values.destination_url,
      utm_source: values.utm_source,
      utm_medium: values.utm_medium,
      utm_campaign: values.utm_campaign,
      utm_term: values.utm_term || null,
      utm_content: values.utm_content || null,
      notes: null
    };
    const button = $('#utm-form').querySelector('[type="submit"]');
    const prior = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const result = await sb.from('tracking_links').insert(payload);
      if (result.error) throw result.error;
      toast('UTM link saved to your library.', 'success');
      await loadData();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = prior;
    }
  }

  async function updateTaskStatus(id, status) {
    if (state.previewMode) { toast('Dashboard preview: task changes are paused until sign-in is restored.', 'info'); return; }
    const payload = { status };
    if (status === 'done' || status === 'dismissed') payload.resolved_at = new Date().toISOString();
    else payload.resolved_at = null;
    const result = await sb.from('optimization_tasks').update(payload).eq('id', id);
    if (result.error) { toast(errorMessage(result.error), 'error'); return; }
    toast('Task status updated.', 'success');
    await loadData();
  }

  async function advanceExperiment(id, status) {
    if (state.previewMode) { toast('Dashboard preview: experiment changes are paused until sign-in is restored.', 'info'); return; }
    const next = status === 'planned' ? 'running' : status === 'running' ? 'completed' : null;
    if (!next) { toast('This experiment is already marked as ' + status + '.', 'info'); return; }
    const patch = { status: next };
    if (next === 'completed' && !state.experiments.find(e => e.id === id)?.end_date) patch.end_date = dateOnly(new Date());
    const result = await sb.from('experiments').update(patch).eq('id', id);
    if (result.error) { toast(errorMessage(result.error), 'error'); return; }
    toast('Experiment status changed to ' + next + '.', 'success');
    await loadData();
  }

  async function copyText(value) {
    if (!value) { toast('There is no link to copy yet.', 'info'); return; }
    try {
      await navigator.clipboard.writeText(value);
      toast('Copied to clipboard.', 'success');
    } catch (error) {
      const node = document.createElement('textarea');
      node.value = value;
      document.body.appendChild(node);
      node.select();
      const success = document.execCommand('copy');
      node.remove();
      toast(success ? 'Copied to clipboard.' : 'Copy failed. Select the URL and copy it manually.', success ? 'success' : 'error');
    }
  }


  async function secureFunctionCall(functionName, body) {
    if (!sb || !state.user || state.previewMode) throw new Error('Sign in to your private AdPulse workspace first.');
    const sessionResult = await sb.auth.getSession();
    const session = sessionResult.data && sessionResult.data.session;
    if (sessionResult.error || !session) throw new Error('Your session expired. Sign in again.');
    const response = await fetch(SUPABASE_URL + '/functions/v1/' + functionName, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': 'Bearer ' + session.access_token
      },
      cache: 'no-store',
      body: JSON.stringify(body || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      let message = payload.message || ('Server request failed with status ' + response.status + '.');
      if (Array.isArray(payload.missing_secrets) && payload.missing_secrets.length) {
        message += ' Missing server secrets: ' + payload.missing_secrets.join(', ') + '.';
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function renderGoogleAdsAccountOptions(ids) {
    const select = $('#agent-allowed-customer-ids');
    if (!select) return;
    const selected = new Set(Array.from(select.selectedOptions || []).map(option => option.value));
    state.googleAdsAccountIds = Array.from(new Set((ids || []).map(id => String(id))));
    if (!state.googleAdsAccountIds.length) {
      select.innerHTML = '<option disabled value="">No accessible customer IDs loaded yet</option>';
      return;
    }
    select.innerHTML = state.googleAdsAccountIds.map(id =>
      '<option value="' + esc(id) + '"' + (selected.has(id) ? ' selected' : '') + '>' + esc(id) + '</option>'
    ).join('');
  }

  async function refreshGoogleAdsStatus() {
    const stateNode = $('#google-ads-connection-state');
    const detailNode = $('#google-ads-connection-detail');
    const noticeNode = $('#google-ads-setup-notice');
    if (!stateNode || !state.user || state.previewMode) return;
    stateNode.textContent = 'Checking secure server configuration…';
    setMessage(noticeNode, '', '');
    try {
      const status = await secureFunctionCall('google-ads-gateway', { action: 'connection_status' });
      stateNode.textContent = status.connected ? 'Google Ads OAuth connected' : 'Google Ads not connected yet';
      detailNode.textContent = status.connected
        ? 'Connection saved on the server. Last successful API check: ' + (status.last_api_call_at ? new Date(status.last_api_call_at).toLocaleString() : 'not yet') + '. API version ' + (status.api_version || 'v26') + '.'
        : 'Connect your Google account using the server OAuth flow. Google consent will be handled by Google.';
      if (status.missing_secrets && status.missing_secrets.length) {
        setMessage(noticeNode, 'Supabase Edge Function Secrets still need: ' + status.missing_secrets.join(', ') + '. Values must be entered in Supabase, never GitHub.', 'error');
      } else {
        setMessage(noticeNode, status.connected ? 'Server configuration looks complete. You can load accounts and create scoped agent keys.' : 'Server configuration looks complete. Use Connect Google Ads to grant consent.', 'info');
      }
      if (status.connected && status.configured) {
        try {
          const accounts = await secureFunctionCall('google-ads-gateway', { action: 'list_accounts' });
          renderGoogleAdsAccountOptions(accounts.customer_ids || []);
          const list = $('#google-ads-account-list');
          list.innerHTML = accounts.customer_ids && accounts.customer_ids.length
            ? accounts.customer_ids.map(id => '<div class="saved-link-item"><b>Customer ID</b><code>' + esc(id) + '</code></div>').join('')
            : '<div class="empty-state compact"><b>No customer IDs returned</b><p>Confirm the connected Google account has Google Ads access and that the developer token is enabled.</p></div>';
        } catch (error) {
          setMessage(noticeNode, error.message || 'Could not read Google Ads accounts.', 'error');
        }
      } else {
        renderGoogleAdsAccountOptions([]);
        $('#google-ads-account-list').innerHTML = '<div class="empty-state compact"><b>Accounts are not ready</b><p>Complete server configuration and connect Google Ads, then refresh this page.</p></div>';
      }
    } catch (error) {
      stateNode.textContent = 'Could not check server status';
      detailNode.textContent = error.message || 'The Google Ads gateway did not respond.';
      setMessage(noticeNode, error.message || 'Could not check setup.', 'error');
    }
  }

  async function connectGoogleAds() {
    try {
      const result = await secureFunctionCall('google-ads-connect', { action: 'start' });
      if (!result.authorization_url) throw new Error('The server did not return a Google consent link.');
      window.location.assign(result.authorization_url);
    } catch (error) {
      setMessage($('#google-ads-setup-notice'), error.message || 'Could not begin Google Ads connection.', 'error');
      toast(error.message || 'Could not begin Google Ads connection.', 'error');
    }
  }

  function handleGoogleAdsCallback() {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('google_ads');
    if (!result) return;
    url.searchParams.delete('google_ads');
    window.history.replaceState({}, '', url.pathname + url.hash);
    navigate('integrations');
    const messages = {
      connected: 'Google Ads authorization was saved securely. Check the status and load account IDs.',
      denied: 'Google authorization was canceled. No new connection was saved.',
      server_setup_missing: 'The server is missing required OAuth or token-encryption secrets. Add them in Supabase Edge Function Secrets.',
      state_invalid: 'The Google connection request expired or was already used. Start Connect Google Ads again.',
      token_exchange_failed: 'Google did not return a refresh token. Check OAuth client settings and the exact redirect URI, then reconnect.',
      ads_scope_missing: 'Google Ads permission was not granted. Reconnect and approve the Google Ads scope.',
      secure_storage_failed: 'The server could not securely store the Google connection.',
      callback_failed: 'Google Ads connection failed on the server. Check the Edge Function logs.'
    };
    const message = messages[result] || 'Google Ads connection result: ' + result;
    toast(message, result === 'connected' ? 'success' : 'error');
    setMessage($('#google-ads-setup-notice'), message, result === 'connected' ? 'info' : 'error');
    refreshGoogleAdsStatus();
  }

  async function refreshAgentTokens() {
    const host = $('#agent-tokens-list');
    if (!host || !state.user || state.previewMode) return;
    host.innerHTML = '<div class="empty-state compact"><p>Loading agent keys…</p></div>';
    try {
      const result = await secureFunctionCall('google-ads-agent-tokens', { action: 'list' });
      state.agentTokens = result.tokens || [];
      if (!state.agentTokens.length) {
        host.innerHTML = '<div class="empty-state compact"><b>No agent keys issued</b><p>Create one above and copy the raw key at creation time.</p></div>';
        return;
      }
      host.innerHTML = state.agentTokens.map(token => {
        const expired = Date.parse(token.expires_at) <= Date.now();
        const revoked = !!token.revoked_at;
        const status = revoked ? 'Revoked' : expired ? 'Expired' : 'Active';
        return '<article class="saved-link-item">' +
          '<div><b>' + esc(token.label) + '</b><small>' + esc(status) + ' · expires ' + esc(new Date(token.expires_at).toLocaleDateString()) + '</small></div>' +
          '<p><b>Permissions:</b> ' + esc((token.scopes || []).join(', ')) + '</p>' +
          '<p><b>Allowed accounts:</b> ' + esc((token.allowed_customer_ids || []).join(', ')) + '</p>' +
          '<p><b>Last used:</b> ' + esc(token.last_used_at ? new Date(token.last_used_at).toLocaleString() : 'Never') + '</p>' +
          (!revoked && !expired ? '<button class="btn btn-secondary" type="button" data-action="revoke-agent-token" data-id="' + esc(token.id) + '">Revoke key</button>' : '') +
          '</article>';
      }).join('');
    } catch (error) {
      host.innerHTML = '<div class="empty-state compact"><b>Could not load agent keys</b><p>' + esc(error.message || 'Request failed.') + '</p></div>';
    }
  }

  async function createAgentToken() {
    const label = $('#agent-token-label').value.trim();
    const scopes = [
      $('#agent-scope-accounts').checked ? 'accounts.read' : null,
      $('#agent-scope-ads').checked ? 'ads.read' : null,
      $('#agent-scope-campaigns').checked ? 'campaigns.read' : null
    ].filter(Boolean);
    const allowedCustomerIds = Array.from($('#agent-allowed-customer-ids').selectedOptions || []).map(option => option.value).filter(id => /^\d{10}$/.test(id));
    const days = Number($('#agent-token-days').value || 30);
    const resultNode = $('#agent-token-result');
    const messageNode = $('#agent-token-message');
    resultNode.classList.add('hidden');
    setMessage(messageNode, 'Creating a restricted token…', 'info');
    try {
      const result = await secureFunctionCall('google-ads-agent-tokens', {
        action: 'create',
        label,
        scopes,
        allowed_customer_ids: allowedCustomerIds,
        expires_in_days: days
      });
      $('#agent-token-value').value = result.token;
      resultNode.classList.remove('hidden');
      setMessage(messageNode, 'Agent key created. Copy it now; the server stores only its hash.', 'info');
      toast('Restricted agent key created.', 'success');
      await refreshAgentTokens();
    } catch (error) {
      setMessage(messageNode, error.message || 'Could not create agent key.', 'error');
    }
  }

  async function revokeAgentToken(id) {
    if (!id || !window.confirm('Revoke this AI agent key now? Any agent using it will lose gateway access.')) return;
    try {
      const result = await secureFunctionCall('google-ads-agent-tokens', { action: 'revoke', id });
      toast(result.revoked ? 'Agent key revoked.' : 'The key was already revoked or could not be found.', result.revoked ? 'success' : 'info');
      await refreshAgentTokens();
    } catch (error) {
      toast(error.message || 'Could not revoke agent key.', 'error');
    }
  }

  function handleAction(button) {
    const action = button.dataset.action;
    if (state.previewMode && !['copy-link', 'download-metrics-template', 'load-demo-workspace', 'clear-demo-workspace'].includes(action)) {
      toast('Preview mode keeps account data and saves disabled. Use the demo workspace to explore the dashboard.', 'info');
      return;
    }
    const id = button.dataset.id;
    if (action === 'load-demo-workspace') loadDemoWorkspace();
    if (action === 'clear-demo-workspace') clearDemoWorkspace();
    if (action === 'new-campaign') openCampaignModal();
    if (action === 'download-metrics-template') downloadMetricsTemplate();
    if (action === 'import-metrics') $('#metrics-csv-input').click();
    if (action === 'export-metrics') exportMetricsCsv();
    if (action === 'new-metric') openMetricModal(id || null);
    if (action === 'targets') openTargetsModal(id);
    if (action === 'new-task') openTaskModal();
    if (action === 'task-from-signal') openTaskModal({
      campaignId: id,
      signalType: button.dataset.signal,
      title: button.dataset.title,
      recommendation: button.dataset.recommendation
    });
    if (action === 'new-experiment') openExperimentModal();
    if (action === 'new-history') openHistoryModal({ campaignId: id || null, taskId: button.dataset.taskId || null, title: button.dataset.title || '' });
    if (action === 'copy-link') copyText(button.dataset.url || '');
    if (action === 'advance-experiment') advanceExperiment(id, button.dataset.status);
    if (action === 'refresh-google-ads') refreshGoogleAdsStatus();
    if (action === 'connect-google-ads') connectGoogleAds();
    if (action === 'list-agent-tokens') refreshAgentTokens();
    if (action === 'create-agent-token') createAgentToken();
    if (action === 'copy-agent-token') copyText($('#agent-token-value').value);
    if (action === 'revoke-agent-token') revokeAgentToken(id);
  }

  function bindEvents() {
    $('#auth-form').addEventListener('submit', event => {
      if (SERVER_AUTH_GATE_MODE) { handleSecureGateLogin(event); return; }
      handleAuthSubmit(event);
    });
    $('#agent-token-form').addEventListener('submit', event => {
      event.preventDefault();
      createAgentToken();
    });
    $('#auth-toggle').addEventListener('click', () => showAuthMode(state.authMode === 'signup' ? 'signin' : 'signup'));
    $('#forgot-password').addEventListener('click', () => showAuthMode('reset'));
    $('#resend-confirmation').addEventListener('click', async () => {
      const button = $('#resend-confirmation');
      button.disabled = true;
      setMessage($('#auth-message'), 'Sending confirmation email…', 'info');
      try {
        const result = await sb.auth.resend({
          type: 'signup',
          email: $('#auth-email').value.trim().toLowerCase(),
          options: { emailRedirectTo: AUTH_REDIRECT_URL }
        });
        if (result.error) throw result.error;
        setMessage($('#auth-message'), 'If the account still needs confirmation, a new link has been sent to ' + $('#auth-email').value.trim().toLowerCase() + '. Check Inbox and Spam.', 'info');
      } catch (error) {
        setMessage($('#auth-message'), errorMessage(error), 'error');
      } finally {
        button.disabled = false;
      }
    });
    $('#refresh-button').addEventListener('click', loadData);
    $('#refresh-signals').addEventListener('click', async () => { await loadData(); if (!state.previewMode) toast('Diagnostics refreshed.', 'success'); });
    $('#signout-button').addEventListener('click', async () => {
      if (state.previewMode) {
        state.previewEmail = '';
        state.user = null;
        configurePreviewLogin();
        toast('Signed out. Enter your email and solve a new addition question next time.', 'info');
        return;
      }
      const result = await sb.auth.signOut();
      if (result.error) toast(errorMessage(result.error), 'error');
      else toast('Signed out.', 'success');
    });
    $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#profile-button').addEventListener('click', () => toast(state.user ? state.user.email : state.previewEmail ? 'Preview email: ' + state.previewEmail + ' (not verified)' : 'No signed-in user', 'info'));
    $('#overview-range').addEventListener('change', event => {
      state.range = Number(event.target.value) || 14;
      renderOverview();
      renderCampaigns();
    });
    $('#campaign-search').addEventListener('input', renderCampaigns);
    $('#metrics-csv-input').addEventListener('change', handleMetricsCsvFileChange);
    $('#campaign-status-filter').addEventListener('change', renderCampaigns);
    $('#utm-form').addEventListener('submit', submitUtm);
    ['#utm-url','#utm-source','#utm-medium','#utm-campaign','#utm-term','#utm-content'].forEach(selector => $(selector).addEventListener('input', makePreviewUrl));
    $('#copy-utm').addEventListener('click', () => copyText(makePreviewUrl()));

    document.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) {
        event.preventDefault();
        navigate(viewButton.dataset.view);
        return;
      }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        event.preventDefault();
        handleAction(actionButton);
        return;
      }
      if (!event.target.closest('.sidebar') && !event.target.closest('#mobile-menu')) closeSidebar();
    });

    document.addEventListener('change', event => {
      const target = event.target;
      if (target.matches('[data-task-status]')) updateTaskStatus(target.dataset.taskStatus, target.value);
    });

    $('#task-tabs').addEventListener('click', event => {
      const button = event.target.closest('[data-task-filter]');
      if (!button) return;
      state.taskFilter = button.dataset.taskFilter;
      $$('[data-task-filter]', $('#task-tabs')).forEach(b => b.classList.toggle('active', b === button));
      renderTasks();
    });

    $('.dialog-close', $('#app-dialog')).addEventListener('click', () => $('#app-dialog').close());
    $('#app-dialog').addEventListener('click', event => {
      if (event.target === $('#app-dialog')) $('#app-dialog').close();
    });
  }

  async function boot() {
    if (!sb) {
      $('#auth-screen').classList.remove('hidden');
      $('#app-shell').classList.add('hidden');
      setMessage($('#auth-message'), 'Could not initialize the Supabase client. Refresh the page and try again.', 'error');
      return;
    }

    bindEvents();
    if (SERVER_AUTH_GATE_MODE) {
      state.previewMode = false;
      state.user = null;
      state.previewEmail = '';
      sb.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          configureSecureGateLogin();
          setMessage($('#auth-message'), 'Password recovery is disabled for this testing gate. Use the fixed access password and confirmation code.', 'info');
          return;
        }
        window.setTimeout(() => setSession(session), 0);
      });
      const { data, error } = await sb.auth.getSession();
      if (error) toast('Could not restore the saved session. Please sign in again.', 'error');
      if (data && data.session) {
        await setSession(data.session);
      } else {
        configureSecureGateLogin();
      }
      return;
    }

    const recoveryRedirect = /(?:[?#&])type=recovery(?:[&#]|$)/i.test(window.location.href);
    showAuthMode(recoveryRedirect ? 'update_password' : 'signin');
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        showAuthMode('update_password');
        $('#auth-screen').classList.remove('hidden');
        $('#app-shell').classList.add('hidden');
        return;
      }
      window.setTimeout(() => setSession(session), 0);
    });
    const { data, error } = await sb.auth.getSession();
    if (error) toast(errorMessage(error), 'error');
    await setSession(data ? data.session : null);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();