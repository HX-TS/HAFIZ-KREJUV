/* Owner-private GA4 reports. Basic consent: no Google tag before opt-in. */
(() => {
  'use strict';
  const ID = 'G-5B6JH0FLJR';
  const KEY = 'krejuv-fec-analytics-consent-v1';
  const COOKIE_PATH = '/HAFIZ-KREJUV/';
  let preference = '';
  let loaded = false;
  const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  const denied = { analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied' };
  try { preference = localStorage.getItem(KEY) || ''; } catch {}
  const safeURL = value => {
    try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.origin + url.pathname : ''; }
    catch { return ''; }
  };
  function loadAnalytics() {
    if (loaded || privacySignal || preference !== 'granted') return;
    loaded = true;
    window['ga-disable-' + ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    const page = { page_location: location.origin + location.pathname,
      page_referrer: safeURL(document.referrer), page_title: document.title };
    window.gtag('set',page);
    window.gtag('set','ads_data_redaction',true);
    window.gtag('consent','default',denied);
    window.gtag('consent','update',{ ...denied, analytics_storage:'granted' });
    window.gtag('js',new Date());
    window.gtag('config',ID,{ ...page, send_page_view:false,
      allow_google_signals:false, allow_ad_personalization_signals:false,
      cookie_prefix:'krejuv_fec', cookie_path:COOKIE_PATH, cookie_domain:'none' });
    window.gtag('event','page_view',{ ...page, send_to:ID });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    tag.referrerPolicy = 'no-referrer';
    document.head.appendChild(tag);
  }
  function clearAnalyticsCookies() {
    document.cookie.split(';').forEach(part => {
      const name = part.split('=')[0].trim();
      if (!name.startsWith('krejuv_fec')) return;
      document.cookie = name + '=; Max-Age=0; Path=' + COOKIE_PATH + '; Secure; SameSite=Lax';
    });
  }
  function setPreference(value) {
    const wasLoaded = loaded;
    preference = value;
    try { localStorage.setItem(KEY,value); } catch {}
    document.getElementById('analytics-preferences').hidden = true;
    if (value === 'granted') loadAnalytics();
    else {
      window['ga-disable-' + ID] = true;
      clearAnalyticsCookies();
      if (wasLoaded) location.reload(); // Removes the loaded tag after withdrawal.
    }
  }
  function initialise() {
    const panel = document.createElement('aside');
    panel.id = 'analytics-preferences';
    panel.className = 'analytics-preferences';
    panel.setAttribute('aria-label','Analytics preferences');
    panel.hidden = true;
    panel.innerHTML = '<h2>Optional analytics</h2>' +
      '<p>Google Analytics helps the site owner understand visits, approximate location, and browser/device types. Reports are private to authorised account users.</p>' +
      '<p class="analytics-preferences__state"></p>' +
      '<div class="analytics-preferences__actions"><button type="button" id="analytics-allow">Accept analytics</button>' +
      '<button type="button" id="analytics-decline">Decline</button></div>';
    document.body.appendChild(panel);
    const state = panel.querySelector('.analytics-preferences__state');
    const allow = document.getElementById('analytics-allow');
    const updateState = () => {
      allow.disabled = privacySignal;
      state.textContent = privacySignal ? 'Your browser requests privacy protection. Analytics stays off.'
        : preference === 'granted' ? 'Analytics is currently on. You can change this at any time.'
        : 'The website works with analytics off. You can change this using Analytics settings.';
    };
    allow.addEventListener('click',() => setPreference('granted'));
    document.getElementById('analytics-decline').addEventListener('click',() => setPreference('denied'));
    const footer = document.querySelector('footer.footer, .footer-note');
    if (footer) {
      footer.classList.add('analytics-footer');
      const settings = document.createElement('button');
      settings.type = 'button'; settings.className = 'analytics-settings';
      settings.textContent = 'Analytics settings';
      settings.addEventListener('click',() => { updateState(); panel.hidden = false; allow.disabled ? document.getElementById('analytics-decline').focus() : allow.focus(); });
      footer.appendChild(settings);
    }
    updateState();
    if (privacySignal) window['ga-disable-' + ID] = true;
    else if (preference === 'granted') loadAnalytics();
    else if (preference !== 'denied') panel.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();
})();
