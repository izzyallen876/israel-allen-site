/* Runs before the page paints so the saved theme never flashes.
   Stores one value, "ia-theme" (light or dark), in this browser only. */
(function () {
  document.documentElement.classList.add('js');
  try {
    var t = localStorage.getItem('ia-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
