/* Shared presentation and accessible bookmark navigation. Data remains read-only. */
(() => {
  'use strict';
  let currentBookmarks = [];
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const safeLink = value => {
    try { const url = new URL(String(value).trim()); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const groups = [
    { id: 'main-site-links', sections: ['MAIN SITE', 'MAINSITE'] },
    { id: 'historical-event-links', sections: ['MAJOR ACTIVITIES', 'HISTORICAL EVENT'] },
  ];
  function renderLinks() {
    for (const group of groups) {
      const container = document.getElementById(group.id);
      if (!container) continue;
      const rows = currentBookmarks.filter(row => group.sections.includes(normalize(row.section)))
        .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999));
      container.replaceChildren();
      for (const row of rows) {
        const href = safeLink(row.url);
        const item = document.createElement(href ? 'a' : 'span');
        item.className = 'site-menu-link';
        item.textContent = String(row.name || '').trim();
        if (href) {
          item.href = href;
          if (new URL(href).origin !== location.origin) {
            item.target = '_blank'; item.rel = 'noopener noreferrer';
          }
        } else {
          item.classList.add('site-menu-link--disabled');
          item.setAttribute('aria-disabled', 'true');
          item.title = 'Link not configured in the reference sheet';
        }
        container.appendChild(item);
      }
      if (!rows.length) {
        const empty = document.createElement('span');
        empty.className = 'site-menu-empty'; empty.textContent = 'Reference links unavailable';
        container.appendChild(empty);
      }
    }
  }
  function closeDropdowns(except) {
    document.querySelectorAll('.site-dropdown-toggle').forEach(button => {
      if (button === except) return;
      button.setAttribute('aria-expanded', 'false');
      document.getElementById(button.getAttribute('aria-controls')).hidden = true;
    });
  }
  function toggleDropdown(button, force) {
    const open = force ?? button.getAttribute('aria-expanded') !== 'true';
    closeDropdowns(button);
    button.setAttribute('aria-expanded', String(open));
    document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
  }
  async function loadBookmarks() {
    try {
      const result = await PublicData.readTable('main', { sheetName: 'BOOKMARKS' });
      const headers = result.table.cols.map(column => normalize(column.label));
      const field = (cells, name, fallback) => {
        const index = headers.indexOf(name);
        const cell = cells[index < 0 ? fallback : index];
        return cell?.f ?? cell?.v ?? '';
      };
      currentBookmarks = result.table.rows.map(row => ({
        section: field(row.c, 'SECTION', 0), name: field(row.c, 'NAME', 1),
        url: field(row.c, 'URL', 2), order: field(row.c, 'ORDER', 3),
      }));
      renderLinks();
    } catch { renderLinks(); }
  }
  function initialise() {
    const header = document.querySelector('.site-header');
    const mobileButton = document.getElementById('site-menu-toggle');
    mobileButton.addEventListener('click', () => {
      const open = mobileButton.getAttribute('aria-expanded') !== 'true';
      mobileButton.setAttribute('aria-expanded', String(open));
      mobileButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      header.classList.toggle('site-header--open', open);
      if (!open) closeDropdowns();
    });
    header.querySelectorAll('.site-dropdown-toggle').forEach(button => {
      button.addEventListener('click', () => toggleDropdown(button));
      button.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault(); toggleDropdown(button, true);
        document.getElementById(button.getAttribute('aria-controls')).querySelector('a')?.focus();
      });
    });
    document.addEventListener('click', event => {
      if (!header.contains(event.target)) closeDropdowns();
      if (event.target.closest('.site-menu-link[href]')) {
        closeDropdowns(); mobileButton.setAttribute('aria-expanded', 'false');
        mobileButton.setAttribute('aria-label', 'Open navigation');
        header.classList.remove('site-header--open');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const open = header.querySelector('.site-dropdown-toggle[aria-expanded="true"]');
      if (open) { closeDropdowns(); open.focus(); }
      else if (mobileButton.getAttribute('aria-expanded') === 'true') {
        mobileButton.click(); mobileButton.focus();
      }
    });
    if (document.body.dataset.page !== 'overview') {
      loadBookmarks();
      window.setInterval(loadBookmarks, 60000);
    }
  }
  window.SiteTheme = Object.freeze({ setBookmarks(rows) { currentBookmarks = rows; renderLinks(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
