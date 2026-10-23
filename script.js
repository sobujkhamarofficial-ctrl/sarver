(() => {
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const dialog = document.querySelector('.product-dialog');
  const dialogTitle = document.querySelector('#dialog-title');
  const closeDialog = document.querySelector('.dialog-close');
  const contactLink = document.querySelector('.dialog-contact');

  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();

  menuToggle?.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন');
  });

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuToggle?.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('.product-card').forEach((card) => {
    const button = card.querySelector('.product-link');
    button?.addEventListener('click', () => {
      if (!dialog || !dialogTitle) return;
      dialogTitle.textContent = card.dataset.product || 'Product information';
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else window.location.hash = 'contact';
    });
  });

  closeDialog?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  contactLink?.addEventListener('click', () => dialog?.close());
})();