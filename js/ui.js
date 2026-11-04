/**
 * UTILITAS TAMPILAN: escape HTML, notifikasi (toast), dan dialog konfirmasi.
 */
(function () {
  const ui = {
    esc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    toast(message, type = 'info') {
      const host = document.getElementById('toastHost');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'toast toast-' + type;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      el.textContent = message;
      while (host.children.length >= 3) host.firstChild.remove();
      host.appendChild(el);
      setTimeout(() => {
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 300);
      }, type === 'error' ? 6000 : 4200);
    },

    confirm(title, message, okLabel = 'Ya, lanjutkan') {
      return new Promise((resolve) => {
        const wrap = document.createElement('div');
        wrap.className = 'modal-backdrop';
        wrap.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cfTitle">
            <h3 id="cfTitle">${ui.esc(title)}</h3>
            <p>${ui.esc(message)}</p>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" data-v="0">Batal</button>
              <button type="button" class="btn btn-danger" data-v="1">${ui.esc(okLabel)}</button>
            </div>
          </div>`;
        const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
        const onKey = (e) => { if (e.key === 'Escape') done(false); };
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-v]');
          if (b) done(b.dataset.v === '1');
          else if (e.target === wrap) done(false);
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        wrap.querySelector('[data-v="1"]').focus();
      });
    },

    modal(html) {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `<div class="modal modal-lg" role="dialog" aria-modal="true">${html}</div>`;
      const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) close();
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      const first = wrap.querySelector('[data-close]');
      if (first) first.focus();
      return close;
    }
  };

  window.SW = window.SW || {};
  SW.ui = ui;
})();
